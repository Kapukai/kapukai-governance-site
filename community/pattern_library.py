"""Build a reusable, source-linked visual pattern library from one content file."""
from html import escape
from pathlib import Path
import json
import shutil
import zipfile

BASE = Path(__file__).resolve().parent
DOWNLOAD = '/community/files/architecture-of-power/pattern-kit/'
GROUPS = {'information': 'Information', 'responsibility': 'Responsibility', 'incentives': 'Incentives'}

def build_patterns(page, output):
    data = json.loads((BASE / 'pattern-library.json').read_text())
    patterns = data['patterns']
    sources = data['sources']
    kit = BASE / 'assets/files/architecture-of-power/pattern-kit'
    kit.mkdir(parents=True, exist_ok=True)
    (kit / 'pattern-library.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    template = {'id':'P09', 'version':'0.1-draft', 'title':'', 'group':'', 'insight':'', 'observe':'', 'evidence_needed':'', 'measure':'', 'repair':'', 'tradeoff':'', 'counterexample':'', 'image_description':'', 'source_ids':[], 'claim_type':'conceptual illustration and proposed tests', 'verification_state':'unassessed', 'scope':{'institution':'','decision_type':'','period':'','authority':''}, 'editorial_gate':'Add only a distinct mechanism that changes what a reader would inspect and offers a repair that can be tested.'}
    (kit / 'new-pattern-template.json').write_text(json.dumps(template, indent=2) + '\n')
    readme = '''# Kapukai Visual Pattern Kit

Version 1.0 · 16 October 2026

Eight conceptual patterns and proposed tests for public decision systems.
These diagrams are illustrative. They do not establish prevalence, present agency performance, national rankings, or coordinated intent.

## Contents

- SVG vector masters: scalable diagrams with editable text and geometry.
- PNG images: 1080 × 1350 pixels for presentations and publishing.
- pattern-library.json: definitions, recognition tests, metrics, repair ideas, tradeoffs, counterexamples, evidence requirements and sources.
- new-pattern-template.json: a blank research capture form for a possible next pattern; not a published finding.

## How to use

1. Start with the question you need to investigate.
2. Choose one pattern. Define the institution, decision, people, time period and applicable authority.
3. Draw the actual path using records, owners, versions and timestamps.
4. Keep proposed mechanisms separate from documented findings. Show missing evidence explicitly.
5. Test the repair and verify its effect. Record unresolved cases and recurrence.

For a new card, use the template to capture a distinct mechanism. Add examples of an existing mechanism to its source record instead of multiplying near-duplicate cards.

Maintainers: the source generator is in the public repository at https://github.com/Kapukai/kapukai-governance-site/blob/main/community/pattern_art.py. Add a diagram function only after the mechanism and test are clear. The generator is not included in this download.

Public library: https://kapukai-community.vercel.app/architecture-of-power/patterns/
Research: https://kapukai-community.vercel.app/architecture-of-power/

## Rights and attribution

The repository's existing Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International license applies. Preserve attribution when sharing the unchanged cards noncommercially. Public distribution of modified cards or commercial reuse requires separate permission from Kapukai. The vector masters support Kapukai's own editing and separately authorized adaptations.
License: https://creativecommons.org/licenses/by-nc-nd/4.0/
Contact: architect@kapukai.org

## Editorial rule

A pattern is a mechanism to investigate; a documented occurrence needs scoped evidence. A demonstrated occurrence does not establish frequency, cause or intent elsewhere. Keep independent review, privacy and lawful authority visible in any adaptation.
'''
    (kit / 'README.md').write_text(readme)
    # Deterministic archive: exact same inputs produce the same downloadable kit.
    archive = kit / 'kapukai-visual-pattern-kit-v1.0.zip'
    names = ['README.md', 'pattern-library.json', 'new-pattern-template.json'] + [p['id'].lower()+'-'+p['slug']+ext for p in patterns for ext in ('.svg','.png')]
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in names:
            payload = (kit / name).read_bytes()
            entry = zipfile.ZipInfo('kapukai-visual-pattern-kit-v1.0/' + name, date_time=(2026,10,16,12,0,0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, payload)
    destination = output / DOWNLOAD.lstrip('/')
    destination.mkdir(parents=True, exist_ok=True)
    for name in names + [archive.name]:
        shutil.copy2(kit / name, destination / name)

    nav = ''.join(f'<a href="#{p["id"].lower()}" data-pattern-link="{p["id"].lower()}"><span>{p["id"]}</span>{escape(p["title"])}</a>' for p in patterns)
    cards = []
    for p in patterns:
        pid = p['id'].lower()
        stem = pid + '-' + p['slug']
        source_links = ''.join(f'<li><a href="{escape(sources[s]["url"], quote=True)}">{escape(sources[s]["label"])}</a><span>{escape(sources[s]["scope"])}</span></li>' for s in p['source_ids'])
        cards.append(f'''<article class="pk-pattern" id="{pid}" data-pattern="{pid}" data-group="{p['group']}" aria-labelledby="{pid}-title">
<div class="pk-pattern-header"><p class="pk-kicker">{p['id']} / {GROUPS[p['group']]} / Conceptual pattern</p><h2 id="{pid}-title">{escape(p['title'])}</h2><p class="pk-insight">{escape(p['insight'])}</p></div>
<div class="pk-pattern-layout"><figure><a href="{DOWNLOAD}{stem}.svg" aria-label="Open full-size diagram: {escape(p['title'],quote=True)}"><img src="{DOWNLOAD}{stem}.svg" width="1080" height="1350" loading="lazy" alt="{escape(p['image_description'],quote=True)}"></a><figcaption>Illustrative mechanism · Proposed tests · v{data['version']}</figcaption><div class="pk-downloads"><a href="{DOWNLOAD}{stem}.png" download>PNG image</a><a href="{DOWNLOAD}{stem}.svg" download>SVG master</a></div></figure>
<div class="pk-pattern-copy"><dl><dt>Recognize</dt><dd>{escape(p['observe'])}</dd><dt>Inspect</dt><dd>{escape(p['evidence_needed'])}</dd><dt>Measure</dt><dd>{escape(p['measure'])}</dd><dt>Repair to test</dt><dd>{escape(p['repair'])}</dd></dl><div class="pk-tradeoff"><h3>Keep the tradeoff visible</h3><p>{escape(p['tradeoff'])}</p><p><strong>Check another explanation:</strong> {escape(p['counterexample'])}</p></div><details><summary>Sources and limits of the claim</summary><p>These references support the design principle or a scoped example. The card itself is a conceptual illustration, not a finding about every institution.</p><ul class="pk-sources">{source_links}</ul></details><p class="pk-permalink"><a href="#{pid}" data-copy-link="{pid}">Link to {p['id']}</a></p></div></div></article>''')

    body = f'''<div class="pattern-library"><p class="pk-kicker">Kapukai Governance Lab / Architecture of Power</p><h1>See the pattern.<br>Test the repair.</h1><p class="pk-lead">A visual library for the moments when information, responsibility or correction break down. Eight reusable patterns turn a broad concern into a specific question you can investigate.</p><div class="pk-top-actions"><a class="button" href="{DOWNLOAD}{archive.name}" download>Download the visual kit</a><a href="/architecture-of-power/">Read the investigation →</a></div><p class="pk-edition">Version {data['version']} · 16 October 2026 · 8 vector masters + 8 PNG images + definitions and sources</p>
<section class="pk-principle"><p class="pk-kicker">The question that connects the kit</p><h2>Can a system prevent and correct harm as reliably as it exercises power?</h2><p>Follow the consequence. Trace the correction. Identify who can act, what evidence they need, and how anyone knows the repair worked.</p></section>
<section class="pk-how"><h2>One pattern. One test. A visible result.</h2><div><p><strong>1. Choose a question.</strong><br>Start with the part of the process you cannot explain.</p><p><strong>2. Map the real workflow.</strong><br>Add sources, authority, owners, versions and timestamps.</p><p><strong>3. Test a repair.</strong><br>Measure burden, protection and recurrence together.</p></div><p class="pk-note">The practical “hack” is the inspection question: it helps you locate missing evidence or responsibility. Each repair remains a proposal until tested.</p></section>
<div class="pk-explorer" id="patterns"><aside class="pk-picker"><h2>Find the pattern</h2><label for="pattern-group">Focus</label><select id="pattern-group" disabled><option value="all">All patterns</option><option value="information">Information</option><option value="responsibility">Responsibility</option><option value="incentives">Incentives</option></select><nav aria-label="Visual patterns">{nav}</nav><p id="pattern-count" class="pk-note" role="status" aria-live="polite">8 patterns</p><button type="button" id="pattern-show-all" hidden>Show all patterns</button></aside><div class="pk-records">{''.join(cards)}</div></div>
<section class="pk-governance" id="using-the-kit"><p class="pk-kicker">A library that can learn</p><h2>Keep the pattern separate from the finding.</h2><div class="pk-evidence-rules"><div><h3>What kind of claim?</h3><p>Conceptual illustration · proposed test · documented case finding · cross-case finding.</p></div><div><h3>What is its evidence status?</h3><p>Unassessed · supported within a stated scope and date · disputed · superseded.</p></div></div><p>All eight cards begin as conceptual patterns with proposed tests. An official case report can establish a specific occurrence. It does not establish prevalence, a national ranking or coordinated intent. Changes in wording, evidence or diagrams receive a new version.</p><p><strong>Keep the collection selective.</strong> Add a card only when it explains a distinct mechanism, changes what someone would inspect, and offers a repair that can be tested. Put new examples of an existing mechanism under the existing card. <a href="/community/files/architecture-of-power/pattern-kit/new-pattern-template.json">Download the new-pattern template</a>.</p><details><summary>Choose the right visual for the question</summary><ul><li><strong>Where does an error spread?</strong> Use the provenance and correction networks: P01, P03 and P04.</li><li><strong>Who owns the next action?</strong> Use the handoff and review maps: P02 and P07.</li><li><strong>Did the fix reach the person?</strong> Use the outcome chain: P05.</li><li><strong>Which requirements can we simplify?</strong> Use the burden/protection matrix: P06, alongside the article’s dependency map.</li><li><strong>What behavior does the system encourage?</strong> Use the measurement feedback loop: P08.</li></ul></details><p><a href="/architecture-of-power/#evidence-map">Inspect the dated safeguard heatmap</a> · <a href="/architecture-of-power/atlas/">Open the institutional atlas</a> · <a href="{DOWNLOAD}pattern-library.json">Read the definitions and source data</a></p><p class="pk-note">Sharing follows Kapukai’s existing <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0 license</a>. Contact the lab about adapted or commercial use. <a href="/community/contact/">Suggest a source correction or a new pattern</a> using public information.</p></section></div>'''
    page('architecture-of-power/patterns', 'Visual Pattern Library — Architecture of Power', 'Eight visual patterns for tracing consequential decisions, identifying missing safeguards, reducing procedural burden, and testing whether corrections reach people.', body, 'pattern-library.js')
    target = output / 'architecture-of-power/patterns/index.html'
    html = target.read_text().replace('</head>', '<link rel="stylesheet" href="/assets/community/pattern-library.css"></head>')
    html = html.replace('<body>', '<body class="pattern-site">')
    target.write_text(html)
    assets = output / 'assets/community'
    for name in ['pattern-library.css','pattern-library.js']:
        shutil.copy2(BASE / 'assets' / name, assets / name)
