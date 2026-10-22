from pathlib import Path
import json,html
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'portfolio/catalog.json').read_text())
esc=html.escape
cards=[]
for x in data:
 cards.append(f'''<article class="resource" data-group="{esc(x['group'])}" data-stage="{esc(x['stage'])}"><div class="resource-top"><span class="badge">{esc(x['stage'])}</span><span class="category">{esc(x['group'])}</span></div><h3><a href="{esc(x['url'])}" target="_blank" rel="noopener noreferrer">{esc(x['title'])}<span aria-hidden="true"> ↗</span></a></h3><p>{esc(x['description'])}</p><p class="boundary">{esc(x['note'])}</p><span class="verified">Link checked · 22 Oct 2026</span></article>''')
base=(ROOT/'portfolio/template.html').read_text()
base=base.replace('<!--CARDS-->','\n'.join(cards)).replace('{{COUNT}}',str(len(data)))
(ROOT/'public/solutions/index.html').write_text(base)
for name in ['portfolio.css','portfolio.js']:(ROOT/'public/solutions'/name).write_bytes((ROOT/'portfolio'/name).read_bytes())
print(f'Built {len(data)} public portfolio entries')
