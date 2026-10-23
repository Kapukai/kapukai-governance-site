// DOM behavior check; this is not a browser layout or screenshot test.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_MODULE || 'jsdom');
const web = path.resolve(__dirname, '../public/evidence');
(async () => {
  const errors=[];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = await JSDOM.fromFile(path.join(web,'index.html'), {
    runScripts:'dangerously', resources:'usable', virtualConsole:vc, pretendToBeVisual:true,
    beforeParse(w){w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'}}
  });
  await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
  const w=dom.window,d=w.document;
  const count=()=>d.querySelectorAll('.case-card').length;
  assert.equal(count(),21,'initial case count');
  const search=d.querySelector('#search');search.value='Frank R. Olson';search.dispatchEvent(new w.Event('input'));
  assert.equal(count(),1,'search narrows to Olson');
  search.value='no-such-case-zqx';search.dispatchEvent(new w.Event('input'));
  assert.equal(count(),0);assert.match(d.querySelector('.empty').textContent,/No case/);
  d.querySelector('#filters').reset();await new Promise(r=>setTimeout(r,20));assert.equal(count(),21);
  const status=d.querySelector('#status');status.value='documented';status.dispatchEvent(new w.Event('change'));assert.equal(count(),5);
  const category=d.querySelector('#category');category.value='Documented comparators';category.dispatchEvent(new w.Event('change'));assert.equal(count(),3);
  d.querySelector('#filters').reset();await new Promise(r=>setTimeout(r,20));
  const details=d.querySelector('.card-detail');details.open=true;assert.ok(details.querySelectorAll('.timeline li').length>0);
  const cite=details.querySelector('[data-source]');cite.click();await new Promise(r=>setTimeout(r,30));assert.ok(d.querySelector('.source-register').open);assert.match(w.location.hash,/source-/);
  assert.equal(d.querySelectorAll('.source-item').length,71);
  assert.equal(d.querySelectorAll('.control-row').length,20);
  assert.equal(d.querySelectorAll('input[type=file]').length,0);
  assert.equal(d.querySelector('#contribution-action a').getAttribute('href'),'contribution-template.md');
  for(const a of d.querySelectorAll('a.download-card'))assert.ok(fs.existsSync(path.resolve(web,new URL(a.href).pathname))||fs.existsSync(new URL(a.href)));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({status:'PASS',checks:['21 cases render','Search matching and empty states','Reset restores collection','Documented filter: 5','Comparator category intersection: 3','Timeline contents','Source click expands source register and navigates','71 source records','20 control domains','No fake upload intake','Contribution template link','Packaged download files','No DOM execution errors'],limitation:'DOM tests do not verify browser layout or responsive rendering.'},null,2));
  w.close();
})().catch(e=>{console.error(e);process.exitCode=1});
