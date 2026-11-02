(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
const link = (text,url) => {const a=el('a',text);try{const u=new URL(url,location.href);if(['https:','http:'].includes(u.protocol))a.href=u.href;}catch{}return a;};
let all=[],selected='barry-2016',state='',query='',pattern='',level='',status='',capability='',view='map';
let shapes=new Map(),labels=new Map();
const statusOf=c=>c.status||c.evidence_status||'See source';
const typeOf=c=>c.evidence_type||statusOf(c);
const levelOf=c=>c.level||c.government_level||'Unspecified';
const placeOf=c=>c.city||c.place||c.state;
const capabilityOf=c=>['FMC','PMC','NMC','UNASSESSED'].includes(c.mission_capability?.current_status)?c.mission_capability.current_status:'UNASSESSED';
const capabilityLabel=value=>value==='UNASSESSED'?'Unassessed':value;
function options(id,values){for(const v of [...new Set(values.filter(Boolean))].sort()) {const o=el('option',v);o.value=v;$(id).append(o);}}
function searchable(c){return JSON.stringify(c).toLocaleLowerCase();}
function matches(c,withState=true){return (!withState||!state||c.state===state)&&(!query||searchable(c).includes(query))&&(!pattern||c.pattern===pattern)&&(!level||levelOf(c)===level)&&(!status||typeOf(c)===status)&&(!capability||capabilityOf(c)===capability);}
function setState(s){state=s;$('state').value=s;selected='';render();}
function bindCaseLink(anchor,id){
 anchor.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!all.some(c=>c.id===id))return;event.preventDefault();history.pushState(null,'','#case='+encodeURIComponent(id));selectCase(id,true);});
}
function featuredCases(){
 const root=$('priority-cases');root.replaceChildren();
 const featured=all.filter(c=>c.featured).sort((a,b)=>(a.editorial_priority||99)-(b.editorial_priority||99)).slice(0,3);
 $('start-here').hidden=!featured.length;
 for(const c of featured){
  const card=el('article',undefined,'priority-card');
  card.append(el('p',`${c.state} / ${c.year}`,'eyebrow'));
  card.append(el('h3',c.headline||c.title));
  card.append(el('p',c.title,'priority-case-name'));
  card.append(el('p',c.strategic_value||'Read the finding, the remedy and the limits of this record.','priority-value'));
  const a=link('Follow the case →','#case='+encodeURIComponent(c.id));a.className='priority-link';
  a.setAttribute('aria-label','Follow the case: '+c.title);
  bindCaseLink(a,c.id);
  card.append(a);root.append(card);
 }
}
function map(){const m=window.ATLAS_MAP;if(!m){$('map').textContent='Map unavailable. Use the state selector.';return;}
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',m.viewBox);svg.setAttribute('role','group');svg.setAttribute('aria-label','Choose a state to inspect source-linked case records');
 for(const s of m.states){const o=el('option',s.name);o.value=s.abbr;$('state').append(o);const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',s.path);path.setAttribute('role','button');path.setAttribute('tabindex','0');path.setAttribute('aria-label',s.name);path.addEventListener('click',()=>setState(s.abbr));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setState(s.abbr);}});svg.append(path);shapes.set(s.abbr,path);
 if(s.labelX&&s.labelY&&s.abbr!=='DC'){const t=document.createElementNS(svg.namespaceURI,'text');t.setAttribute('x',s.labelX);t.setAttribute('y',s.labelY);t.setAttribute('text-anchor','middle');t.setAttribute('aria-hidden','true');t.textContent=s.abbr;svg.append(t);labels.set(s.abbr,t);}}
 $('map').append(svg);
}
function section(parent,title,text){const s=el('section',undefined,'detail-section');s.append(el('h4',title));s.append(el('p',text||'Not established in the reviewed source.'));parent.append(s);return s;}
function verification(c,parent){
 const v=c.verification||{},s=el('details',undefined,'detail-disclosure verification');
 s.append(el('summary','Measurement, testing and review details'));
 s.append(el('p',v.scope||'Status of Kapukai’s work on this record. Separate evaluations by source authors may exist.','verification-scope'));
 const count=x=>Array.isArray(x)?x.length:0;
 const runs=count(v.operational_test_runs),metrics=count(v.metrics),replications=count(v.independent_replications);
 const rows=[
  ['Published-source review',v.source_review==='document_review_only'?'Document review only'+(c.reviewed_at?' · '+c.reviewed_at:' · date not recorded'):'Not recorded'],
  ['Operational tests',runs?`${runs} test record${runs===1?'':'s'}; inspect the data export`:v.test_status==='not_performed_by_kapukai'?'Not performed by Kapukai':'Not recorded'],
  ['Error rates and confidence intervals',metrics?`${metrics} measurement record${metrics===1?'':'s'}; inspect the data export`:v.measurement_status==='not_estimated_by_kapukai'?'Not estimated by Kapukai':'Not recorded'],
  ['Hypothesis-test results',runs?'Inspect each test record and its stated scope':v.test_status==='not_performed_by_kapukai'?'No results recorded by Kapukai':'Not recorded'],
  ['Independent reproduction',replications?`${replications} replication record${replications===1?'':'s'}; inspect the data export`:'Not recorded'],
  ['Evaluations in source documents',v.third_party_test_evidence==='not_systematically_extracted'?'Not systematically extracted':'Not recorded'],
  ['Current compliance',v.current_compliance==='not_independently_verified'?'Not independently verified':'Not recorded'],
  ['Insurance coverage',v.insurance_coverage==='not_reviewed'?'Not reviewed':'Not recorded']
 ];
 const table=el('table',undefined,'verification-table'),body=el('tbody');
 for(const [label,value] of rows){const row=el('tr'),key=el('th',label);key.scope='row';row.append(key,el('td',value));body.append(row);}table.append(body);s.append(table);
 s.append(el('p',v.review_method||'Review method and reviewer independence: not recorded.','review-note'));
 s.append(el('p','An absent test record does not establish that nobody tested the system. Checks of this atlas’s software do not test the government decision systems it describes.','review-note'));
 parent.append(s);
}
function missionCapability(c,parent){
 const m=c.mission_capability||{},s=el('details',undefined,'detail-disclosure mission-capability');
 s.append(el('summary','Mission definitions and assessment basis'));
 s.append(el('p',capabilityLabel(capabilityOf(c)),'capability-status'));
 s.append(el('p',m.scope||'Assessment scope not recorded.','review-note'));
 const mission=el('p');mission.append(el('strong','Proposed mission: '),document.createTextNode(m.mission||'Not recorded'));s.append(mission);
 s.append(el('p',m.blocked_reason||'No validated current mission-capability assessment is recorded.','capability-reason'));
 const details=el('div'),summary=el('h4','Assessment basis and proposed definitions');details.append(summary);
 details.append(el('p',m.framework||'Kapukai proposed adaptation of mission-capability reporting; not an official military rating.'));
 details.append(el('p','Criteria: '+(m.criteria_status==='proposed_not_validated'?'proposed, not validated':'not recorded')+'. Assessed: '+(m.assessed_at||'not recorded')+'. Assessor: '+(m.assessor||'not recorded')+'.'));
 const definitions=el('dl',undefined,'capability-definitions');
 for(const [term,meaning] of [['FMC','All specified missions demonstrated capable.'],['PMC','Some, but not all, specified missions demonstrated capable.'],['NMC','Assessment establishes inability to perform any specified mission.'],['Unassessed','Insufficient or missing current evidence to assign a capability rating.']]){definitions.append(el('dt',term),el('dd',meaning));}
 details.append(definitions);
 details.append(el('p','Ratings require a defined mission baseline and adequate, current evidence. A historical failure or an absent test record does not automatically make a system NMC. Official military definitions vary by system and reporting context.'));
 details.append(el('p','A capability rating does not establish lawful authority, safety or legal compliance. Define the proposed mission’s applicable constraints and acceptance thresholds before assessment.'));
 details.append(link('Read the Air Force reporting example (AFMAN 13-1 CRC, Volume 3, §4.3.1)','https://static.e-publishing.af.mil/production/1/af_a3/publication/afman13-1crcv3/afman13-1crcv3.pdf'));
 s.append(details);parent.append(s);
}
function verificationSummary(c,parent){
 const v=c.verification||{},summary=el('aside',undefined,'verification-summary');
 summary.append(el('strong','Verification status'));
 const source=v.source_review==='document_review_only'?'Published-source review only':'Published-source review status not recorded';
 const tests=Array.isArray(v.operational_test_runs)&&v.operational_test_runs.length?`${v.operational_test_runs.length} operational test record(s); scope in details`:v.test_status==='not_performed_by_kapukai'?'Operational testing not performed by Kapukai':'Operational testing not recorded';
 const compliance=v.current_compliance==='not_independently_verified'?'Current compliance not independently verified':'Current compliance verification not recorded';
 summary.append(el('p',`${source}. ${tests}. Capability: ${capabilityLabel(capabilityOf(c))}. ${compliance}.`));
 summary.append(el('p','Source review does not establish operational testing or current system performance.','review-note'));parent.append(summary);
}
function detail(c){
 const d=$('case-detail');d.replaceChildren();
 const back=link(view==='compare'?'← Back to comparison':'← Back to cases','#results-title');back.className='reader-back';d.append(back);
 if(!c){const emptyHeading=el('h3','No matching records','empty-result');emptyHeading.id='detail-title';emptyHeading.tabIndex=-1;d.append(emptyHeading,el('p','No case in this edition matches these filters. Missing or unassessed evidence is not a finding of safety or incapability.'));return;}
 d.append(el('p',`${c.state} / ${c.year} / ${levelOf(c)}`,'eyebrow'));
 const title=el('h3',c.headline||c.title);title.id='detail-title';title.tabIndex=-1;d.append(title);
 d.append(el('p',c.title,'case-title'),el('p',[c.court,c.docket||c.citation,placeOf(c)].filter(Boolean).join(' · '),'case-meta'),el('p',statusOf(c),'status-tag'));
 verificationSummary(c,d);
 if(c.strategic_value)section(d,'Why this case matters',c.strategic_value);
 const sequenceSection=el('section',undefined,'detail-section');sequenceSection.append(el('h4','Sequence in the cited record'));
 const seq=el('ol',undefined,'sequence');for(const item of c.sequence||[])seq.append(el('li',item));sequenceSection.append(seq);d.append(sequenceSection);
 section(d,'What the source establishes',c.finding);section(d,'Remedy',c.remedy||c.outcome);section(d,'Limit of this record',c.limitation);
 if(c.follow_on_note)section(d,'Follow-on ruling',c.follow_on_note);
 section(d,'Current status and limits',c.current_status_note||'Historical outcome. Current docket, appeal and compliance status are not certified by this publication.');
 const sources=el('section',undefined,'detail-section primary-sources');sources.append(el('h4','Read the sources'));
 const list=el('ol',undefined,'source-list');for(const s of c.sources||[]){const obj=typeof s==='string'?{url:s,title:'Primary source'}:s;const li=el('li');li.append(link(obj.title||obj.url,obj.url));if(obj.pinpoint)li.append(el('div',obj.pinpoint));list.append(li);}sources.append(list);
 const deep=link('Link to this case','#case='+encodeURIComponent(c.id));deep.href='#case='+encodeURIComponent(c.id);sources.append(deep);d.append(sources);
 verification(c,d);missionCapability(c,d);
 const roles=el('details',undefined,'detail-disclosure');roles.append(el('summary','People and their documented roles'),el('p','A name here is a role reference, not a misconduct finding.','role-note'));
 const ul=el('ul',undefined,'role-list');for(const p of c.people||[]){const li=el('li');li.append(el('strong',p.name),document.createTextNode(p.role||'Role not specified'));ul.append(li);}if(!ul.children.length)ul.append(el('li','No individual names verified for this record.'));roles.append(ul);d.append(roles);
 const proposal=el('details',undefined,'detail-disclosure engineering-proposal');proposal.append(el('summary','Engineering hypothesis and proposed controls'));
 proposal.append(el('p',c.engineering_hypothesis||c.control_implication||'Identify the failed control, its accountable owner and a reproducible test.'));
 if(c.control_to_test){proposal.append(el('h4','Proposed control to test'),el('p',c.control_to_test));}
 proposal.append(el('p','Engineer signoff evidence: '+(c.engineer_signoff_evidence||'Not established by reviewed source')+'. This is a proposed control analysis, not the court’s finding of causation.','limit-note'));d.append(proposal);
}
function focusDetail(){const title=$('detail-title');title?.focus({preventScroll:true});$('case-detail').scrollIntoView({block:'start',behavior:'auto'});}
function openRecord(id){selected=id;history.pushState(null,'','#case='+encodeURIComponent(id));render();focusDetail();}
function compare(list){
 const body=$('compare-body');body.replaceChildren();$('compare-empty').hidden=!!list.length;document.querySelector('.compare-scroll').hidden=!list.length;
 for(const c of list){const row=el('tr');if(c.id===selected)row.className='selected-row';
 const name=el('th');name.scope='row';name.append(el('span',`${c.state} · ${c.year}`,'compare-meta'),el('strong',c.headline||c.title),el('span',c.title,'compare-case-title'));
 const action=el('td'),button=el('button','Open record');button.type='button';button.setAttribute('aria-label','Open record: '+c.title);button.addEventListener('click',()=>openRecord(c.id));action.append(button);
 row.append(name,el('td',c.pattern||'Not recorded'),el('td',statusOf(c)),action);body.append(row);
 }
}
function setView(next){view=next;const back=document.querySelector('.reader-back');if(back)back.textContent=view==='compare'?'← Back to comparison':'← Back to cases';$('map-view').hidden=view!=='map';$('compare-view').hidden=view!=='compare';$('case-list').hidden=view==='compare';$('evidence-layout').classList.toggle('compare-layout',view==='compare');$('view-map').setAttribute('aria-pressed',String(view==='map'));$('view-compare').setAttribute('aria-pressed',String(view==='compare'));}
function render(){const list=all.filter(c=>matches(c));const coverage=all.filter(c=>matches(c,false));for(const s of window.ATLAS_MAP?.states||[]){const total=all.filter(c=>c.state===s.abbr).length,count=coverage.filter(c=>c.state===s.abbr).length;const p=shapes.get(s.abbr);p.setAttribute('class','state-shape'+(total?' indexed':'')+(total&&!count?' filtered-out':'')+(state===s.abbr?' selected':''));p.setAttribute('aria-pressed',String(state===s.abbr));p.setAttribute('aria-label',`${s.name}: ${count} matching case${count===1?'':'s'}${!total?', not yet indexed':''}`);labels.get(s.abbr)?.setAttribute('class','state-label'+(state===s.abbr?' selected':''));}
 $('result-count').textContent=`${list.length} of ${all.length} case records${state?' · '+state:''}${capability?' · Capability: '+capabilityLabel(capability):''}`;$('results-title').textContent=state?`${$('state').selectedOptions[0]?.textContent||state} case records`:'Case records';const current=list.find(c=>c.id===selected)||list[0];selected=current?.id||'';const container=$('case-list');container.replaceChildren();for(const c of list){const b=el('button',undefined,'case-pick'+(c.id===selected?' active':''));b.type='button';b.setAttribute('aria-pressed',String(c.id===selected));b.append(el('span',`${c.state} · ${c.year}`,'small'));b.append(el('strong',c.headline||c.pattern||c.title));b.append(el('span',c.title,'case-name'));b.addEventListener('click',()=>openRecord(c.id));container.append(b);}if(!list.length)container.append(el('p','Try another state or reset the filters.','empty-result'));detail(current);compare(list);setView(view);}
function selectCase(id,focus=false){
 if(!all.some(c=>c.id===id))return false;
 selected=id;state=query=pattern=level=status=capability='';
 for(const field of ['search','state','pattern','level','status','capability'])$(field).value='';
 render();
 if(focus)focusDetail();
 return true;
}
function fromHash(){if(!location.hash.startsWith('#case='))return false;let id;try{id=decodeURIComponent(location.hash.slice(6));}catch{return false;}return selectCase(id,true);}
async function guide(){try{const data=await fetch('dc-guide.json').then(r=>{if(!r.ok)throw Error();return r.json();});const steps=Array.isArray(data)?data:(data.steps||[]);const root=$('route-steps');root.replaceChildren();steps.forEach((s,i)=>{const article=el('article',undefined,'route-step');article.append(el('span',String(i+1).padStart(2,'0'),'step-no'));article.append(el('h3',s.title));article.append(el('p',s.body));if(s.source_url)article.append(link('Read the authority ↗',s.source_url));root.append(article);});if(!steps.length)root.append(el('p','Source-linked route under review. Do not infer jurisdiction or available relief from the map.'));}catch{$('route-steps').textContent='The route source file could not load. This map does not determine jurisdiction or available relief.';}}
async function init(){map();guide();try{const response=await fetch('cases.json');if(!response.ok)throw Error('data unavailable');const data=await response.json();all=Array.isArray(data)?data:(data.cases||[]);options('pattern',all.map(c=>c.pattern));options('level',all.map(levelOf));options('status',all.map(typeOf));$('coverage').textContent=`${all.length} source-linked records · ${new Set(all.filter(c=>c.state!=="DC").map(c=>c.state)).size} states${all.some(c=>c.state==="DC")?" + D.C.":""} represented. Curated edition ${data.edition||'1'}.`;if(data.scope_note)$('scope').textContent=data.scope_note;$('edition').textContent=`Edition: ${data.edition||'1'} · Reviewed: ${data.reviewed_at||'See individual sources'}. Historical source review is not current docket certification.`;featuredCases();if(!fromHash())render();}catch{$('coverage').textContent='The case data could not load.';$('case-detail').replaceChildren(el('h3','Data unavailable'),el('p','Use the downloadable files or try reloading. No conclusion about case coverage can be drawn from this loading failure.'));}}
document.querySelectorAll('a[data-case-id]').forEach(a=>bindCaseLink(a,a.dataset.caseId));
$('view-map').addEventListener('click',()=>setView('map'));$('view-compare').addEventListener('click',()=>setView('compare'));
$('filters').addEventListener('submit',e=>e.preventDefault());$('search').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase();render();});$('state').addEventListener('change',e=>setState(e.target.value));$('pattern').addEventListener('change',e=>{pattern=e.target.value;render();});$('level').addEventListener('change',e=>{level=e.target.value;render();});$('status').addEventListener('change',e=>{status=e.target.value;render();});$('capability').addEventListener('change',e=>{capability=e.target.value;render();});$('dc').addEventListener('click',()=>setState('DC'));$('filters').addEventListener('reset',()=>{state=query=pattern=level=status=capability=selected='';setTimeout(render,0);history.replaceState(null,'',location.pathname+'#explore');});window.addEventListener('hashchange',fromHash);init();
})();
