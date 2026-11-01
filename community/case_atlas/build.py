"""Build portable read-only research editions. seed.json is reviewed public-source material."""
import csv,hashlib,json,sqlite3
from pathlib import Path
R=Path(__file__).resolve().parent
O=R.parent/'public/evidence/decision-failures';O.mkdir(parents=True,exist_ok=True)
cases=json.loads((R/'seed.json').read_text())
assert len({x['id'] for x in cases})==len(cases)
required=['id','title','year','state','city','court','docket','level','pattern','headline','sequence','finding','remedy','status','limitation','people','sources','engineering_hypothesis']
for c in cases:
 for k in required:assert c.get(k), (c.get('id'),k)
 for s in c['sources']:assert s['url'].startswith('https://') and s['pinpoint']
 c['engineer_signoff_evidence']='Not established by reviewed source'
 c['engineering_causation_status']='not_established'
 c['current_status_note']='Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.'
 c['reviewed_at']='2026-11-01'
 if 'evidence_type' not in c:
  status=c['status'].lower()
  c['evidence_type']='Guilty plea' if 'guilty' in status else 'Official investigation' if ('doj' in status or 'oig' in status or 'inspector' in status) else 'Preliminary relief' if 'preliminary' in status else 'Procedural ruling' if ('pleading' in status or 'survived' in status or 'summary judgment denied' in status) else 'Court merits decision'
 # Structured research gap: no inference from non-observation.
 c['signoff_research_needed']='Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation.'
metadata={'edition':'1.0','reviewed_at':'2026-11-01','scope_note':'Selected U.S. public-source cases and official findings. This is an initial curated edition, not all online cases, a representative sample or a prevalence estimate. States without records are not yet indexed. Map geography is underlying jurisdiction, not deciding-court location.','engineering_note':'Kapukai proposes publicly accountable engineering assurance for consequential decision systems. These records do not establish that an absent engineer caused the failure or that every government decision legally requires an engineer’s sign-off.','cases':cases}
encoded=json.dumps(metadata,ensure_ascii=False,indent=2)+'\n';(O/'cases.json').write_text(encoded)
fields=required+['evidence_type','engineer_signoff_evidence','engineering_causation_status','current_status_note','reviewed_at','signoff_research_needed']
with (O/'cases.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
 for c in cases:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in c.items() if k in fields})
p=O/'cases.sqlite'
if p.exists():p.unlink()
db=sqlite3.connect(p);db.executescript('PRAGMA foreign_keys=ON; CREATE TABLE cases(id TEXT PRIMARY KEY,title TEXT,state TEXT,government_level TEXT,pattern TEXT,evidence_type TEXT,record_json TEXT); CREATE TABLE sources(case_id TEXT REFERENCES cases(id),url TEXT,title TEXT,pinpoint TEXT,PRIMARY KEY(case_id,url)); CREATE TABLE people(case_id TEXT REFERENCES cases(id),name TEXT,documented_role TEXT); CREATE TABLE edition(version TEXT,reviewed_at TEXT,scope_note TEXT,engineering_note TEXT,sha256 TEXT);')
for c in cases:
 db.execute('INSERT INTO cases VALUES(?,?,?,?,?,?,?)',(c['id'],c['title'],c['state'],c['level'],c['pattern'],c['evidence_type'],json.dumps(c,ensure_ascii=False)))
 db.executemany('INSERT INTO sources VALUES(?,?,?,?)',[(c['id'],s['url'],s['title'],s['pinpoint']) for s in c['sources']]);db.executemany('INSERT INTO people VALUES(?,?,?)',[(c['id'],s['name'],s['role']) for s in c['people']])
checksum=hashlib.sha256(encoded.encode()).hexdigest();db.execute('INSERT INTO edition VALUES(?,?,?,?,?)',('1.0','2026-11-01',metadata['scope_note'],metadata['engineering_note'],checksum));db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
def quote(s):return "'"+str(s).replace("'","''")+"'"
values=[]
for c in cases:
 row=[c['id'],c['title'],c['state'],c['level'],c['pattern'],c['evidence_type'],c['reviewed_at'],json.dumps(c,ensure_ascii=False)]
 values.append('('+','.join(map(quote,row))+')')
sql='BEGIN;\nINSERT INTO kapukai_case_atlas.cases(id,title,state,government_level,pattern,evidence_status,source_review_date,record) VALUES '+',\n'.join(values)+' ON CONFLICT(id) DO UPDATE SET title=excluded.title,state=excluded.state,government_level=excluded.government_level,pattern=excluded.pattern,evidence_status=excluded.evidence_status,record=excluded.record,source_review_date=excluded.source_review_date,updated_at=now();\n'
for c in cases:
 for s in c['sources']:sql+='INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('+','.join(map(quote,[c['id'],s['url'],s['title'],s['pinpoint']]))+') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;\n'
 for s in c['people']:sql+='INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('+','.join(map(quote,[c['id'],s['name'],s['role']]))+') ON CONFLICT DO NOTHING;\n'
sql+='INSERT INTO kapukai_case_atlas.editions(edition,published_snapshot,checksum_sha256,source_review_date) VALUES('+','.join(map(quote,['1.0',encoded,checksum,'2026-11-01']))+') ON CONFLICT(edition) DO NOTHING;\nCOMMIT;\n'
(R/'seed.sql').write_text(sql)
print(json.dumps({'cases':len(cases),'jurisdictions':len(set(c['state'] for c in cases)),'people':sum(len(c['people']) for c in cases),'sources':sum(len(c['sources']) for c in cases),'sha256':checksum}))
