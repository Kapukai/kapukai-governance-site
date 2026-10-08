#!/usr/bin/env python3
"""Install only this module's declared static files, with hash checks and backup."""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
PREFIXES = ('community/', 'join/', 'confirm/', 'testers/', 'newsletter/',
            'articles/tort-law-and-accountability/', 'tort/', 'assets/community/')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare():
    files = {}
    for path in sorted((BASE / 'public').rglob('*')):
        if path.is_file():
            name = path.relative_to(BASE / 'public').as_posix()
            if name.startswith(PREFIXES):
                files[name] = digest(path)
    manifest = {'module': 'kapukai-community', 'canonical_origin': 'https://kapukai.org',
                'vercel_project': 'kapukai-community', 'replaces': {'join/index.html': 'af8fd9aa6396f4aaffcc858730199a205c0b6cfd858a5cb6f22cbb00d4328210'}, 'files': files}
    (BASE / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest

def validate(web_root):
    manifest = json.loads((BASE / 'release-manifest.json').read_text())
    root = web_root.resolve()
    entries = []
    for name, expected in manifest['files'].items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or not name.startswith(PREFIXES):
            raise ValueError('Unexpected release path: ' + name)
        source = BASE / 'public' / relative
        target = root / relative
        if not target.resolve().is_relative_to(root):
            raise ValueError('Destination escapes the web root: ' + name)
        if source.is_symlink() or digest(source) != expected:
            raise ValueError('Release hash mismatch: ' + name)
        if target.exists() and not target.is_file():
            raise ValueError('Destination is not a file: ' + name)
        entries.append((name, source, target))
    if not entries:
        raise ValueError('Empty release')
    return root, entries

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['manifest', 'plan', 'install'])
    parser.add_argument('--web-root', type=Path)
    parser.add_argument('--replace-existing', action='store_true',
                        help='Allow backed-up replacement of conflicting module files')
    args = parser.parse_args()
    if args.action == 'manifest':
        print('Manifest prepared:', len(prepare()['files']), 'module files')
        return
    if args.web_root is None or not args.web_root.is_dir():
        parser.error('--web-root must be an existing directory')
    root, entries = validate(args.web_root)
    manifest = json.loads((BASE / 'release-manifest.json').read_text())
    conflicts = [name for name, source, target in entries
                 if target.exists() and digest(source) != digest(target)
                 and digest(target) != manifest.get('replaces', {}).get(name)]
    print(json.dumps({'files': len(entries), 'conflicting_existing_files': conflicts,
                      'homepage_changed': False, 'nginx_reload_required': False}))
    if args.action == 'plan':
        return
    if conflicts and not args.replace_existing:
        parser.error('Review the plan; use --replace-existing only for approved replacements')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = root.parent / ('kapukai-community-backup-' + stamp)
    backup.mkdir(mode=0o700)
    created, replaced = [], []
    for name, source, target in entries:
        if target.exists() and digest(source) == digest(target):
            continue
        if target.exists():
            old = backup / name
            old.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, old)
            replaced.append(name)
        else:
            created.append(name)
    (backup / 'install-record.json').write_text(json.dumps({
        'web_root': str(root), 'created': created, 'replaced': replaced}, indent=2) + '\n')
    try:
        for name, source, target in entries:
            if name not in created and name not in replaced:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.kapukai-new')
            shutil.copyfile(source, temporary)
            temporary.chmod(0o644)
            temporary.replace(target)
            if digest(target) != digest(source):
                raise ValueError('Installed hash mismatch: ' + name)
    except Exception:
        for name in created:
            (root / name).unlink(missing_ok=True)
        for name in replaced:
            shutil.copy2(backup / name, root / name)
        raise
    print('Installed and verified. Backup:', backup)

if __name__ == '__main__':
    main()
