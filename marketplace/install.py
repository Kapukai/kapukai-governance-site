#!/usr/bin/env python3
"""Install the reviewed /marketplace/ entry on the existing Kapukai host."""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import shlex
import subprocess
import urllib.error
import urllib.parse
import urllib.request

# Exact entry release verified on Vercel before origin installation.
SOURCE = 'https://kapukai-community-emp096m2b-kapukais-projects.vercel.app'
SOURCE_COMMIT = '417d7ef1aa7f851d5f56fe6bf4508a6337db603c'
DEPLOYMENT_ID = 'dpl_HAVHUwwna3QyvaaA3wt3BYCfE1VD'
BUNDLE_PATH = 'marketplace/release.json'
BUNDLE_SHA256 = '67971d7dc3aecac4ff096d0b54c7814c94958ca566ed965999aab8828643dfd0'
HASHES = {'marketplace/index.html': 'a41afd6de74e7b3e2614d85bb2929b251d74bc2dec79df0f26df07fd9ad39f86'}

# This app keeps its established branch-alias origin and sessions. The alias
# can change builds; the observed deployment is a release-time record only.
APP_URL = 'https://kapukai-marketplace-pilot-git-work-pub-d328a2-kapukais-projects.vercel.app/'
OBSERVED_APP_DEPLOYMENT_URL = 'https://kapukai-marketplace-pilot-cko4g0i3h-kapukais-projects.vercel.app/'
OBSERVED_APP_DEPLOYMENT_ID = 'dpl_J4kR8fLT1ZmWWNPymtBxJAeosUKH'
OBSERVED_APP_SOURCE_COMMIT = '8a3e210e5d003561246a27e6cc4cb8f757e467f8'

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
if set(p['files'])!={'marketplace/index.html'}: stop('Unexpected release path; only marketplace/index.html is permitted.')
entry=p['files']['marketplace/index.html']
try: content=base64.b64decode(entry['data'],validate=True)
except Exception: stop('Invalid release encoding.')
if hashlib.sha256(content).hexdigest()!=entry['sha256']: stop('Release hash mismatch.')
target=root/'marketplace'
def state():
 if target.is_symlink(): stop('Marketplace destination is a symlink.')
 if not target.exists(): return 'absent'
 if not target.is_dir(): stop('Marketplace destination already exists.')
 children=list(target.iterdir())
 if len(children)!=1 or children[0].name!='index.html': stop('Existing Marketplace differs; nothing overwritten.')
 f=target/'index.html'
 if f.is_symlink() or not f.is_file() or f.read_bytes()!=content: stop('Existing Marketplace differs; nothing overwritten.')
 return 'exact'
state()
receipts=root.parent/'marketplace-install-receipts'
no_symlinks(receipts)
receipts.mkdir(mode=0o700,exist_ok=True)
lockpath=receipts/'install.lock'
no_symlinks(lockpath)
lock=os.open(str(lockpath),os.O_CREAT|os.O_WRONLY|os.O_NOFOLLOW,0o600)
fcntl.flock(lock,fcntl.LOCK_EX)
current=state()
if current=='exact':
 print('Exact marketplace entry already installed; website files unchanged.');sys.exit(0)
# Snapshot the verified absence before making the first installation. No prior
# marketplace files exist to back up, and any conflicting content is refused.
receipt={'prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status':'prepared','source':p['source'],'source_commit':p['source_commit'],
 'deployment_id':p['deployment_id'],'website_root':str(root),
 'previous_state':'absent','homepage_sha256_before':hashlib.sha256(home.read_bytes()).hexdigest(),
 'hashes':{'marketplace/index.html':entry['sha256']}}
fd,receipt_name=tempfile.mkstemp(prefix='release-',suffix='.json',dir=receipts)
with os.fdopen(fd,'w') as handle:
 json.dump(receipt,handle,indent=2);handle.flush();os.fsync(handle.fileno())
stage=pathlib.Path(tempfile.mkdtemp(prefix='.marketplace-stage-',dir=root))
try:
 os.chmod(stage,0o755)
 f=stage/'index.html'
 with f.open('wb') as handle:
  handle.write(content);handle.flush();os.fsync(handle.fileno())
 os.chmod(f,0o644)
 if state()!='absent': stop('Destination changed during preparation; stopped.')
 os.rename(stage,target)
finally:
 if stage.exists(): shutil.rmtree(stage)
if state()!='exact': stop('Installed entry failed verification.')
receipt['status']='installed'
receipt['installed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['hashes_verified']=True
receipt['homepage_sha256_after']=hashlib.sha256(home.read_bytes()).hexdigest()
with open(receipt_name,'w') as handle:
 json.dump(receipt,handle,indent=2);handle.flush();os.fsync(handle.fileno())
print('Installed only /marketplace/index.html. Existing pages, DNS and nginx unchanged.')
print('Verified release receipt: '+receipt_name)
'''


def validate_identity():
    origin = urllib.parse.urlsplit(SOURCE)
    if (origin.scheme != 'https' or not origin.hostname
            or not origin.hostname.endswith('.vercel.app')
            or origin.path not in ('', '/') or origin.query or origin.fragment
            or origin.username or origin.password or origin.port):
        raise SystemExit('STOP: immutable entry deployment origin is not configured.')
    if not re.fullmatch(r'[0-9a-f]{40}', SOURCE_COMMIT):
        raise SystemExit('STOP: source commit is not configured.')
    if not re.fullmatch(r'dpl_[A-Za-z0-9]+', DEPLOYMENT_ID):
        raise SystemExit('STOP: deployment identity is not configured.')
    if (set(HASHES) != {'marketplace/index.html'}
            or not re.fullmatch(r'[0-9a-f]{64}', BUNDLE_SHA256)
            or not all(re.fullmatch(r'[0-9a-f]{64}', value) for value in HASHES.values())):
        raise SystemExit('STOP: release hashes are not configured.')


def decode_bundle(data, root):
    """The JSON carrier avoids preview-toolbar changes to fetched HTML."""
    if hashlib.sha256(data).hexdigest() != BUNDLE_SHA256:
        raise SystemExit('STOP: downloaded bundle differs from the reviewed release.')
    try:
        bundle = json.loads(data)
        if bundle['module'] != 'marketplace-entry' or bundle['version'] != 1:
            raise ValueError('Unexpected bundle format.')
        if set(bundle['files']) != set(HASHES):
            raise ValueError('Unexpected release paths.')
        files = {}
        for name, expected in HASHES.items():
            entry = bundle['files'][name]
            content = base64.b64decode(entry['data'], validate=True)
            if entry['sha256'] != expected or hashlib.sha256(content).hexdigest() != expected:
                raise ValueError('Entry hash mismatch.')
            files[name] = {'data': entry['data'], 'sha256': expected}
    except (KeyError, TypeError, ValueError) as error:
        raise SystemExit('STOP: invalid release bundle: ' + str(error)) from None
    return {'root': root, 'source': SOURCE, 'source_commit': SOURCE_COMMIT,
            'deployment_id': DEPLOYMENT_ID, 'files': files}


def payload(root):
    validate_identity()
    with urllib.request.urlopen(SOURCE.rstrip('/') + '/' + BUNDLE_PATH, timeout=30) as response:
        data = response.read(1048577)
    if len(data) > 1048576:
        raise SystemExit('STOP: release bundle exceeds the expected size.')
    return decode_bundle(data, root)


def preflight_app():
    """Check the anonymous destination before touching the branded host."""
    request = urllib.request.Request(APP_URL, headers={
        'User-Agent': 'Kapukai-Marketplace-Release-Check/1.0',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        final = urllib.parse.urlsplit(response.geturl())
        expected = urllib.parse.urlsplit(APP_URL)
        if (response.status != 200 or final.scheme != 'https'
                or final.netloc != expected.netloc or final.path != '/'
                or final.query or final.fragment
                or response.headers.get_content_type() != 'text/html'):
            raise SystemExit('STOP: the marketplace preview is not anonymously available at its expected address.')
        body = response.read(1048577).decode('utf-8', errors='replace')
    title_match = re.search(r'<title\b[^>]*>(.*?)</title>', body, re.I | re.S)
    title = re.sub(r'\s+', ' ', title_match.group(1)).lower() if title_match else ''
    if (len(body) > 1048576 or 'kapukai' not in title
            or not any(label in title for label in ('document studio', 'marketplace'))
            or any(label in title for label in ('log in', 'login', 'sign in', 'authentication'))):
        raise SystemExit('STOP: the app response does not identify the expected public Kapukai preview.')
    print('Verified anonymous access to the expected marketplace preview.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh', default='root@195.246.230.42')
    parser.add_argument('--web-root', default='/var/www/kapukai.org/public_html')
    parser.add_argument('--check-only', action='store_true',
                        help='Download and verify the release without connecting to the host.')
    args = parser.parse_args()
    print('Downloading the reviewed marketplace entry and verifying its hashes…', flush=True)
    try:
        release = payload(args.web_root)
        preflight_app()
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit('STOP: release download or anonymous app check failed. No SSH connection was attempted.') from None
    if args.check_only:
        print('VERIFIED: 1 entry file; no SSH or host changes.')
        return
    print('Installing via SSH; enter any credentials only at the SSH prompt.', flush=True)
    try:
        subprocess.run(['ssh', '-o', 'ConnectTimeout=15', args.ssh,
                        'python3 -c ' + shlex.quote(REMOTE)],
                       input=json.dumps(release), text=True, check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit('STOP: SSH or installation failed (exit {}). If the remote command began, '
                         'check the receipt and public page before retrying.'.format(error.returncode)) from None
    print('Checking the public entry…', flush=True)
    try:
        with urllib.request.urlopen('https://kapukai.org/marketplace/', timeout=30) as response:
            if response.status != 200 or response.headers.get_content_type() != 'text/html':
                raise SystemExit('Installed, but the public entry is not served as HTML. Publication is not verified.')
            final = urllib.parse.urlsplit(response.geturl())
            if (final.scheme != 'https' or final.netloc != 'kapukai.org'
                    or final.path != '/marketplace/' or final.query or final.fragment):
                raise SystemExit('Installed, but public entry did not stay at the expected branded path. Publication is not verified.')
            content = response.read(1048577)
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit('Installation finished, but public verification could not connect. Publication remains unverified.') from None
    if hashlib.sha256(content).hexdigest() != HASHES['marketplace/index.html']:
        raise SystemExit('Installed, but the public entry differs from the reviewed release. Publication remains unverified.')
    print('VERIFIED: https://kapukai.org/marketplace/ serves the reviewed entry.')
    print('The entry opens the existing marketplace preview on its app host; it is not an app migration.')


if __name__ == '__main__':
    main()
