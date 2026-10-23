/* No remote services, tracking, uploads or account access. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => { try { const u = new URL(value, window.location.href); return ['https:', 'http:', 'file:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const sourceAnchor = id => 'source-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
  let data;
  let sources;
  const citations = ids => '<div class="citations">' + [...new Set(ids || [])].map(id => sources.has(id) ? `<a class="cite" href="#${sourceAnchor(id)}" data-source="${esc(id)}" title="${esc(sources.get(id).title)}">${esc(id)} ↗</a>` : '').join('') + '</div>';
  const paragraphs = text => `<p>${esc(text)}</p>`;
  function caseCard(c) {
    const status = ['documented','disputed','unresolved'].includes(c.evidence_status) ? c.evidence_status : 'unresolved';
    const timeline = (c.timeline || []).map(t => `<li><time>${esc(t.date)}</time><p>${esc(t.event)}</p>${citations(t.source_ids)}</li>`).join('');
    const claims = (c.claims || []).map(x => `<div class="claim"><p><strong>${esc(x.claim)}</strong></p><p class="claim-label">${esc(x.status)}</p><p>${esc(x.assessment)}</p>${citations(x.source_ids)}</div>`).join('');
    return `<article class="case-card" id="${esc(c.id)}"><div class="card-top"><span class="case-id">${esc(c.id)}</span><span class="badge ${status}">${status}</span></div><h3>${esc(c.name)}</h3><p class="summary">${esc(c.summary)}</p><div class="finding"><strong>Current assessment</strong>${esc(c.status)}</div><details class="card-detail"><summary>Read timeline &amp; evidence</summary><div class="detail-body">${timeline ? `<h4>Chronology</h4><ol class="timeline">${timeline}</ol>` : ''}${claims ? `<h4>Claim assessment</h4>${claims}` : ''}${c.significance ? `<h4>Why this case matters</h4>${paragraphs(c.significance)}` : ''}${c.gaps?.length ? `<h4>Evidence still needed</h4><ul>${c.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>` : ''}<h4>Case sources</h4>${citations(c.source_ids)}</div></details></article>`;
  }
  function renderCases() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const status = $('#status').value, category = $('#category').value;
    const filtered = data.cases.filter(c => (status === 'all' || c.evidence_status === status) && (category === 'all' || c.category === category) && (!query || JSON.stringify(c).toLocaleLowerCase().includes(query)));
    $('#result-count').textContent = `${filtered.length} of ${data.cases.length} case files · labels apply to the stated assessment`;
    $('#case-grid').innerHTML = filtered.length ? filtered.map(caseCard).join('') : '<p class="empty">No case files match these filters. Try a broader search or select Reset.</p>';
  }
  function render() {
    sources = new Map((data.sources || []).map(s=>[s.id,s]));
    $('#case-count').textContent=data.cases.length;
    $('#source-count').textContent=sources.size;
    $('#domain-count').textContent=(data.domains || []).length;
    $('#as-of').textContent=data.as_of || 'Research edition';
    $('#version').textContent=`Version ${data.version || '1.0'} · ${data.as_of || ''}`;
    [...new Set(data.cases.map(c=>c.category).filter(Boolean))].sort().forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;$('#category').append(o)});
    renderCases();
    $('#atlas-grid').innerHTML=(data.atlas || []).map(a=>`<figure class="atlas-figure"><a href="${esc(safeURL(a.src))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(safeURL(a.src))}" alt="${esc(a.alt || a.title)}"></a><figcaption><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></figcaption></figure>`).join('');
    $('#controls-list').innerHTML=(data.domains || []).map(d=>`<details class="control-row"><summary><span>${esc(d.id)}</span><strong>${esc(d.domain)}</strong></summary><div class="control-content"><p><strong>Question to test</strong>${esc(d.hypothesis)}</p><p><strong>Records to seek</strong>${esc(d.evidence)}</p><p><strong>Alternative explanations</strong>${esc(d.alternatives)}</p><p><strong>Suitable expertise</strong>${esc(d.reviewer)}</p><p><strong>Control to assess</strong>${esc(d.control)}</p>${citations(d.source_ids)}</div></details>`).join('');
    $('#downloads-grid').innerHTML=(data.downloads || []).map(d=>`<a class="download-card" href="${esc(safeURL(d.href))}" download><span class="download-format">${esc(d.format || 'DOWNLOAD')}</span><h3>${esc(d.title)}</h3><p>${esc(d.description)}</p><span class="download-arrow">Download ↓</span></a>`).join('');
    $('#source-register-count').textContent=`(${sources.size} records)`;
    $('#source-list').innerHTML=[...sources.values()].map(s=>`<article class="source-item" id="${sourceAnchor(s.id)}"><code>${esc(s.id)}</code><br><a class="source-title" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.author)} · ${esc(s.date)} · ${esc(s.type)}</p><p><strong>Locator:</strong> ${esc(s.locator || 'See linked source')}</p><p><strong>Supports:</strong> ${esc(s.scope)}</p><p><strong>Limits:</strong> ${esc(s.limitations)}</p></article>`).join('');
    const repo=data.public_repository_url;
    $('#contribution-action').innerHTML=repo && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(repo) ? `<a class="button" href="${esc(repo.replace(/\/$/,''))}/issues/new/choose" target="_blank" rel="noopener noreferrer">Propose a public correction ↗</a>` : '<a class="button" href="contribution-template.md" download>Download contribution template ↓</a>';
    $('#filters').addEventListener('submit',e=>e.preventDefault());
    ['search','status','category'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',renderCases));
    $('#filters').addEventListener('reset',()=>setTimeout(renderCases,0));
    document.addEventListener('click',e=>{const a=e.target.closest('[data-source]');if(a){e.preventDefault();$('.source-register').open=true;requestAnimationFrame(()=>{$('#'+sourceAnchor(a.dataset.source)).scrollIntoView({behavior:'smooth',block:'start'});location.hash=sourceAnchor(a.dataset.source);});}});
    if(location.hash.startsWith('#source-')){$('.source-register').open=true;document.getElementById(location.hash.slice(1))?.scrollIntoView();}
  }
  async function start() {
    try {
      if(location.protocol==='file:') data=window.KAPUKAI_PUBLIC_DATA;
      else { const response=await fetch('public-data.json',{cache:'no-cache'});if(!response.ok)throw Error('Data request failed');data=await response.json(); }
      if(!data || !Array.isArray(data.cases) || !Array.isArray(data.sources))throw Error('Research data is missing or incomplete');
      render();
    } catch(error) {
      if(window.KAPUKAI_PUBLIC_DATA && !data){data=window.KAPUKAI_PUBLIC_DATA;render();}
      else {$('#result-count').textContent='The research data could not be loaded.';$('#case-grid').innerHTML='<p class="error-banner">Please reload the page or open <a href="public-data.json">the research data directly</a>.</p>'; console.error(error);}
    }
  }
  start();
})();
