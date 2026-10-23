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
