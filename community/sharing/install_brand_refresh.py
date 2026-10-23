"""Guarded installer for reviewed public Kapukai sharing metadata."""
from pathlib import Path
import concurrent.futures, hashlib, json, os, tempfile, urllib.request, urllib.parse, fcntl
"""Bounded public sharing metadata update; never changes body content."""
import re,html
from html.parser import HTMLParser
class Attributes(HTMLParser):
 def __init__(self):super().__init__();self.attrs={}
 def handle_starttag(self,tag,attrs):self.attrs=dict(attrs)
def apply(source, entry):
 match=re.search(r'<head\b[^>]*>(.*?)</head\s*>',source,re.I|re.S)
 if not match:raise ValueError('No HTML head')
 head=match.group(1)
 def retain(m):
  p=Attributes();p.feed(m.group(0));a=p.attrs
  key=a.get('property',a.get('name','')).lower()
  return '' if key.startswith('og:') or key.startswith('twitter:') else m.group(0)
 head=re.sub(r'<meta\b[^>]*>',retain,head,flags=re.I)
 esc=lambda s:html.escape(s,quote=True)
 tags=[]
 for kind,key,value in [
 ('property','og:type','website'),('property','og:site_name','Kapukai Governance Lab'),
 ('property','og:title',entry['title']),('property','og:description',entry['description']),
 ('property','og:url',entry['url']),('property','og:image',entry['image']),
 ('property','og:image:alt',entry['image_alt']),('name','twitter:card','summary_large_image'),
 ('name','twitter:title',entry['title']),('name','twitter:description',entry['description']),
 ('name','twitter:image',entry['image'])]:
  tags.append('<meta '+kind+'="'+key+'" content="'+esc(value)+'">')
 if entry.get('generated'):
  tags.extend(['<meta property="og:image:width" content="1200">','<meta property="og:image:height" content="630">','<meta property="og:image:type" content="image/jpeg">'])
 if not re.search(r'rel=[\"\'][^\"\']*\bicon\b',head,re.I):
  tags.append('<link rel="icon" type="image/png" href="https://kapukai.org/share-cards/v1/gold-k.png">')
 if 'apple-touch-icon' not in head.lower():
  tags.append('<link rel="apple-touch-icon" href="https://kapukai.org/share-cards/v1/gold-k.png">')
 return source[:match.start(1)]+'\n'+'\n'.join(tags)+'\n'+head+source[match.end(1):]

MANIFEST = {'pages': [{'url': 'https://kapukai.org/standards/authority-circuit/', 'title': 'Authority Circuit Architecture', 'description': 'A working architecture for source authority, decision evidence and verified correction.', 'stage': 'Research framework', 'image': 'https://kapukai.org/share-cards/v2/authority-circuit.jpg', 'image_alt': 'Kapukai gold K square. Authority Circuit Architecture', 'generated': True}, {'url': 'https://kapukai.org/observable/', 'title': 'Observable Standard', 'description': 'Read proposed requirements for observing, reviewing and correcting consequential systems.', 'stage': 'Research framework', 'image': 'https://kapukai.org/share-cards/v2/observable-standard.jpg', 'image_alt': 'Kapukai gold K square. Observable Standard', 'generated': True}, {'url': 'https://kapukai.org/standards/', 'title': 'Standards Directory', 'description': 'Browse the wider standards library and related technical proposals.', 'stage': 'Research framework', 'image': 'https://kapukai.org/share-cards/v2/standards-directory.jpg', 'image_alt': 'Kapukai gold K square. Standards Directory', 'generated': True}, {'url': 'https://kapukai.org/first-circle/', 'title': 'The First Circle', 'description': 'Learn, discuss, and explore human-centered governance.', 'stage': 'Learning', 'image': 'https://kapukai.org/share-cards/v2/first-circle.jpg', 'image_alt': 'Kapukai gold K square. The First Circle', 'generated': True}], 'assets': [{'path': 'community/public/share-cards/v2/authority-circuit.jpg', 'sha256': '1b7c8265af7c9e7af5377f55ee3fc7e088c9030570b06c2c0d4359f216c48145'}, {'path': 'community/public/share-cards/v2/observable-standard.jpg', 'sha256': '3c91e9f56120d88f8464510ac55cae7344d0bc30e5b7150410a03742df7d236c'}, {'path': 'community/public/share-cards/v2/standards-directory.jpg', 'sha256': '1bf32da303e4bdc4f326b0fb1970e5dce9c8c40e333ec4c31477fb7f33e27916'}, {'path': 'community/public/share-cards/v2/first-circle.jpg', 'sha256': 'cbbeb13876610ae11e2ea866179a6d1a7bf096f3036e9a37a621107ae3a38006'}]}
BASE = 'https://kapukai-community-aqjygnuqk-kapukais-projects.vercel.app/'
COMMIT = '4e0c9ab264441229950ddd3c2a3ba880bced1577'
ROOT = Path('/var/www/kapukai.org/public_html')
sha = lambda b: hashlib.sha256(b).hexdigest()
def download(url):
 with urllib.request.urlopen(url,timeout=25) as response:
  return response.read(),response.geturl(),response.headers.get('Content-Type','')
def candidate_files(path):
 rel=urllib.parse.unquote(path).lstrip('/')
 if '..' in Path(rel).parts:return []
 p=ROOT/rel
 possibilities=[p,p/'index.html',Path(str(p)+'.html')]
 return [x for x in possibilities if x.is_file() and x.suffix=='.html' and not x.is_symlink() and x.resolve().is_relative_to(ROOT.resolve())]
def plan_page(entry):
 url=entry['url']
 if urllib.parse.urlsplit(url).netloc!='kapukai.org':return None,{'url':url,'status':'separate Vercel host; source metadata deployed'}
 try:
  live,final,ctype=download(url)
  if urllib.parse.urlsplit(final).netloc not in ['kapukai.org','www.kapukai.org']:
   return None,{'url':url,'status':'SKIPPED: redirects to another host'}
  if 'text/html' not in ctype:raise ValueError('Not an HTML response')
  choices=candidate_files(urllib.parse.urlsplit(final).path)
  matching=[p for p in choices if p.read_bytes()==live]
  if len(matching)!=1:return None,{'url':url,'status':'SKIPPED: no unique local file matching public response'}
  p=matching[0];source=live.decode('utf-8');new=apply(source,entry).encode('utf-8')
  body=re.search(r'<body\b',source,re.I)
  if body:
   changed=new.decode('utf-8');b2=re.search(r'<body\b',changed,re.I)
   if source[body.start():]!=changed[b2.start():]:raise ValueError('Body preservation failed')
  return (p,live,new),{'url':url,'status':'planned','path':str(p.relative_to(ROOT))}
 except Exception as error:return None,{'url':url,'status':'SKIPPED: '+str(error)}
def main():
 if not ROOT.is_dir() or not (ROOT/'index.html').is_file():
  raise SystemExit('STOP: Run inside your kapukai server session, at root@kapukai.')
 with open('/root/.kapukai-sharing-install.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  backup=Path(tempfile.mkdtemp(prefix='kapukai-brand-backup-',dir='/root'))
  print('Checking public pages. This can take a few minutes.',flush=True)
  plans=[];report=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
   for plan,result in pool.map(plan_page,MANIFEST['pages']):
    report.append(result)
    if plan:plans.append(plan)
  if len(plans)!=len(MANIFEST['pages']):
   for item in report: print(item)
   raise SystemExit('STOP: All four public pages must match local files before any update.')
  assets=[]
  def get_asset(a):
   rel=a['path'].removeprefix('community/public/')
   data,_,_=download(BASE+rel)
   if sha(data)!=a['sha256']:raise ValueError('Asset checksum failed: '+rel)
   return ROOT/rel,data
  print('Verifying sharing images.',flush=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
   assets=list(pool.map(get_asset,MANIFEST['assets']))
  for p,data in assets:
   if not p.parent.resolve().is_relative_to(ROOT.resolve()) or p.is_symlink():raise ValueError('Unsafe asset destination')
   if p.exists() and (not p.is_file() or p.read_bytes()!=data):raise ValueError('Existing asset differs: '+str(p))
  for p,old,new in plans:
   if p.read_bytes()!=old:raise ValueError('Page changed during planning: '+str(p))
   b=backup/'pages'/p.relative_to(ROOT);b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(old)
  def atomic(p,data):
   p.parent.mkdir(parents=True,exist_ok=True)
   fd,tmp=tempfile.mkstemp(prefix='.sharing-',dir=p.parent)
   with os.fdopen(fd,'wb') as f:f.write(data)
   os.chmod(tmp,0o644);os.replace(tmp,p)
  for p,data in assets:
   if not p.exists():atomic(p,data)
  for p,old,new in plans:
   if p.read_bytes()!=old:raise ValueError('Page changed before installation: '+str(p))
   atomic(p,new)
  for item in report:
   if item['status']=='planned':item['status']='INSTALLED'
  receipt={'commit':COMMIT,'deployment':'dpl_4CKLrEgpjFVJkpaW3FRo7TpEuGCj','source':BASE,'pages':report,'assets':MANIFEST['assets']}
  (backup/'release.json').write_text(json.dumps(receipt,indent=2))
  print('Updated public pages:',len(plans))
  print('Verified sharing images:',len(assets))
  print('Backup and report:',backup)
  for item in report:
   if item['status']!='INSTALLED':print(item['status'],item['url'])
  print('No case records, access permissions, DNS, or nginx configuration changed.')
if __name__=='__main__':main()
