import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation, PresentationFile} from '@oai/artifact-tool';
import {resolvePresentationFont, finalizePresentation} from '/root/.codex/skills/builtins/presentations/container_tools/artifact_tool_utils.mjs';

const ROOT='/workspace/scratch/ceefc48769f1/rights_to_remedy_work';
const TMP=path.join(ROOT,'slides_build');
const FINAL=process.env.FINAL_PATH||path.join(ROOT,'slides_output','Kapukai_Authority_to_Remedy_Lesson_01.pptx');
const SKILL='/root/.codex/skills/builtins/presentations';
const FONT=resolvePresentationFont({fontFamily:'Nimbus Sans'});
const C={navy:'#0B1D30',gold:'#B89440',white:'#FFFFFF',pale:'#F3F5F8',gray:'#526277',light:'#CFD7DF',ink:'#172E45'};
const p=Presentation.create({slideSize:{width:1280,height:720}});
let data=[];try{data=JSON.parse(await fs.readFile(path.join(ROOT,'slides_content.json'),'utf8'));}catch{}
const content=Array.isArray(data)?data:data.slides;
const legalData=JSON.parse(await fs.readFile(path.join(ROOT,'legal_sources.json'),'utf8'));
const sourceMap=new Map([...(data.sources||[]),...legalData.sources].map(s=>[s.id,s]));
sourceMap.set('tenth_amendment',sourceMap.get('bill_of_rights'));
sourceMap.set('fourteenth_amendment',sourceMap.get('fourteenth'));
sourceMap.set('section_1983',sourceMap.get('section1983'));
const sourceSet=[
 ['Declaration of Independence','https://www.archives.gov/founding-docs/declaration'],
 ['U.S. Constitution','https://www.archives.gov/founding-docs/constitution-transcript'],
 ['Florida Constitution','https://www.leg.state.fl.us/statutes/index.cfm?submenu=3'],
 ['Florida Statutes, section 39.701','https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0039/Sections/0039.701.html'],
 ['Florida Rules of Juvenile Procedure, Oct. 1, 2026','https://www-media.floridabar.org/uploads/2026/09/2027_04-OCT-Florida-Rules-of-Juvenile-Procedure-10-1-2026.pdf'],
 ['Florida Rules of Appellate Procedure, Oct. 1, 2026','https://www-media.floridabar.org/uploads/2026/10/Appellate-Court-Rules-10-01-26.pdf'],
 ['Norton v. Southern Utah Wilderness Alliance, 542 U.S. 55','https://tile.loc.gov/storage-services/service/ll/usrep/usrep542/usrep542055/usrep542055.pdf'],
];
function text(s,str,x,y,w,h,size=28,color=C.navy,bold=false,align='left',name='text'){
 const a=s.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 a.text=str;a.text.style={typeface:FONT,fontSize:size,bold,color,alignment:align,verticalAlignment:'top',autoFit:'none',wrap:'square',lineSpacing:1.02,insets:{top:0,right:0,bottom:0,left:0}};return a;
}
function line(s,x1,y1,x2,y2,color=C.light,width=1){return s.shapes.add({geometry:'line',name:'rule',position:{left:x1,top:y1,width:x2-x1,height:y2-y1},fill:'none',line:{fill:color,width}})}
function node(s,str,x,y,w,h,opt={}){
 const a=s.shapes.add({geometry:'rect',name:'diagram-'+str.replace(/\W/g,'').slice(0,30),position:{left:x,top:y,width:w,height:h},fill:opt.fill||C.white,line:{fill:opt.stroke||C.navy,width:opt.lineWidth||2}});
 a.text=str;a.text.style={typeface:FONT,fontSize:opt.size||27,bold:opt.bold??true,color:opt.color||C.navy,alignment:'center',verticalAlignment:'middle',autoFit:'none',wrap:'square',lineSpacing:1.0,insets:{top:12,right:12,bottom:12,left:12}};return a;
}
function connect(s,a,b,opt={}){return s.shapes.connect(a,b,{kind:opt.kind||'straight',fromSide:opt.from||'right',toSide:opt.to||'left',line:{fill:opt.color||C.gold,width:2.4,style:opt.dashed?'dashed':'solid'},tail:{type:'triangle',width:'med',length:'med'}})}
function title(s,str,dark=false){text(s,str,72,48,1136,96,46,dark?C.white:C.navy,true,'left','title');}
function footer(s,i,dark=false){line(s,72,654,1208,654,dark?'#31465C':C.light,1);text(s,'KAPUKAI GOVERNANCE LAB   /   ART 01',72,671,780,22,16,dark?'#C0CBD6':C.gray);text(s,String(i).padStart(2,'0'),1140,670,68,25,17,dark?C.gold:C.gray,false,'right');}
function add(i,heading,opt={}){const actual=p.slides.items.length+1;const s=p.slides.add();s.background.fill=opt.dark?C.navy:C.white;if(heading)title(s,heading,opt.dark);footer(s,actual,opt.dark);setNotes(s,actual);return s;}
function setNotes(s,i){const d=content[i-1]||{};const notes=d.narration||'';const src=(d.source_ids||[]).map(id=>sourceMap.get(id)).filter(Boolean);const srcText=src.map(x=>x.title+'\n'+x.url).join('\n\n');s.speakerNotes.textFrame.setText(`Authority to Remedy Trace, Lesson 01\nSlide ${i}\n\nNARRATION\n${notes}\n\nFACILITATOR NOTES\n${d.speaker_notes||''}\n${d.pause_after_seconds?'Pause: '+d.pause_after_seconds+' seconds.\n':''}\nSources and references\n${srcText}\n\nIllustrative educational model. Exact requirements depend on current law, forum, posture, and the specific facts.`);}
function note(s,str){const existing=s.speakerNotes.textFrame;existing.paragraphs.add().addRun(str);}
function table(s,values,x,y,w,h,widths,bodySize=25){const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});t.styleOptions={headerRow:true,bandedRows:false};t.borders.assign({fill:C.light,width:0.7});for(let r=0;r<values.length;r++){t.rows[r].height=r===0?56:(h-56)/(values.length-1);for(let c=0;c<values[0].length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.navy:(r%2?C.white:C.pale);cell.text.style={typeface:FONT,fontSize:r===0?23:bodySize,color:r===0?C.white:C.navy,bold:r===0,alignment:'left',verticalAlignment:'middle',autoFit:'none',wrap:'square',insets:{top:10,right:14,bottom:10,left:14},lineSpacing:1.0};}}return t;}
function smallLabel(s,str,x,y,w=400,dark=false){text(s,str.toUpperCase(),x,y,w,30,18,dark?C.gold:C.gray,true);}
function numberedRows(s,rows,{x=72,y=160,w=1136,rowH=80,dark=false}={}){rows.forEach((r,i)=>{text(s,String(i+1).padStart(2,'0'),x,y+i*rowH,55,45,30,C.gold,true);text(s,r[0],x+82,y+i*rowH,w-82,38,28,dark?C.white:C.navy,true);if(r[1])text(s,r[1],x+82,y+i*rowH+37,w-82,rowH-42,23,dark?'#C0CBD6':C.gray);if(i<rows.length-1)line(s,x+82,y+(i+1)*rowH-13,x+w,y+(i+1)*rowH-13,dark?'#31465C':C.light,1);});}

// 01. Minimal cover
{
const s=add(1,null,{dark:true});
smallLabel(s,'Lesson 01  /  Homework before the classroom',72,100,1120,true);
text(s,'Authority to\nRemedy Trace',72,190,1120,180,80,C.white,true,'left','title');
text(s,'One consequential decision',76,421,1100,58,36,C.gold,false);
text(s,'A documented path from lawful power to verified remedy',76,487,1100,72,29,'#D4DEE7');
}
// 02. Constitutional authority. Federal and state branches are parallel.
{
const s=add(2,'The people and the legal framework');
const people=node(s,'The People',445,161,390,75,{fill:C.navy,color:C.white,size:34});
const fed=node(s,'U.S. Constitution',115,317,460,83,{size:30});
const state=node(s,'State constitutions',705,317,460,83,{size:30});
connect(s,people,fed,{from:'bottom',to:'top',kind:'elbow'});connect(s,people,state,{from:'bottom',to:'top',kind:'elbow'});
text(s,'Federal powers and limits',115,420,460,70,27,C.gray,false,'center');
text(s,'State powers and limits',705,420,460,70,27,C.gray,false,'center');
text(s,'The Declaration states the founding principle of consent.\nOperative legal authority comes from applicable constitutions and law.',72,523,1136,78,25,C.navy);
note(s,sourceSet.slice(0,3).map(x=>x.join('\n')).join('\n\n'));
}
// 03. An exact authority trace is an evidence table.
{
const s=add(3,'The authority chain');
table(s,[['Layer','What the trace must show'],['Constitution','The relevant grant, reservation, or limitation'],['Statute or rule','The exact provision and current version'],['Office or delegation','Who may act, and within what scope'],['Action or omission','The specific decision and its legal conditions'],['Review or remedy','The authorized forum and available relief']],72,160,1136,422,[292,844],25);
text(s,'Each link needs a source. A job title does not complete the chain.',72,602,1136,36,23,C.gray);
note(s,sourceMap.get('constitution').title+'\n'+sourceMap.get('constitution').url+'\n'+sourceMap.get('fl_constitution').url);
}
// 04. One unit of work
{
const s=add(4,'The decision trace');
text(s,'Decision D-001',72,155,1136,56,36,C.navy,true);
const terms=[['Actor','Who held the role?'],['Act or omission','What happened?'],['Predicate','What had to be true?'],['Duty','What response is required?'],['Remedy','What can change it?']];
const boxes=terms.map((v,i)=>node(s,v[0],72+i*232,257,208,96,{size:i===1?25:29}));
boxes.slice(0,4).forEach((b,i)=>connect(s,b,boxes[i+1]));
terms.forEach((v,i)=>text(s,v[1],72+i*232,381,208,100,25,C.gray,false,'center'));
text(s,'Record  /  Classify  /  Invoke duty  /  Seek enforcement  /  Verify remedy',72,550,1136,50,25,C.navy,true);
}
// 05. Record factual material separately from conclusions
{
const s=add(5,'Recording a reviewable event');
table(s,[['Record element','What belongs in it'],['Observable event','Who did what, when, where, and to whom'],['Source','Original document, message, order, or lawful recording'],['Evidence status','Observed, reported, disputed, inferred, or unknown'],['Preservation','Original version, context, date, and delivery proof']],72,155,1136,370,[302,834],25);
text(s,'Recording means preserving evidence. Audio and courtroom recording require separate legal checks.',72,552,1136,64,26,C.navy);
note(s,sourceMap.get('fl_recording').title+'\n'+sourceMap.get('fl_recording').url);
}
// 06. Classification of issue, not character
{
const s=add(6,'Classifying the issue');
table(s,[['Observed event','Potential issue to verify'],['Record names the wrong person','Identity or evidence error'],['Required act did not occur','Possible unmet duty or unlawful delay'],['Action exceeds the stated authorization','Possible scope or authority defect'],['Notice or access was unusable','Possible procedural or accessibility defect']],72,155,1136,370,[550,586],25);
text(s,'Classification is provisional. Evidence and governing law determine the claim.',72,553,1136,66,26,C.navy);
}
// 07. Required act versus protected judgment
{
const s=add(7,'Mandatory duties and discretionary choices');
text(s,'Actor, required act, trigger, deadline, exceptions, source',72,147,1136,40,25,C.gray);
table(s,[['Type','Question','Implication'],['Mandatory act','Must this actor perform this specific act?','A lawful route may compel the act.'],['Discretionary choice','Does law permit judgment among outcomes?','Review concerns limits and lawful process.'],['Unresolved','What source and predicates are missing?','Research before asserting a duty.']],72,207,1136,318,[246,446,444],25);
text(s,'A duty to decide does not guarantee the decision you request.',72,559,1136,65,31,C.navy,true);
note(s,sourceSet[6].join('\n'));
}
// 08. Worked source reading, separate from the fictional practice cases.
{
const s=add(8,'A conditional duty in Florida law');
text(s,'Fla. Stat. §39.701(2)(d)3',72,149,1136,30,21,C.gray,true);
const pred=node(s,'Court finds the social service agency has not complied\nwith its obligations in the written case plan',72,205,1136,105,{fill:C.navy,color:C.white,size:30});
const may=node(s,'MAY\nFind the agency\nin contempt',72,382,348,166,{size:30});
const shall=node(s,'SHALL\nOrder agency compliance plans and require it\nto show why the child could not safely return',488,382,720,166,{size:29});
connect(s,pred,may,{from:'bottom',to:'top',kind:'elbow'});connect(s,pred,shall,{from:'bottom',to:'top',kind:'elbow'});
text(s,'The predicate is a court finding. An allegation alone does not establish it.',72,582,1136,45,25,C.gray);
note(s,sourceMap.get('fl_39_701').title+'\n'+sourceMap.get('fl_39_701').url);
note(s,'Return itself requires separate statutory safety findings. This clause does not make an allegation automatically prove noncompliance or order return.');
}
// 08. Invocation through existing law
{
const s=add(8,'The procedure that activates review');
numberedRows(s,[['Existing legal source','The statute, rule, or order establishes the duty.'],['Satisfied conditions','Facts establish the required trigger and eligibility.'],['Proper request and recipient','The authorized procedure identifies the form and destination.'],['Filing, service, and receipt','The record shows what arrived, when, and how.'],['Decision or deadline event','The applicable rule determines the next available step.']],{y:158,rowH:88});
}
// 09. Route by action and relief
{
const s=add(9,'The forum map');
table(s,[['Decision under review','Route to verify'],['State court order','That case and the authorized state review or appeal route'],['State agency action','Applicable state administrative procedure and review'],['Federal agency action','Agency procedure and any authorized federal review'],['Independent rights claim','A court with jurisdiction over that claim and relief']],72,155,1136,378,[420,716],25);
text(s,'Federal district courts do not serve as appellate courts for state custody orders.',72,556,1136,66,25,C.navy,true);
note(s,sourceMap.get('state_judgment_review').title+'\n'+sourceMap.get('state_judgment_review').url);
}
// 10. Common document spine, route-specific implementation
{
const s=add(10,'The document sequence');
numberedRows(s,[['Authority and predicate worksheet','Source text, facts, evidence status, and missing items'],['Authorized request, motion, or petition','Requested relief tied to the correct procedure'],['Filing and service record','Accepted filing, delivery proof, and the operative deadline'],['Response, hearing, and reasoned decision','The process required in this route and posture'],['Review request and remedy verification','Further procedure when available, followed by implementation']],{y:158,rowH:86});
}
// 11. Scope of compulsion and review
{
const s=add(11,'Authorized enforcement');
table(s,[['Possible route','What must be verified'],['Review or appeal','Reviewable decision, standing, record, timing, and court'],['Motion to enforce an order','Existing order, operative duty, noncompliance, and procedure'],['Mandamus or similar relief','A sufficiently clear duty and every jurisdictional requirement'],['Federal APA claim','Federal agency action, reviewability, and the specific statutory basis']],72,155,1136,381,[392,744],25);
text(s,'A complaint, demand, or affidavit does not create a duty that the law lacks.',72,558,1136,60,25,C.navy,true);
note(s,sourceSet[6].join('\n'));
note(s,['mandamus','apa_701','apa_704','apa_706','fl_appellate_rules'].map(id=>sourceMap.get(id).title+'\n'+sourceMap.get(id).url).join('\n\n'));
}
// 12. Remedy closure is operational, some requirements engineering proposals
{
const s=add(12,'Verified remedy',{dark:true});
const a=node(s,'Source record\ncorrected',72,176,470,112,{stroke:C.gold,fill:C.navy,color:C.white,size:32});
const b=node(s,'Known recipients\naddressed',738,176,470,112,{stroke:C.gold,fill:C.navy,color:C.white,size:32});
const c=node(s,'Practical access\nrestored',72,415,470,112,{stroke:C.gold,fill:C.navy,color:C.white,size:32});
const d=node(s,'Dependent decisions\nreassessed',738,415,470,112,{stroke:C.gold,fill:C.navy,color:C.white,size:32});
connect(s,a,b);connect(s,b,d,{from:'bottom',to:'top'});connect(s,d,c,{from:'left',to:'right'});connect(s,c,a,{from:'top',to:'bottom',dashed:true});
text(s,'Verification checks must distinguish legal obligations from proposed assurance practices.',72,570,1136,58,24,'#D4DEE7');
}
// 13. Practice example
{
const s=add(13,'Practice A: wrong record, two clocks');
smallLabel(s,'Fictional case and numbered training days',72,150,1100);
const wrong=node(s,'R-814',72,216,300,92,{size:40});
const dest=node(s,'R-184',466,216,300,92,{size:40});connect(s,wrong,dest);
text(s,'Wrong record imported',827,235,381,65,29,C.gray);
text(s,'Today: D8',72,365,240,60,34,C.navy,true);
table(s,[['Separate clock','Deadline'],['Internal review of adverse decision','D15'],['Correction determination','D16']],355,356,853,190,[636,217],26);
text(s,'The correction request does not pause the internal review deadline.',72,585,1136,45,27,C.navy,true);
}
// 14. Practice example
{
const s=add(14,'Practice B: service access');
smallLabel(s,'Fictional case and numbered training days',72,150,1100);
table(s,[['Actor or event','Evidence in the packet'],['Parent contact','Completed D2'],['Agency must make service available','Due D7'],['Original attendance window','Ends D30'],['Provider reports first approved place','D45']],72,205,1136,338,[575,561],26);
text(s,'Existing case: request supported relief and verify actual service access.',72,581,1136,50,27,C.navy,true);
}
// 15. Practice example
{
const s=add(15,'Practice C: a required determination');
smallLabel(s,'Fictional case and numbered training days',72,150,1100);
const complete=node(s,'Complete application\nacknowledged D0',72,214,480,105,{size:30});
const decision=node(s,'Written determination\ndue D20',728,214,480,105,{size:30});connect(s,complete,decision);
text(s,'On D24, check the record',72,377,1136,55,34,C.navy,true);
text(s,'Did a decision issue? Was delivery unsuccessful? Does an exception apply?',72,449,1136,68,27,C.gray);
text(s,'Required act: issue a determination. Approval remains a separate merits question.',72,572,1136,65,27,C.navy,true);
note(s,sourceSet[6].join('\n'));
}
// 16. Flipped classroom exercise
{
const s=add(16,'Classroom practice');
text(s,'Bring one completed decision trace.',72,153,1136,58,36,C.navy,true);
table(s,[['Group role','Work product'],['Recorder','A factual record with sources and uncertainty'],['Authority researcher','The source and required predicates'],['Procedure mapper','The forum, document sequence, and clocks'],['Independent reviewer','Counterevidence and remedy verification'],['Affected person perspective','Practical consequences and timekeeping']],72,229,1136,350,[356,780],25);
text(s,'Rotate roles. Challenge another group’s trace. Revise the weakest link.',72,603,1136,42,25,C.navy);
}
// 17. Primary-source index and disclosure
{
const s=add(17,'Source index and lesson use');
smallLabel(s,'Constitutional authority',72,157,500);
text(s,'National Archives\nDeclaration of Independence\nU.S. Constitution',72,201,520,142,27,C.navy);
smallLabel(s,'Florida sources',72,373,500);
text(s,'Florida Constitution\nChapter 39, Florida Statutes\nJuvenile and appellate rules',72,417,520,150,27,C.navy);
smallLabel(s,'Federal administrative procedure',692,157,516);
text(s,'5 U.S.C. §§ 702, 704, 706\nNorton v. SUWA, 542 U.S. 55 (2004)',692,201,516,142,27,C.navy);
smallLabel(s,'Use and review',692,373,516);
text(s,'Open primary source links in slide notes.\nVerify the current law before use.\nSource review: October 9, 2026.',692,417,516,145,25,C.navy);
text(s,'AI-assisted narration. Educational material. Sources and review date accompany the lesson.',72,589,1136,40,20,C.gray);
note(s,'Primary source index\n\n'+sourceSet.map(x=>x.join('\n')).join('\n\n')+'\n\n'+['apa_702','apa_704','apa_706','state_judgment_review'].map(id=>sourceMap.get(id).title+'\n'+sourceMap.get(id).url).join('\n\n')+'\n\nAI-assisted narration. Educational material. Sources and review date accompany the lesson.\nSource review: October 9, 2026. A working educational model, not a completed filing for an individual case.');
}

await fs.mkdir(path.join(TMP,'renders'),{recursive:true});
await fs.mkdir(path.dirname(FINAL),{recursive:true});
const candidate=path.join(TMP,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
await fs.writeFile(path.join(TMP,'presentation.json'),JSON.stringify(p.toProto()));
const tableOwners=[3,5,6,7,10,12,14,15,17];
await finalizePresentation({workspaceDir:ROOT,candidatePath:candidate,finalPath:FINAL,pythonExecutable:process.env.RUNTIME_PYTHON,integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...tableOwners.flatMap(n=>['--require-native-table-slide',String(n)])],explicitTotalSlideCount:18,requiredNativeTableOwnerSlides:tableOwners,requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(TMP,path.basename(FINAL)+'.validation.json')});
for(let i=0;i<p.slides.items.length;i++){const s=p.slides.items[i];const blob=await p.export({slide:s,format:'png',scale:1.5});await fs.writeFile(path.join(TMP,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));const layout=await s.export({format:'layout'});await fs.writeFile(path.join(TMP,'renders',`slide-${String(i+1).padStart(2,'0')}.layout.json`),await layout.text());}
console.log(JSON.stringify({deck:FINAL,slides:p.slides.items.length,renders:path.join(TMP,'renders')}));
