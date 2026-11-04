#!/usr/bin/env python3
"""Install the verified public Eagle Eyes module without replacing existing content."""
import argparse
import base64
import hashlib
import json
import pathlib
import shlex
import subprocess
import urllib.parse
import urllib.request

SOURCE = 'https://kapukai-eagle-eyes-public-onw1putjj-kapukais-projects.vercel.app'
HASHES = {'eagle-eyes/desk/index.html': '0fd6b20d135b3dd96065c6364a23d973e54083c8604fbd0a1cff73992ead9003', 'eagle-eyes/index.html': '6da80107417b421b15f1c1a4c2f0af28e49920736dcebad4ee3f56a05b9ce46e', 'eagle-eyes/reference/cases.json': '630b39c22222dbc251c879282404b44b330b3fc68756cc1a5a73b8a34fb0eb04', 'eagle-eyes/reference/favicon.svg': 'dcfa1abedd361fc76616cb89b7435039cfc0010d384f981d92a50c2e2190386d', 'eagle-eyes/reference/filter.js': '3a0ef9d23c65edf6f198a9a98197e6a0f8757c66fe6a426e873247b9bedca900', 'eagle-eyes/reference/index.html': 'ceadb287447d74778c99a01e6d73a19471fdb3ad36330d6af238c2a138ae192f', 'eagle-eyes/reference/share.png': '9d989ff6887aafd6d0221e18d90510ffd05015bf3bff5158974e0ec9b187f6b9', 'eagle-eyes/reference/style.css': '6d2d08a72546ed0284718d07fd2e6648da94a7927b569f16b6521316068c76b8'}
SOURCE_COMMIT = 'f4c3ef77b647c85f87ab95f2ff14f6582e7813fc'
DEPLOYMENT_ID = 'dpl_Gs6PGbrFbRXUBprZhtUUr7V9B5iP'

# Independently validates the complete payload on the destination host.
REMOTE = r'''
import sys,json,pathlib,hashlib,base64,tempfile,os,fcntl,shutil,datetime
p=json.load(sys.stdin)
def stop(message): raise SystemExit('STOP: '+message)
def no_symlinks(path):
 for part in (path,*path.parents):
  if part.is_symlink(): stop('Symlink in destination path; nothing installed.')
root=pathlib.Path(p['root'])
if not root.is_absolute(): stop('Website root must be absolute.')
no_symlinks(root)
if not root.is_dir(): stop('Expected website directory not found.')
home=root/'index.html'
no_symlinks(home)
if not home.is_file() or 'kapukai' not in home.read_text(errors='replace').lower(): stop('Homepage does not identify Kapukai.')
files={}
for name,v in p['files'].items():
 path=pathlib.PurePosixPath(name)
 if str(path)!=name or not path.parts or path.parts[0]!='eagle-eyes' or len(path.parts)<2 or any(x in ('..','.') for x in path.parts) or '\\' in name: stop('Invalid release path.')
 b=base64.b64decode(v['data'],validate=True)
 if hashlib.sha256(b).hexdigest()!=v['sha256']: stop('Release hash mismatch.')
 files[str(pathlib.PurePosixPath(*path.parts[1:]))]=b
if not files or 'index.html' not in files: stop('Incomplete release.')
# Reject any file/directory name collisions before touching the host.
for name in files:
 if any(str(parent) in files for parent in pathlib.PurePosixPath(name).parents): stop('File/directory collision.')
target=root/'eagle-eyes'
def state():
 if target.is_symlink(): stop('Eagle Eyes destination is a symlink.')
 if not target.exists(): return 'absent'
 if not target.is_dir(): stop('Eagle Eyes destination already exists.')
 expected_dirs={str(parent) for name in files for parent in pathlib.PurePosixPath(name).parents if str(parent)!='.'}
 seen_files=set();seen_dirs=set()
 for f in target.rglob('*'):
  if f.is_symlink(): stop('Existing Eagle Eyes contains a symlink.')
  rel=f.relative_to(target).as_posix()
  if f.is_file():
   seen_files.add(rel)
   if rel not in files or f.read_bytes()!=files[rel]: stop('Existing Eagle Eyes differs; nothing overwritten.')
  elif f.is_dir(): seen_dirs.add(rel)
  else: stop('Existing Eagle Eyes contains an unsupported entry.')
 if seen_files!=set(files) or seen_dirs!=expected_dirs: stop('Existing Eagle Eyes differs; nothing overwritten.')
 return 'exact'
initial=state()
# Lock and receipts stay outside the public web root.
receipts=root.parent/'eagle-eyes-install-receipts'
no_symlinks(receipts)
receipts.mkdir(mode=0o700,exist_ok=True)
lockpath=receipts/'install.lock'
no_symlinks(lockpath)
lock=os.open(str(lockpath),os.O_CREAT|os.O_WRONLY|os.O_NOFOLLOW,0o600)
fcntl.flock(lock,fcntl.LOCK_EX)
current=state()
if current=='exact':
 print('Exact release already installed; website files unchanged.');sys.exit(0)
stage=pathlib.Path(tempfile.mkdtemp(prefix='.eagle-eyes-stage-',dir=root))
try:
 os.chmod(stage,0o755)
 for name,b in files.items():
  f=stage/name;f.parent.mkdir(parents=True,exist_ok=True)
  f.write_bytes(b);os.chmod(f,0o644)
 for folder in stage.rglob('*'):
  if folder.is_dir(): os.chmod(folder,0o755)
 if state()!='absent': stop('Destination changed during preparation; stopped.')
 # Staging and destination share a filesystem: readers see the complete directory.
 os.rename(stage,target)
finally:
 if stage.exists(): shutil.rmtree(stage)
receipt={'installed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':p['source'],'source_commit':p['source_commit'],'deployment_id':p['deployment_id'],'website_root':str(root),'previous_state':'absent','hashes':{name:v['sha256'] for name,v in p['files'].items()},'hashes_verified':True}
fd,receipt_name=tempfile.mkstemp(prefix='release-',suffix='.json',dir=receipts)
with os.fdopen(fd,'w') as handle: json.dump(receipt,handle,indent=2)
print('Installed only /eagle-eyes/; existing pages, DNS and nginx unchanged.')
print('Verified release receipt: '+receipt_name)
'''


def payload(root):
    origin = urllib.parse.urlsplit(SOURCE)
    if origin.scheme != 'https' or not origin.hostname or origin.path not in ('', '/') or origin.query or origin.fragment or origin.username or not HASHES:
        raise SystemExit('STOP: release metadata is not configured.')
    if 'REPLACE_' in SOURCE_COMMIT or 'REPLACE_' in DEPLOYMENT_ID:
        raise SystemExit('STOP: release identity is not configured.')
    files = {}
    for name, sha in HASHES.items():
        path = pathlib.PurePosixPath(name)
        if str(path) != name or len(path.parts) < 2 or path.parts[0] != 'eagle-eyes' or '..' in path.parts or '\\' in name:
            raise SystemExit('STOP: invalid release path.')
        with urllib.request.urlopen(SOURCE.rstrip('/') + '/' + name, timeout=30) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != sha:
            raise SystemExit('STOP: downloaded content differs from reviewed release: ' + name)
        files[name] = {'data': base64.b64encode(data).decode(), 'sha256': sha}
    return {'root': root, 'source': SOURCE, 'source_commit': SOURCE_COMMIT, 'deployment_id': DEPLOYMENT_ID, 'files': files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh', default='root@195.246.230.42')
    parser.add_argument('--web-root', default='/var/www/kapukai.org/public_html')
    parser.add_argument('--check-only', action='store_true', help='Download and verify this release without SSH or host changes.')
    args = parser.parse_args()
    print('Downloading the exact reviewed release and verifying every file…', flush=True)
    release = payload(args.web_root)
    if args.check_only:
        print('VERIFIED: {} release files; no SSH or host changes.'.format(len(release['files'])))
        return
    print('Installing via SSH; any credential prompt comes from SSH.', flush=True)
    subprocess.run(['ssh', '-o', 'ConnectTimeout=15', args.ssh, 'python3 -c ' + shlex.quote(REMOTE)], input=json.dumps(release), text=True, check=True)
    print('Checking the public destination…', flush=True)
    for name, sha in HASHES.items():
        with urllib.request.urlopen('https://kapukai.org/' + name, timeout=30) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != sha:
            raise SystemExit('Installed, but public verification differs. Do not change DNS/nginx; share this message for review.')
    print('VERIFIED: https://kapukai.org/eagle-eyes/ — all public files match the reviewed release.')


if __name__ == '__main__':
    main()
