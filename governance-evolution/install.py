#!/usr/bin/env python3
"""Install this verified page on the existing kapukai.org static host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from datetime import datetime, timezone

BASE = Path(__file__).resolve().parent
PREFIX = 'vercel-governance-evolution/'

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root', required=True, type=Path)
    parser.add_argument('--replace-existing', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    if not args.web_root.is_dir():
        parser.error('--web-root must be an existing directory')
    root = args.web_root.resolve()
    manifest = json.loads((BASE / 'release-manifest.json').read_text())
    entries = []
    for name, expected in manifest['files'].items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or not name.startswith(PREFIX):
            raise ValueError('Invalid release path: ' + name)
        source, target = BASE / 'public' / relative, root / relative
        if source.is_symlink() or sha256(source) != expected:
            raise ValueError('Source hash mismatch: ' + name)
        if not target.resolve().is_relative_to(root):
            raise ValueError('Destination escapes web root: ' + name)
        if any(part.is_symlink() for part in [target, *target.parents] if part != root):
            raise ValueError('Symlinked destination: ' + name)
        if target.exists() and not target.is_file():
            raise ValueError('Destination is not a regular file: ' + name)
        entries.append((name, source, target, expected))
    if not entries:
        raise ValueError('Empty release')
    conflicts = [name for name, source, target, expected in entries
                 if target.exists() and sha256(target) != expected]
    print(json.dumps({'route': '/' + PREFIX, 'file_count': len(entries),
                      'conflicting_files': conflicts, 'changes_dns': False,
                      'changes_nginx': False}, indent=2))
    if args.check_only:
        return
    if conflicts and not args.replace_existing:
        parser.error('Existing files differ. Review them before using --replace-existing.')
    changed = [entry for entry in entries if not entry[2].exists() or sha256(entry[2]) != entry[3]]
    if not changed:
        print('Exact release already installed. All hashes match.')
        return
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = root.parent / ('kapukai-evolution-backup-' + stamp)
    backup.mkdir(mode=0o700)
    created, replaced = [], []
    for name, source, target, expected in changed:
        if target.exists():
            previous = backup / name
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, previous)
            replaced.append(name)
        else:
            created.append(name)
    (backup / 'install-record.json').write_text(json.dumps({
        'web_root': str(root), 'created': created, 'replaced': replaced}, indent=2) + '\n')
    try:
        for name, source, target, expected in changed:
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary_name = tempfile.mkstemp(prefix='.kapukai-', dir=target.parent)
            temporary = Path(temporary_name)
            try:
                with os.fdopen(fd, 'wb') as output:
                    output.write(source.read_bytes())
                    output.flush()
                    os.fsync(output.fileno())
                    os.fchmod(output.fileno(), 0o644)
                temporary.replace(target)
                if sha256(target) != expected:
                    raise ValueError('Installed hash mismatch: ' + name)
            finally:
                temporary.unlink(missing_ok=True)
    except Exception:
        for name in created:
            (root / name).unlink(missing_ok=True)
        for name in replaced:
            shutil.copy2(backup / name, root / name)
        raise
    print('Installed and hash-verified. Backup: ' + str(backup))

if __name__ == '__main__':
    main()
