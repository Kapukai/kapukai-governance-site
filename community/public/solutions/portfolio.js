'use strict';
const cards=[...document.querySelectorAll('.resource')];
const search=document.querySelector('#search'),group=document.querySelector('#group'),stage=document.querySelector('#stage');
for(const [select,key] of [[group,'group'],[stage,'stage']])for(const value of [...new Set(cards.map(c=>c.dataset[key]))]){const o=document.createElement('option');o.value=value;o.textContent=value;select.append(o);}
function filter(){const q=search.value.trim().toLocaleLowerCase();let n=0;for(const card of cards){const visible=(!q||card.textContent.toLocaleLowerCase().includes(q))&&(group.value==='all'||card.dataset.group===group.value)&&(stage.value==='all'||card.dataset.stage===stage.value);card.hidden=!visible;if(visible)n++;}document.querySelector('#count').textContent=`${n} of ${cards.length} public resources`;document.querySelector('#empty').hidden=n!==0;}
search.addEventListener('input',filter);group.addEventListener('change',filter);stage.addEventListener('change',filter);document.querySelector('#reset').addEventListener('click',()=>{search.value='';group.value=stage.value='all';filter();search.focus();});filter();
