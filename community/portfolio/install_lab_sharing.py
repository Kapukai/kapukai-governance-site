"""Install the verified lab sharing release; run on the existing kapukai server."""
from pathlib import Path
import hashlib, os, tempfile, urllib.request, json, fcntl
BASE = 'https://kapukai-community-iwqgrfdrb-kapukais-projects.vercel.app/visit-lab/'
COMMIT = 'b9fba7bc32ff99e55fd1b601e8b2b7a6d66690ac'
DEPLOYMENT = 'dpl_JDJuxpAscUc6JFGs2mPrsRCLeRs5'
FILES = {
 'lab-share-v1.jpg': '980c55fb085f01cc9b6becdeeec0542143b0e63686145a2c7155865b611c5fd9',
 'apple-touch-icon.png': '9051fee34ff0357aa3ca3cc0c06f1887d8b7d20c562932b9b0127a398a7bcd95',
 'index.html': 'c3a2b120c355976f9fb8230654879feaa61b32209f770652a91ecf100391ad0f'
}
PREVIOUS = '86061e455912dff39c1419e46468b1432fc1078fc3dc7c2cdd29284dd4f0ed26'
root = Path('/var/www/kapukai.org/public_html/visit-lab')
sha = lambda b: hashlib.sha256(b).hexdigest()
if not root.is_dir() or root.is_symlink():
 raise SystemExit('STOP: Run this inside your existing kapukai server session.')
with open('/root/.kapukai-lab-sharing.lock', 'a') as lock:
 fcntl.flock(lock, fcntl.LOCK_EX)
 old = {}
 for name, digest in FILES.items():
  p = root/name
  if p.is_symlink() or (p.exists() and not p.is_file()):
   raise SystemExit('STOP: Unexpected file: '+name)
  old[name] = p.read_bytes() if p.exists() else None
  allowed = {digest, PREVIOUS} if name == 'index.html' else {digest}
  if old[name] is not None and sha(old[name]) not in allowed:
   raise SystemExit('STOP: Existing file differs: '+name)
 if old['index.html'] is None:
  raise SystemExit('STOP: Lab page missing.')
 data = {}
 for name, digest in FILES.items():
  with urllib.request.urlopen(BASE+name, timeout=30) as response:
   data[name] = response.read()
  if sha(data[name]) != digest:
   raise SystemExit('STOP: Download failed verification: '+name)
 backup = Path(tempfile.mkdtemp(prefix='lab-sharing-backup-', dir='/root'))
 for name, content in old.items():
  if content is not None: (backup/name).write_bytes(content)
 receipt = {'commit':COMMIT,'deployment':DEPLOYMENT,'source':BASE,'target':str(root),'sha256':FILES}
 (backup/'release.json').write_text(json.dumps(receipt,indent=2))
 for name, content in data.items():
  p=root/name
  if p.is_symlink() or (p.read_bytes() if p.exists() else None) != old[name]:
   raise SystemExit('STOP: File changed during installation: '+name)
  fd,tmp=tempfile.mkstemp(prefix='.sharing-',dir=root)
  with os.fdopen(fd,'wb') as f: f.write(content)
  os.chmod(tmp,0o644)
  os.replace(tmp,p)
 print('INSTALLED: Lab sharing thumbnail and iPhone Home Screen icon.')
 print('https://kapukai.org/visit-lab/')
 print('Backup and release receipt:',backup)
 print('Existing evidence, DNS, and server configuration unchanged.')
