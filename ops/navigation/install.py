#!/usr/bin/env python3
"""Install the reviewed navigation release at the existing canonical origin."""
import hashlib,json,os,re,sys,tempfile,urllib.request
from pathlib import Path
from datetime import datetime,timezone

sha=sys.argv[1] if len(sys.argv)>1 else ''
if not re.fullmatch(r'[0-9a-f]{40}',sha):raise SystemExit('Pass the exact reviewed Git commit SHA.')
root=Path('/var/www/kapukai.org/public_html').resolve()
base='https://raw.githubusercontent.com/Kapukai/kapukai-governance-site/'+sha+'/'
def download(path):
    with urllib.request.urlopen(base+path,timeout=30) as r:return r.read()
def digest(data):return hashlib.sha256(data).hexdigest()
manifest=json.loads(download('ops/navigation/manifest.json'))
pending=[]
for entry in manifest['files']:
    rel=entry['path']; parts=Path(rel)
    if parts.is_absolute() or '..' in parts.parts or not rel.startswith(('community/','assets/community/','architecture-of-power/','articles/tort-law-and-accountability/','confirm/','testers/','newsletter/')):raise SystemExit('Unexpected path: '+rel)
    target=root/rel
    if not target.resolve().is_relative_to(root) or target.is_symlink():raise SystemExit('Unsafe target: '+rel)
    incoming=download('community/public/'+rel)
    if digest(incoming)!=entry['sha256']:raise SystemExit('Source checksum mismatch: '+rel)
    before=target.read_bytes() if target.is_file() else None
    if before is not None and digest(before)==entry['sha256']:continue
    if before is not None and digest(before)!=entry['previous_sha256']:raise SystemExit('Existing page differs from reviewed baseline; no files installed. Please report: '+rel)
    pending.append((rel,target,before,incoming))
backup=Path('/root/kapukai-navigation-backups')/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup.mkdir(parents=True,mode=0o700)
record={'commit':sha,'files':[]}
for rel,target,before,incoming in pending:
    if before is not None:
        old=backup/'files'/rel;old.parent.mkdir(parents=True,exist_ok=True);old.write_bytes(before)
    record['files'].append({'path':rel,'created':before is None,'sha256':digest(incoming)})
(backup/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
def put(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix='.kapukai-nav-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(name,0o644);os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
try:
    for rel,target,before,incoming in sorted(pending,key=lambda x:x[0].endswith('.html')):put(target,incoming)
except Exception:
    for rel,target,before,incoming in pending:
        if before is None:target.unlink(missing_ok=True)
        else:put(target,before)
    raise
print('Installed',len(pending),'files. Backup:',backup)
errors=[]
for entry in manifest['files']:
    try:
        with urllib.request.urlopen('https://kapukai.org/'+entry['path'],timeout=30) as r:actual=r.read()
        if digest(actual)!=entry['sha256']:errors.append(entry['path'])
    except Exception as e:errors.append(entry['path']+' '+str(e))
if errors:raise SystemExit('Installed, but public verification incomplete: '+', '.join(errors))
print('Verified canonical navigation: https://kapukai.org/community/members/')
print('Directory: https://kapukai.org/community/sitemap/')
