#!/usr/bin/env python3
import json
from pathlib import Path
from urllib.parse import urlparse, unquote
root = Path(__file__).resolve().parents[1]
web = root / 'public' / 'evidence'
data = json.loads((web / 'public-data.json').read_text())
errors=[]
ids=[s['id'] for s in data['sources']]
if len(ids)!=len(set(ids)): errors.append('Duplicate source IDs')
case_ids=[c['id'] for c in data['cases']]
if len(case_ids)!=len(set(case_ids)): errors.append('Duplicate case IDs')
known=set(ids)
def walk(value):
    if isinstance(value,dict):
        for k,v in value.items():
            if k=='source_ids':
                for ref in v:
                    if ref not in known: errors.append('Unknown source '+ref)
            walk(v)
    elif isinstance(value,list):
        for item in value: walk(item)
walk(data)
for c in data['cases']:
    if c.get('evidence_status') not in ['documented','disputed','unresolved']: errors.append('Invalid assessment '+c['id'])
for item in data.get('downloads',[])+data.get('atlas',[]):
    link=item.get('href',item.get('src',''))
    if not link or urlparse(link).scheme: errors.append('Expected packaged local asset '+link); continue
    path=(web/unquote(urlparse(link).path)).resolve()
    if not path.is_relative_to(web) or not path.is_file(): errors.append('Missing local asset '+link)
for s in data['sources']:
    if urlparse(s.get('url','')).scheme not in ['https','http']: errors.append('Invalid source URL '+s['id'])
fallback=(web/'public-data.js').read_text()
fallback_data=json.loads(fallback.removeprefix('window.KAPUKAI_PUBLIC_DATA = ').removesuffix(';\n').replace('<\\/','</'))
if fallback_data!=data: errors.append('JSON and JavaScript data disagree')
if errors: raise SystemExit('\n'.join(errors))
print(f'PASS: {len(case_ids)} cases; {len(ids)} sources; {len(data.get("domains",[]))} control domains; all source IDs and local asset links valid; fallback synchronized.')
