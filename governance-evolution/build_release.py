#!/usr/bin/env python3
"""Package the reusable visual library and hash the static release."""
from pathlib import Path
import hashlib
import json
import zipfile

BASE = Path(__file__).resolve().parent
PUBLIC = BASE / 'public'
ASSETS = PUBLIC / 'vercel-governance-evolution' / 'assets'

def zip_entry(archive, name, data):
    info = zipfile.ZipInfo(name, (2026, 10, 18, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)

with zipfile.ZipFile(ASSETS / 'kapukai-governance-visual-library.zip', 'w') as archive:
    for stem in ['membrane', 'decision-gate', 'ecosystem']:
        for extension in ['svg', 'png']:
            name = f'{stem}.{extension}'
            zip_entry(archive, name, (ASSETS / name).read_bytes())
    zip_entry(archive, 'READ-ME.txt', '''KAPUKAI GOVERNANCE LAB
The next architecture of governance / Visual library v1.0

Three concept models, each as an editable SVG and a 2400 x 1600 PNG:
1. Protective boundary
2. Accountable decision and correction
3. Human-centered ecosystem

These are proposed governance patterns, not proof of a deployed system.
Biology supplies an analogy, not a law of inevitable political evolution.
Applicable legal requirements vary. Technology does not establish facts
or legal authority on its own.

Source and context: https://kapukai.org/vercel-governance-evolution/
Copyright 2026 Kapukai Governance Lab.
'''.encode())

files = {path.relative_to(PUBLIC).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
         for path in sorted(PUBLIC.rglob('*')) if path.is_file()}
manifest = {'module': 'kapukai-governance-evolution', 'version': '1.0',
            'canonical_url': 'https://kapukai.org/vercel-governance-evolution/',
            'vercel_project': 'kapukai-governance-evolution', 'files': files}
existing_manifest = BASE / 'release-manifest.json'
if existing_manifest.exists():
    previous = json.loads(existing_manifest.read_text())
    if previous.get('files') == files and 'publication' in previous:
        manifest['publication'] = previous['publication']
(BASE / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'file_count': len(files), 'total_bytes': sum(path.stat().st_size for path in PUBLIC.rglob('*') if path.is_file())}))
