"""Static public archive for the Architecture of Power institutional maps.

The original conversation visuals used inline JavaScript and host-only styles.
This appendix preserves their meaning with HTML and SVG that need no JavaScript.
Call build_atlas(page, P) from the community build; no deployment is performed.
"""
from html import escape
from pathlib import Path
import shutil


FILES = (
    ("authority-review-and-correction-atlas.pdf", "Authority, Review and Correction Atlas"),
    ("human-safety-systems-atlas.pdf", "Human Safety Systems Atlas"),
)

SOURCES = {
    "fl-suspensions": ("FLHSMV: common suspensions and revocations", "https://www.flhsmv.gov/driver-licenses-id-cards/driver-license-suspensions-revocations/other-suspensions-revocations/"),
    "fl-courts": ("FLHSMV: traffic citations and court suspensions", "https://www.flhsmv.gov/driver-licenses-id-cards/driver-license-suspensions-revocations/traffic-citations-court-suspensions/"),
    "bar": ("FLHSMV: Bureau of Administrative Reviews hearing form", "https://www.flhsmv.gov/pdf/forms/78065.pdf"),
    "bar-audit": ("FLHSMV Inspector General: BAR audit 2023/24-18", "https://www.flhsmv.gov/pdf/igoffice/202324-18.pdf"),
    "fl-review": ("Florida Statutes §322.31: judicial review", "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0322/Sections/0322.31.html"),
    "court-options": ("California Courts: options other than an appeal", "https://selfhelp.courts.ca.gov/appeals/other-options"),
    "court-admin": ("California Rule of Court 10.603: presiding judge responsibilities", "https://courts.ca.gov/cms/rules/index/ten/rule10_603"),
    "ca-cjp": ("California Commission on Judicial Performance: complaints and limits", "https://cjp.ca.gov/file_a_complaint/"),
    "ok-cojc": ("Oklahoma Council on Judicial Complaints: role and limits", "https://oklahoma.gov/cojc/about.html"),
    "ca-fcs": ("Los Angeles Superior Court: child custody mediation", "https://www.lacourt.org/division/familylaw/FL0050.aspx"),
    "ssa-appeal": ("SSA: benefits appeal stages", "https://www.ssa.gov/apply/appeal-decision-we-made"),
    "ssa-correct": ("20 CFR §401.65: record correction and known-recipient notice", "https://www.ssa.gov/OP_Home/cfr20/401/401-0065.htm"),
    "ssa-refusal": ("20 CFR §401.70: review of correction/access refusals", "https://www.ssa.gov/OP_Home/cfr20/401/401-0070.htm"),
    "ssa-id": ("20 CFR §422.110: personal identifying record changes", "https://www.ssa.gov/OP_Home/cfr20/422/422-0110.htm"),
    "ssa-oig": ("SSA OIG: mission and functions", "https://oig.ssa.gov/about-oig/"),
    "mt-dli": ("Montana Labor and Industry: administrative hearings", "https://dli.mt.gov/hearings/"),
    "mt-dphhs": ("Montana Public Health and Human Services: administrative hearings", "https://dphhs.mt.gov/administrativehearings/"),
    "mt-ui": ("Montana: unemployment-insurance appeals", "https://dli.mt.gov/hearings/faqs/unemployment-insurance-faq"),
    "mt-review": ("Montana Code §2-4-704: judicial review", "https://mca.legmt.gov/bills/mca/title_0020/chapter_0040/part_0070/section_0040/0020-0040-0070-0040.html"),
    "911-roles": ("National 911 Program: federal and local responsibilities", "https://www.911.gov/about/"),
    "911-help": ("National 911 Program: service concerns and local complaint routing", "https://www.911.gov/calling-911/frequently-asked-questions/"),
    "dot": ("U.S. DOT: FAA, FRA and NHTSA responsibilities", "https://www.transportation.gov/administrations"),
    "csb": ("Chemical Safety Board: independent investigation and recommendations", "https://www.csb.gov/about-the-csb/mission/"),
    "va": ("VA Research: environmental checklist and inpatient outcomes", "https://www.research.va.gov/currents/1116-7.cfm"),
    "stpa": ("ICAO: STPA safety control structures and unsafe actions", "https://www.icao.int/sites/default/files/SMI/TrainingDocs/Chapter%202%20Safety%20Management%20Fundamentals/2.6-05-SRM-Methodology-STPA.pdf"),
    "nist": ("NIST AI RMF Core: Govern, Map, Measure, Manage", "https://airc.nist.gov/airmf-resources/airmf/5-sec-core/"),
    "evidence": ("NISTIR 8387: Digital Evidence Preservation", "https://doi.org/10.6028/NIST.IR.8387"),
    "process": ("Process Mining: event data", "https://www.processmining.org/event-data.html"),
}


def refs(*keys):
    return '<p class="atlas-sources">Sources: ' + ' · '.join(
        f'<a href="{escape(SOURCES[k][1], quote=True)}">{escape(SOURCES[k][0])}</a>'
        for k in keys
    ) + '</p>'


def lane(title, steps, note):
    return '<section class="atlas-lane"><h3>' + escape(title) + '</h3><ol>' + ''.join(
        f'<li><strong>{escape(a)}</strong><span>{escape(b)}</span></li>' for a, b in steps
    ) + '</ol><p class="atlas-lane-note">' + escape(note) + '</p></section>'


def relationships_table():
    rows = (
        ("Courts", "Judicial decisions and authorized review", "Trial courts issue orders; reviewing courts exercise their assigned jurisdiction.", "Motions, appeals and writs are distinct procedures. A clerk, court administrator or conduct complaint does not itself reverse an order.", ("court-options", "court-admin")),
        ("Judicial conduct bodies", "Conduct investigation and discipline/referral", "California CJP and Oklahoma COJC address conduct under their respective powers.", "Their work is separate from reviewing whether a particular judgment should change.", ("ca-cjp", "ok-cojc")),
        ("Florida FLHSMV / DMV", "State executive administration", "Licensing and driving records; BAR handles specified administrative reviews.", "A source-record correction, a challenge to a licensing decision and a hardship request are different routes. Qualifying final licensing orders have circuit-court review under §322.31.", ("fl-suspensions", "bar", "fl-review")),
        ("Social Security Administration", "Federal executive administration and agency adjudication", "Benefits decisions, identity records and record-specific correction processes.", "The benefits appeal ladder is not a universal route for every identity or records issue. SSA OIG is a separate oversight body.", ("ssa-appeal", "ssa-correct", "ssa-oig")),
        ("Montana hearing offices", "Program-specific administrative adjudication", "Labor and Industry and Public Health and Human Services have administrative-hearing functions; unemployment has a specified appeal route.", "These examples are not one general statewide tribunal. That organizational arrangement is not evidence of corruption or of absent review.", ("mt-dli", "mt-dphhs", "mt-ui", "mt-review")),
        ("FCC", "Communications regulation", "Relevant telephone-service provider obligations for delivering 911 calls.", "The FCC does not oversee local 911 answering-center operations. It is not the aviation regulator.", ("911-roles",)),
        ("FAA", "Civil aviation safety regulation", "Aircraft, airmen and airport certification, safety rules and aviation oversight within assigned authority.", "The FAA is not a general referee for courts, driver-licensing decisions or SSA records.", ("dot",)),
        ("Local 911 authorities", "Local emergency-call operations", "The local center and its governing authority handle service operations and local service concerns.", "The National 911 Program coordinates; it does not command every local emergency response.", ("911-roles", "911-help")),
        ("Inspectors general / auditors", "Audit, evaluation and investigation", "Examine specified institutional practices and controls; publish findings and recommendations.", "An oversight finding is not itself an individual benefits appeal, a stay or a reversal.", ("ssa-oig", "bar-audit")),
        ("Chemical Safety Board", "Independent incident investigation", "Investigates chemical incidents and makes safety recommendations.", "CSB does not issue fines or citations; investigation and enforcement are different functions.", ("csb",)),
    )
    out = '<div class="table-wrap"><table class="atlas-roles"><caption>Institutional roles and boundaries · Selected U.S. examples</caption><thead><tr><th scope="col">Body</th><th scope="col">Function</th><th scope="col">What it does</th><th scope="col">Boundary and sources</th></tr></thead><tbody>'
    for name, function, work, boundary, sources in rows:
        out += f'<tr><th scope="row">{escape(name)}</th><td><span class="atlas-mobile-label">Function: </span>{escape(function)}</td><td><span class="atlas-mobile-label">Role: </span>{escape(work)}</td><td><span class="atlas-mobile-label">Boundary: </span>{escape(boundary)}{refs(*sources)}</td></tr>'
    return out + '</tbody></table></div>'


def control_svg():
    # A functional model, not an assertion that every real process closes this loop.
    nodes = (
        (20, 36, "Authority owner", "Rules and resources"),
        (500, 36, "Decision process", "Human and software"),
        (500, 210, "Person / outcome", "Real-world effect"),
        (500, 384, "Evidence", "Records and measures"),
        (20, 384, "Independent review", "Authorized scope varies"),
        (20, 210, "Correction owner", "Lawful change"),
    )
    out = '<svg class="atlas-control-svg" viewBox="0 0 800 528" role="img" aria-labelledby="atlas-loop-title atlas-loop-desc"><title id="atlas-loop-title">A control loop to verify</title><desc id="atlas-loop-desc">Authority owners provide rules and resources to the decision process. Actions affect people. Evidence of outcomes reaches independent review. Findings are routed to authorized correction owners, who can revise within their powers. The accompanying ordered list provides the same sequence.</desc><defs><marker id="atlas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#17665d"/></marker></defs>'
    paths = ('M300 84 H494', 'M640 132 V204', 'M640 306 V378', 'M500 432 H306', 'M160 384 V312', 'M160 210 V138')
    for path in paths:
        out += f'<path d="{path}" fill="none" stroke="#17665d" stroke-width="2.5" marker-end="url(#atlas-arrow)"/>'
    labels = ((400, 69, "Rules + resources"), (692, 176, "Acts"), (703, 350, "Observe"), (400, 416, "Test / review"), (93, 350, "Route repair"), (108, 176, "Revise"))
    for x, y, label in labels:
        out += f'<text x="{x}" y="{y}" text-anchor="middle" font-size="16" fill="#526271">{label}</text>'
    for x, y, title, subtitle in nodes:
        out += f'<rect x="{x}" y="{y}" width="280" height="96" rx="10" fill="#fff" stroke="#b8caca"/><text x="{x+140}" y="{y+39}" text-anchor="middle" font-size="21" font-weight="650" fill="#142d42">{title}</text><text x="{x+140}" y="{y+68}" text-anchor="middle" font-size="16" fill="#526271">{subtitle}</text>'
    out += '<rect x="327" y="222" width="146" height="75" rx="10" fill="#f8f6f0" stroke="#92723a" stroke-dasharray="5 4"/><text x="400" y="247" text-anchor="middle" font-size="13" fill="#715624">PROPOSED</text><text x="400" y="271" text-anchor="middle" font-size="16" fill="#142d42">Assurance support</text><text x="400" y="292" text-anchor="middle" font-size="13" fill="#526271">Trace · test · verify</text></svg>'
    return out


def coverage_table():
    columns = ("Review / complaint route", "Oversight role", "Propagation duty", "Timely repair measured", "Human outcome verified")
    rows = (
        ("Florida DMV", ("D", "D", "?", "?", "?")),
        ("Courts · Oklahoma / California examples", ("D", "D", "?", "?", "?")),
        ("SSA", ("D", "D", "D", "?", "?")),
        ("Montana · program examples", ("D", "?", "?", "?", "?")),
        ("911 · local service / providers", ("D", "D", "?", "?", "?")),
    )
    out = '<div class="table-wrap atlas-matrix-wrap" role="region" aria-label="Evidence coverage table, scroll horizontally on small screens" tabindex="0"><table class="atlas-matrix"><caption>Evidence coverage in the original atlas · Not a performance or corruption rating</caption><thead><tr><th scope="col">System / scope</th>'
    out += ''.join(f'<th scope="col">{c}</th>' for c in columns) + '</tr></thead><tbody>'
    for name, values in rows:
        out += f'<tr><th scope="row">{name}</th>'
        for value in values:
            label = "Documented route or rule" if value == "D" else "Not assessed here"
            kind = "documented" if value == "D" else "unknown"
            out += f'<td class="atlas-{kind}"><span aria-hidden="true">{value}</span><span class="atlas-sr">{label}</span></td>'
        out += '</tr>'
    return out + '</tbody></table></div>'


def va_chart():
    return '''<figure class="atlas-va"><svg viewBox="0 0 800 246" role="img" aria-labelledby="atlas-va-title atlas-va-desc"><title id="atlas-va-title">VA inpatient mental-health units: historical before-and-after rates</title><desc id="atlas-va-desc">Inpatient suicides per 100,000 admissions were 4.2 before an environmental safety checklist and 0.74 after it. Study period 2000 to 2015; checklist introduced in 2007. This is an observed historical association, not a causal estimate or current VA rating.</desc><g font-family="system-ui, sans-serif" fill="#142d42"><text x="16" y="62" font-size="20">Before checklist</text><text x="16" y="129" font-size="20">After checklist</text><rect x="218" y="36" width="453.6" height="36" fill="#70818c"/><rect x="218" y="103" width="79.92" height="36" fill="#17665d"/><text x="684" y="63" font-size="23">4.2</text><text x="313" y="130" font-size="23">0.74</text><path d="M218 155H758" fill="none" stroke="#7b8c97"/><path d="M218 155v8 M434 155v8 M650 155v8" fill="none" stroke="#7b8c97"/><text x="218" y="187" font-size="18" text-anchor="middle">0</text><text x="434" y="187" font-size="18" text-anchor="middle">2</text><text x="650" y="187" font-size="18" text-anchor="middle">4</text><text x="488" y="226" font-size="19" text-anchor="middle">Inpatient suicides per 100,000 admissions</text></g></svg><figcaption>Study: 2000–2015. Environmental checklist introduced in 2007. The chart records a historical association; it is not a causal estimate or a current VA safety rating.</figcaption></figure><div class="table-wrap"><table><caption>Accessible data for the VA chart</caption><thead><tr><th scope="col">Checklist phase</th><th scope="col">Inpatient suicides per 100,000 admissions</th></tr></thead><tbody><tr><th scope="row">Before</th><td>4.2</td></tr><tr><th scope="row">After</th><td>0.74</td></tr></tbody></table></div>'''


STYLE = '''<style>
.architecture-atlas{--atlas-border:#b8caca}.architecture-atlas h1{max-width:900px}.architecture-atlas .lede{max-width:820px}.atlas-index{display:flex;flex-wrap:wrap;gap:10px 24px;padding:20px 0;border-block:1px solid var(--line);margin:30px 0}.atlas-index a{font-weight:650}.architecture-atlas section{scroll-margin-top:24px}.atlas-section{margin-top:58px}.atlas-section>h2{font-size:34px}.atlas-section>p{max-width:880px}.atlas-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:24px}.atlas-lane{border:1px solid var(--atlas-border);border-top:4px solid #17665d;background:white;border-radius:8px;padding:22px}.atlas-lane h3{font-size:20px;margin-bottom:20px}.atlas-lane ol{padding-left:24px;margin:0}.atlas-lane li{padding:0 0 20px 5px}.atlas-lane li span{display:block;font-size:14px;color:#526271;margin-top:4px}.atlas-lane-note{font-size:14px;border-top:1px solid var(--line);padding-top:14px}.atlas-sources{font-size:12px;line-height:1.65;margin:16px 0 0}.atlas-roles .atlas-sources{font-size:12px}.atlas-roles tbody th{width:16%}.atlas-roles td:nth-child(2){width:19%}.atlas-roles td:nth-child(3){width:27%}.atlas-roles td:nth-child(4){width:38%}.atlas-mobile-label{display:none}.atlas-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.atlas-steps{padding-left:26px}.atlas-steps li{padding:0 0 14px 5px}.atlas-steps strong{display:block}.atlas-steps span{color:#526271}.atlas-definition{border-left:3px solid #b58c45;padding:8px 20px;margin:24px 0;background:#f0ede3}.atlas-definition p{margin:6px 0}.atlas-proposal{border:2px dashed #92723a;padding:24px;border-radius:10px}.atlas-control-svg,.atlas-va svg{display:block;width:100%;height:auto;font-family:system-ui,sans-serif}.atlas-va{margin:20px 0}.atlas-va figcaption{font-size:14px;color:#526271;margin-top:8px}.atlas-control-readable{max-width:850px}.atlas-control-readable ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 42px;padding-left:25px}.atlas-system-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.atlas-system-grid article{border:1px solid var(--line);background:white;border-radius:8px;padding:24px}.atlas-system-grid h3{font-size:21px}.atlas-system-grid p{font-size:14px;margin:10px 0}.atlas-matrix{table-layout:fixed}.atlas-matrix th{font-size:13px}.atlas-matrix tbody th{width:auto}.atlas-matrix td{font-size:24px;text-align:center;font-weight:700;width:auto!important;border:3px solid white;vertical-align:middle}.atlas-documented{background:#dcebe5;color:#164e46}.atlas-unknown{background:#eef0f1;color:#526271}.atlas-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.atlas-source-list{columns:2;column-gap:40px;padding-left:23px}.atlas-source-list li{break-inside:avoid;margin:0 0 12px;font-size:14px}.atlas-downloads{display:flex;flex-wrap:wrap;gap:14px}.atlas-archive-note{font-size:14px;color:#526271}.atlas-toplink{font-size:14px;margin-top:24px}.architecture-atlas a{overflow-wrap:anywhere}.atlas-matrix-wrap:focus-visible{outline:3px solid #17665d;outline-offset:4px}
@media(max-width:850px){.atlas-lanes{grid-template-columns:1fr}.atlas-pair{grid-template-columns:1fr}.atlas-section>h2{font-size:29px}}
@media(max-width:700px){.atlas-system-grid{grid-template-columns:1fr}.atlas-mobile-label{display:inline;font-weight:650}.atlas-roles tbody th,.atlas-roles td:nth-child(n){width:auto}.atlas-matrix-wrap{overflow-x:auto}.atlas-matrix{display:table;min-width:740px}.atlas-matrix thead{display:table-header-group}.atlas-matrix tbody{display:table-row-group}.atlas-matrix tr{display:table-row}.atlas-matrix th,.atlas-matrix td,.atlas-matrix tbody th{display:table-cell;border-radius:0}.atlas-matrix caption{display:table-caption}.atlas-source-list{columns:1}.atlas-control-readable ol{grid-template-columns:1fr}.atlas-control-svg{display:none}.atlas-va svg{min-width:570px}.atlas-va{overflow-x:auto}.atlas-section{margin-top:42px}}
@media print{.atlas-index,.atlas-toplink{display:none}.atlas-section{break-before:page;margin-top:0}.atlas-lane,.atlas-system-grid article,.atlas-proposal{break-inside:avoid}.atlas-control-svg{display:block}.atlas-source-list{columns:1}.atlas-matrix-wrap,.atlas-va{overflow:visible}.architecture-atlas a{color:#142d42}.atlas-downloads .button{background:white;color:#142d42}}
</style>'''


def build_atlas(page, P):
    """Build /architecture-of-power/atlas/ and copy its two archived PDFs."""
    P = Path(P)
    source_dir = Path(__file__).parent / "assets" / "files" / "architecture-of-power"
    output_dir = P / "community" / "files" / "architecture-of-power"
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, _ in FILES:
        source = source_dir / name
        if not source.is_file():
            raise FileNotFoundError(f"Missing atlas download: {source}")
        shutil.copy2(source, output_dir / name)

    downloads = ''.join(f'<a class="button secondary" href="/community/files/architecture-of-power/{name}">{escape(title)} (PDF)</a>' for name, title in FILES)
    review_lanes = lane("Courts · Judicial", (("Trial judge", "Makes orders in a case."), ("Authorized judicial route", "Motion, appeal or writ, as the governing procedure allows."), ("Reviewing court", "Reviews within its jurisdiction.")), "These may be alternative routes, not mandatory sequential steps.")
    review_lanes += lane("Florida DMV · State executive", (("Licensing or suspension notice", "Identify the reason and source of the record."), ("Applicable agency process", "BAR hearings where applicable."), ("Qualifying final licensing order", "Circuit-court certiorari under §322.31.")), "Source clearance and hardship relief are separate from proving a decision was wrong.")
    review_lanes += lane("SSA · Federal executive", (("Initial benefits determination", "Begin with the decision and its notice."), ("Reconsideration", "Agency review."), ("Administrative law judge", "SSA adjudication."), ("Appeals Council", "Further agency review."), ("Federal district court", "Judicial review after a qualifying final agency decision.")), "This benefits ladder is not the universal route for SSA identity or record corrections.")

    systems = (
        ("Laws and authority", "Conditions and safety duties", "Legislatures, rulemakers and competent courts", "Legal text, delegation and amendment history"),
        ("Incentives and resources", "What is rewarded, funded or penalized", "Budget, procurement and organizational leaders", "Contracts, budgets and performance rules"),
        ("Data and software", "Classification, provenance and defaults", "Record owners, policy owners and software teams", "Schemas, source records, rules and version logs"),
        ("Workflows and staffing", "Roles, capacity and handoffs", "Operations leaders and responsible role owners", "Process maps, queues, staffing and handoff logs"),
        ("Review and correction", "Who can challenge, pause, reverse or correct", "Authorized agencies and reviewing courts", "Notices, deadlines, decisions and correction receipts"),
        ("Outcomes and feedback", "Harms, near misses and control effectiveness", "Program and audit roles; proposed assurance if established", "Validated outcomes, control tests and independent findings"),
    )
    system_cards = ''.join(f'<article><h3>{escape(title)}</h3><p><strong>Inspect:</strong> {escape(inspect)}.</p><p><strong>Who can change it:</strong> {escape(owner)}.</p><p><strong>Evidence:</strong> {escape(evidence)}.</p></article>' for title, inspect, owner, evidence in systems)

    body = STYLE + '''<div class="architecture-atlas" id="atlas-top"><p class="eyebrow">Architecture of Power · Institutional atlas</p><h1>Who decides, reviews<br>and repairs?</h1><p class="lede">A reference map of courts, administrative agencies, oversight bodies and the feedback needed to verify that a correction reached the person affected.</p><p><a href="/architecture-of-power/">← Return to Architecture of Power</a> · <a href="/architecture-of-power/patterns/">Explore the visual pattern library</a></p><p class="atlas-archive-note">Archive of the institutional, safety-behavior, evidence-coverage and VA benchmark maps prepared October 16, 2026. These are simplified public-source explanations, not an exhaustive jurisdiction directory or a current performance rating.</p><nav class="atlas-index" aria-label="Atlas sections"><a href="#roles">Institutional roles</a><a href="#review">Review routes</a><a href="#correction">Correction loop</a><a href="#behavior">Safety and behavior</a><a href="#coverage">Evidence coverage</a><a href="#benchmark">Outcome example</a><a href="#proposal">Proposed assurance</a><a href="#downloads">PDFs and sources</a></nav>
<section class="atlas-section" id="roles"><h2>Different referees have different jobs.</h2><p>Start with the function: deciding, reviewing, administering, investigating or redesigning. Sharing the word “oversight” does not give two bodies the same powers.</p>''' + relationships_table() + '''<div class="atlas-definition"><p><strong>FCC ≠ FAA.</strong> Communications and relevant 911-provider rules belong to the FCC’s sphere. Civil aviation safety belongs to the FAA’s sphere. Neither is a universal appeals office above other public institutions.</p></div></section>
<section class="atlas-section" id="review"><h2>Separate systems. Separate review routes.</h2><p>Judicial review, operational administration and misconduct investigation must stay distinguishable. An oversight complaint does not itself reverse or stay an individual decision.</p><div class="atlas-lanes">''' + review_lanes + '</div>' + refs("court-options", "bar", "fl-review", "ssa-appeal") + '''<div class="atlas-pair" style="margin-top:24px"><article class="panel"><h3>Courts: classify the problem</h3><ul><li><strong>Order or judgment:</strong> the authorized motion, appeal or writ.</li><li><strong>Filing, access or records:</strong> clerk, court leadership or administrative services.</li><li><strong>Judicial conduct:</strong> the relevant conduct body.</li></ul><p>California Family Court Services provides mediation and related services; it is not appellate review.</p>''' + refs("court-admin", "ca-cjp", "ok-cojc", "ca-fcs") + '''</article><article class="panel"><h3>SSA: identify the type of record</h3><p>Personal identifying information uses an application and evidence process. Other records may use Privacy Act correction and review of a refusal. Earnings records have a separate procedure. Benefits findings retain their appeal route.</p><p>A name change generally retains the same Social Security number. A correction is not a universal automatic synchronization across all institutions.</p>''' + refs("ssa-id", "ssa-correct", "ssa-refusal") + '''</article></div></section>
<section class="atlas-section" id="correction"><h2>A corrected source is part of a completed repair.</h2><p>This is a proposed verification practice. It does not claim that every agency shares every record, or that one universal correction law governs every step.</p><ol class="atlas-steps"><li><strong>Find the error.</strong><span>Identify the record, source and consequence; preserve the evidence.</span></li><li><strong>Identify the authorized decision maker.</strong><span>Determine who can correct the source or grant relief under the applicable procedure.</span></li><li><strong>Document the source correction.</strong><span>Retain the decision, reasons, authority, revised entry and effective date.</span></li><li><strong>Notify affected recipients.</strong><span>Each downstream system has its own record owner and applicable duties.</span></li><li><strong>Verify the actual effect.</strong><span>Check receipt, record state and whether the practical consequence changed.</span></li><li><strong>Return unresolved mismatches to the responsible owner.</strong><span>Keep the response history and verify again.</span></li></ol><div class="atlas-definition"><p><strong>Existing example:</strong> 20 CFR §401.65(d) requires SSA to correct erroneous information and notify known recipients of wrong information. Ordinary name/address changes are different. This specific rule does not prove receipt or downstream repair in any particular case.</p></div>''' + refs("ssa-correct") + '''</section>
<section class="atlas-section" id="behavior"><h2>Systems that shape safety.</h2><p>These six groups organize questions about a consequential decision. They are conceptual clusters, not measured causal effects or an empirical ranking.</p><div class="atlas-system-grid">''' + system_cards + '''</div><h3 style="margin-top:32px">Where the control loop closes</h3><p>Feedback is useful when it reaches someone with the authority and capacity to change the process. Every link below needs evidence.</p>''' + control_svg() + '''<div class="atlas-control-readable"><ol><li><strong>Authority owner:</strong> defines rules and resources.</li><li><strong>Decision process:</strong> human and software translate inputs into action.</li><li><strong>Person / outcome:</strong> observe the actual effect.</li><li><strong>Evidence:</strong> preserve provenance and check what is missing or contradicted.</li><li><strong>Independent review:</strong> compare evidence and action with the applicable standard.</li><li><strong>Correction owner:</strong> make the authorized repair and feed verified results back into the process.</li></ol></div><p>Proposed assurance can support tracing, testing and verification. It does not create legal authority. A diagram of feedback is a model to test, not proof that a real institution completes the loop.</p>''' + refs("stpa", "nist", "evidence", "process") + '''</section>
<section class="atlas-section" id="coverage"><h2>Evidence coverage, not a safety rating.</h2><p><strong>D</strong> means a route or rule was documented in this atlas. <strong>?</strong> means that dimension was not assessed here. Neither symbol establishes whether a particular case was handled safely.</p>''' + coverage_table() + '''<div class="atlas-definition"><p><strong>A written route is not a measured outcome.</strong> This matrix contains no case-level timing study, no verified cross-agency repair study and no whole-agency safety score. Unknown is not zero, failure, corruption or proof that oversight is absent.</p></div><details><summary>Read the scope behind each documented entry</summary><ul><li><strong>Florida DMV:</strong> BAR processes and qualifying circuit-court review; a published BAR operational audit.</li><li><strong>Courts:</strong> judicial routes and separate conduct bodies in the California/Oklahoma examples.</li><li><strong>SSA:</strong> benefits review, separate OIG oversight and the scoped known-recipient correction rule.</li><li><strong>Montana:</strong> an unemployment-insurance appeal example and judicial review of qualifying agency decisions. Other cells were not assessed.</li><li><strong>911:</strong> local service-complaint routing and the federal/provider versus local/operator division of responsibilities.</li></ul>''' + refs("bar", "fl-review", "bar-audit", "court-options", "ca-cjp", "ok-cojc", "ssa-appeal", "ssa-oig", "ssa-correct", "mt-ui", "mt-review", "911-help", "911-roles") + '''</details></section>
<section class="atlas-section" id="benchmark"><h2>What measured outcomes can add.</h2><p>The VA inpatient mental-health example shows a reported outcome measure alongside a specific intervention. It does not rate an entire agency or establish that the intervention alone caused the change.</p>''' + va_chart() + refs("va") + '''</section>
<section class="atlas-section" id="proposal"><h2>Proposed Public Systems Assurance Office.</h2><div class="atlas-proposal"><p class="eyebrow">Design proposal · Not existing universal jurisdiction</p><p>An assurance function could connect evidence audits, identification of the competent authority, correction tracking and verification of downstream effects.</p><ul><li><strong>People and frontline staff:</strong> report contradictions, harms and failed corrections.</li><li><strong>Independent review:</strong> test evidence, authority, process and data within an agreed scope.</li><li><strong>Existing courts and agencies:</strong> retain the legal decision roles assigned to them.</li><li><strong>Implementation owners:</strong> carry out authorized changes.</li><li><strong>Assurance follow-through:</strong> track receipt, verify outcomes and report unresolved patterns.</li></ul><p>Compulsory access, deadlines, stays and binding remedies would require a lawful grant of power. Public accountability should preserve privacy and protect sensitive case material.</p></div></section>
<section class="atlas-section" id="downloads"><h2>Download the complete atlases.</h2><p>The original PDFs include further state examples, sector-specific safety bodies, explanatory maps and source directories. The web appendix above preserves the four core visuals in a form that works without JavaScript.</p><div class="atlas-downloads">''' + downloads + '''</div><p class="atlas-archive-note">Historical reference edition: October 16, 2026. Procedures and public websites may change; the applicable notice and governing law control.</p><details><summary>Source directory for this web appendix</summary><ol class="atlas-source-list">''' + ''.join(f'<li><a href="{escape(url, quote=True)}">{escape(title)}</a></li>' for title, url in SOURCES.values()) + '''</ol></details><p><a href="/community/contact/">Report a source or mapping correction</a></p><p class="atlas-toplink"><a href="#atlas-top">Back to the atlas contents ↑</a></p></section></div>'''
    page("architecture-of-power/atlas", "Institutional Atlas — Architecture of Power", "Courts, DMV, Social Security, FCC and FAA: distinct review and oversight roles, correction paths, evidence coverage and a measured-outcome example.", body, False)
    return {"route": "architecture-of-power/atlas/", "downloads": [f"community/files/architecture-of-power/{name}" for name, _ in FILES]}
