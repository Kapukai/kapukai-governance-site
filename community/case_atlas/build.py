"""Build portable read-only research editions. seed.json is reviewed public-source material."""
import copy,csv,hashlib,json,sqlite3
from pathlib import Path
from decision_path_contract import SCHEMA_VERSION, PILOT_CASE_IDS, validate_paths
R=Path(__file__).resolve().parent
edition=json.loads((R/'edition.json').read_text())
verification_contract=json.loads((R/'verification-contract.json').read_text())
mission_proposals=json.loads((R/'mission-proposals.json').read_text())
O=R.parent/'public/evidence/decision-failures';O.mkdir(parents=True,exist_ok=True)
cases=json.loads((R/'seed.json').read_text())
decision_paths=json.loads((R/'decision-paths.json').read_text())
validate_paths(decision_paths, {c['id'] for c in cases}, PILOT_CASE_IDS if edition['edition']=='4.0' else None)
assert len({x['id'] for x in cases})==len(cases)
assert set(mission_proposals)=={x['id'] for x in cases}, 'Every indexed process needs one proposed mission; no stale mission records.'
required=['id','title','year','state','city','court','docket','level','pattern','headline','sequence','finding','remedy','status','limitation','people','sources','engineering_hypothesis']
for c in cases:
 if c['id'] in decision_paths:c['decision_path']=copy.deepcopy(decision_paths[c['id']])
 for k in required:assert c.get(k), (c.get('id'),k)
 for s in c['sources']:assert s['url'].startswith('https://') and s['pinpoint']
 c.setdefault('engineer_signoff_evidence','Not established by reviewed source')
 c.setdefault('engineering_causation_status','not_established')
 c.setdefault('current_status_note','Historical decision or report summarized. Subsequent docket, compliance and current personnel are not comprehensively verified.')
 c.setdefault('reviewed_at',edition['reviewed_at'])
 if 'evidence_type' not in c:
  status=c['status'].lower()
  c['evidence_type']='Guilty plea' if 'guilty' in status else 'Official investigation' if ('doj' in status or 'oig' in status or 'inspector' in status) else 'Preliminary relief' if 'preliminary' in status else 'Procedural ruling' if ('pleading' in status or 'survived' in status or 'summary judgment denied' in status) else 'Court merits decision'
 # Structured research gap: no inference from non-observation.
 c.setdefault('signoff_research_needed','Identify the actual decision-system designers, professional credentials, review obligations, attestations and causal evidence before assigning absence or causation.')
 verification=copy.deepcopy(verification_contract['record_defaults'])
 verification.update(c.get('verification',{}))
 c['verification']=verification
 proposal=mission_proposals[c['id']]
 mission_capability={
  'framework':verification_contract['mission_capability_method']['framework'],
  'current_status':'UNASSESSED',
  'mission':proposal['proposed_mission'],
  'scope':'The specific decision process described in this record, not the whole agency, court or government.',
  'criteria_status':'proposed_not_validated',
  'proposed_criteria':proposal['proposed_criteria'],
  'assessed_at':None,
  'assessor':None,
  'blocked_reason':'No current validated mission baseline, approved acceptance criteria and operational evidence set have been recorded. Historical findings and missing test data do not establish a current capability rating.',
  'historical_evidence':c['finding'],
  'historical_evidence_status':c['evidence_type'],
  'legal_authorization_status':'not_determined_by_capability_rating'
 }
 mission_capability.update(c.get('mission_capability',{}))
 c['mission_capability']=mission_capability
 assert mission_capability['current_status'] in verification_contract['mission_capability_method']['status_definitions']
 for field in ['operational_test_runs','metrics','independent_replications']:assert isinstance(verification[field],list)
 # This publication adds explicit gaps, not new operational findings. Later editions
 # must deliberately review evidence and update the contract before assigning ratings.
 if edition['edition'] in {'3.0','4.0'}:
  assert mission_capability['current_status']=='UNASSESSED'
  assert mission_capability['assessed_at'] is None and mission_capability['assessor'] is None
  assert not verification['operational_test_runs'] and not verification['metrics'] and not verification['independent_replications']
metadata={'edition':edition['edition'],'reviewed_at':edition['reviewed_at'],'scope_note':'Selected U.S. public-source cases and official findings. This is a curated edition, not all online cases, a representative sample or a prevalence estimate. States without records are not yet indexed. Map geography is underlying jurisdiction, not deciding-court location.','engineering_note':'Kapukai proposes publicly inspectable testing, evidence and accountable review for consequential decision systems. These records do not establish that an absent engineer caused the failure or that every government decision legally requires an engineer’s sign-off.','selection_method':edition['selection_method'],'verification_contract_version':edition['verification_contract_version'],'verification_method':verification_contract['methodology'],'mission_capability_method':verification_contract['mission_capability_method'],'cases':cases}
metadata['decision_paths']={'schema_version':SCHEMA_VERSION,'mapped_cases':len(decision_paths),'total_cases':len(cases),'review_scope':edition.get('decision_path_review_scope','Historical source mapping; current implementation not independently verified.')}
encoded=json.dumps(metadata,ensure_ascii=False,indent=2)+'\n';(O/'cases.json').write_text(encoded)
fields=required+['evidence_type','engineer_signoff_evidence','engineering_causation_status','current_status_note','reviewed_at','signoff_research_needed','strategic_value','control_to_test','editorial_priority','featured','follow_on_note','verification','mission_capability','decision_path']
with (O/'cases.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore',lineterminator='\n');w.writeheader()
 for c in cases:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in c.items() if k in fields})
p=O/'cases.sqlite'
if p.exists():p.unlink()
db=sqlite3.connect(p);db.executescript('PRAGMA foreign_keys=ON; CREATE TABLE cases(id TEXT PRIMARY KEY,title TEXT,state TEXT,government_level TEXT,pattern TEXT,evidence_type TEXT,record_json TEXT); CREATE TABLE sources(case_id TEXT REFERENCES cases(id),url TEXT,title TEXT,pinpoint TEXT,PRIMARY KEY(case_id,url)); CREATE TABLE people(case_id TEXT REFERENCES cases(id),name TEXT,documented_role TEXT); CREATE TABLE edition(version TEXT,reviewed_at TEXT,scope_note TEXT,engineering_note TEXT,sha256 TEXT);')
for c in cases:
 db.execute('INSERT INTO cases VALUES(?,?,?,?,?,?,?)',(c['id'],c['title'],c['state'],c['level'],c['pattern'],c['evidence_type'],json.dumps(c,ensure_ascii=False)))
 db.executemany('INSERT INTO sources VALUES(?,?,?,?)',[(c['id'],s['url'],s['title'],s['pinpoint']) for s in c['sources']]);db.executemany('INSERT INTO people VALUES(?,?,?)',[(c['id'],s['name'],s['role']) for s in c['people']])
checksum=hashlib.sha256(encoded.encode()).hexdigest();db.execute('INSERT INTO edition VALUES(?,?,?,?,?)',(edition['edition'],edition['reviewed_at'],metadata['scope_note'],metadata['engineering_note'],checksum));db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
def quote(s):return "'"+str(s).replace("'","''")+"'"
values=[]
for c in cases:
 row=[c['id'],c['title'],c['state'],c['level'],c['pattern'],c['evidence_type'],c['reviewed_at'],json.dumps(c,ensure_ascii=False)]
 values.append('('+','.join(map(quote,row))+')')
sql='BEGIN;\nDO $edition_guard$ BEGIN IF EXISTS (SELECT 1 FROM kapukai_case_atlas.editions WHERE edition='+quote(edition['edition'])+' AND checksum_sha256<>'+quote(checksum)+") THEN RAISE EXCEPTION 'Edition ID already has a different snapshot; use a new edition ID.'; END IF; END $edition_guard$;\n"
sql+='INSERT INTO kapukai_case_atlas.cases(id,title,state,government_level,pattern,evidence_status,source_review_date,record) VALUES '+',\n'.join(values)+' ON CONFLICT(id) DO UPDATE SET title=excluded.title,state=excluded.state,government_level=excluded.government_level,pattern=excluded.pattern,evidence_status=excluded.evidence_status,record=excluded.record,source_review_date=excluded.source_review_date,updated_at=now();\n'
for c in cases:
 for s in c['sources']:sql+='INSERT INTO kapukai_case_atlas.sources(case_id,url,title,pinpoint) VALUES('+','.join(map(quote,[c['id'],s['url'],s['title'],s['pinpoint']]))+') ON CONFLICT(case_id,url) DO UPDATE SET title=excluded.title,pinpoint=excluded.pinpoint;\n'
 for s in c['people']:sql+='INSERT INTO kapukai_case_atlas.people(case_id,name,documented_role) VALUES('+','.join(map(quote,[c['id'],s['name'],s['role']]))+') ON CONFLICT DO NOTHING;\n'
sql+='INSERT INTO kapukai_case_atlas.editions(edition,published_snapshot,checksum_sha256,source_review_date) VALUES('+','.join(map(quote,[edition['edition'],encoded,checksum,edition['reviewed_at']]))+') ON CONFLICT(edition) DO NOTHING;\nCOMMIT;\n'
(R/'seed.sql').write_text(sql)
print(json.dumps({'cases':len(cases),'jurisdictions':len(set(c['state'] for c in cases)),'people':sum(len(c['people']) for c in cases),'sources':sum(len(c['sources']) for c in cases),'sha256':checksum}))
