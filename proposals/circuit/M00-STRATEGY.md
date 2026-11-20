# M00 — People in the Circuit /circuit (proposed)
Status: **review candidate; not published or approved for production**. 2026-11-20.

## Purpose
Add one compassionate, source-linked strategy overview to the existing Kapukai public site. Preserve /atlas, /standards, /bills and Eagle Eyes as separate bounded capabilities. No new database, user accounts, private case evidence, or autonomous institutional actions.

## Product contract
- Human question: What do you need to communicate, and who can lawfully respond?
- Branch lanes: legislative, executive, judicial. Different mandates; do not merge authority.
- ACA cell: authority, evidence, funding, decision, impact, remedy. An intake receipt is not an adopted finding.
- PDIP (proposed): send -> acknowledge -> review -> authorized response -> execution receipt -> correction/observation.
- Data boundary: public standards and synthetic examples only; no protected child or case data.
- Five lifecycle choices: urgent action, obtain records, challenge, reform, implement.
- Public page: educational, not official or legal advice. Preserve contrary evidence and uncertainty.

## Integration decision
Preferred slug: `/circuit`. **Do not create a parallel production deployment**. Confirm the actual domain-owning Vercel project and the site's route conventions before merging. Vercel project-domain lookup returned 403 for kapukai.org in this account context. Keep production untouched.

## Gates
G0 asset/repository inventory and routing owner; G1 content and legal terminology review; G2 accessibility and responsive browser QA; G3 no unauthorized external network calls or private data; G4 link and SEO QA; G5 independent production deploy/rollback plan and verified domain; G6 owner approval to publish.

## Test families
T01–T08: semantics, language, branch boundaries, authority/receipt distinctions, no false government endorsement.
T09–T16: five route selections, keyboard access, screen-reader announcement, focus, contrast.
T17–T24: narrow/wide layout, zoom, reduced motion, touch, link behavior, no JS fallback, printing.
T25–T32: privacy isolation, XSS text handling, no external POST, no credentials, no PII in telemetry, CSP, dependency and supply chain.
T33–T40: source provenance, correction loop, contradictory evidence, unknown authority, stale law, late deadline, external outage, rollback.
Automated static and browser checks are necessary but not sufficient; manual and expert gates remain.

## Long-term milestones
M00 strategy overview -> M01 versioned public decision recipe -> M02 synthetic intake/receipt API -> M03 independent security/authority review -> M04 model legislation -> M05 bounded voluntary pilots -> M06 federation and independent conformance. Each stage requires documented approval, measured results and rollback.

## Do not
Do not modify production DNS, auth, payment, private evidence, or Supabase policies as part of the public overview. Do not imply nationwide deployment, official endorsement, legal authority, or proven outcomes.
