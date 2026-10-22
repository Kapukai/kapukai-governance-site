#!/usr/bin/env python3
"""Install only the verified /solutions/ files. No overwrite, deletion, DNS or nginx changes."""
import argparse,base64,hashlib,json,pathlib,shlex,subprocess,urllib.request
SOURCE='https://kapukai-community-j1wv8bdgl-kapukais-projects.vercel.app/solutions/'
HASHES = {'portfolio.css': '68d8fa9d3b68bd0421c54e1b087832ad3bc5d88e7aa54344ad1478e1f33e0929', 'portfolio.js': 'd5c7f31e9c15c7323bcb76ea589df831f445e227f906c27472a5e271137caf71', 'index.html': 'aeb44b6c034421f38bd748350f76a83273b50b45c387b87e0dd5a8b54429887b'}
REMOTE=r'''
import sys,json,pathlib,hashlib,base64,tempfile,os,fcntl
p=json.load(sys.stdin)
root=pathlib.Path(p['root'])
if not root.is_dir() or not (root/'index.html').is_file():raise SystemExit('STOP: expected website root/index.html not found; nothing installed.')
if 'kapukai' not in (root/'index.html').read_text(errors='replace').lower():raise SystemExit('STOP: homepage does not identify Kapukai; nothing installed.')
files={}
for name,v in p['files'].items():
 if name not in ('index.html','portfolio.css','portfolio.js'):raise SystemExit('Unexpected file; stopped.')
 b=base64.b64decode(v['data'],validate=True)
 if hashlib.sha256(b).hexdigest()!=v['sha256']:raise SystemExit('Hash mismatch; stopped.')
 files[name]=b
if len(files)!=3:raise SystemExit('Incomplete release; stopped.')
lock=os.open(str(root/'.kapukai-solutions-install.lock'),os.O_CREAT|os.O_WRONLY,0o600)
fcntl.flock(lock,fcntl.LOCK_EX)
target=root/'solutions'
if target.exists() or target.is_symlink():
 if target.is_dir() and not target.is_symlink() and all((target/n).is_file() and not (target/n).is_symlink() and (target/n).read_bytes()==b for n,b in files.items()):
  print('Exact release already installed; no files changed.');sys.exit(0)
 raise SystemExit('STOP: /solutions already exists with different content. Nothing overwritten. Ask Christine to review it before replacement.')
stage=pathlib.Path(tempfile.mkdtemp(prefix='.kapukai-solutions-stage-',dir=root))
os.chmod(stage,0o755)
for name,b in files.items():
 f=stage/name;f.write_bytes(b);os.chmod(f,0o644)
os.rename(stage,target)
print('Installed only /solutions/ (3 verified files). Existing website and evidence unchanged. No nginx reload or DNS changes.')
'''
def payload(root):
 files={}
 for name,sha in HASHES.items():
  with urllib.request.urlopen(SOURCE+name,timeout=30) as r:b=r.read()
  if hashlib.sha256(b).hexdigest()!=sha:raise SystemExit('STOP: downloaded release differs from reviewed release: '+name)
  files[name]={'data':base64.b64encode(b).decode(),'sha256':sha}
 return {'root':root,'files':files}
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--ssh',default='root@195.246.230.42')
 parser.add_argument('--web-root',default='/var/www/kapukai.org/public_html')
 args=parser.parse_args()
 print('Downloading and verifying the three reviewed portfolio files…',flush=True)
 p=payload(args.web_root)
 print('Installing via SSH. Any password prompt is from SSH; never paste credentials into chat.',flush=True)
 subprocess.run(['ssh','-o','ConnectTimeout=15',args.ssh,'python3 -c '+shlex.quote(REMOTE)],input=json.dumps(p),text=True,check=True)
 print('Checking the public destination…',flush=True)
 for name,sha in HASHES.items():
  with urllib.request.urlopen('https://kapukai.org/solutions/'+name,timeout=30) as r:b=r.read()
  if hashlib.sha256(b).hexdigest()!=sha:raise SystemExit('Files installed, but public content differs. Do not change nginx; share this message for review.')
 print('VERIFIED: https://kapukai.org/solutions/ — all three files match the reviewed release.')
if __name__=='__main__':main()
