# Case Entry Map MVP milestones

Status snapshot: November 18, 2026

## MVP definition

One interactive national coverage map with one accurately scoped Oklahoma OUCMS entry; two obvious visitor paths (explore a route or suggest a public source); documented court receipt states; a visible review method; no private-case upload.

## Milestones

### M0 — Scope and claim hygiene — complete
- [x] Reuse the existing Decision Failures Atlas map geometry and site repository.
- [x] Keep civil OUCMS e-filing distinct from child-welfare intake and criminal case initiation.
- [x] Replace the unsupported “narrative-only” characterization with source-backed file-input, eligibility, and receipt claims.
- [x] Label unreviewed jurisdictions as unknown, not as safe or defective.

### M1 — Oklahoma primary-source record — source-documented; operational test pending
- [x] Add the October 14, 2025 OUCMS Version 2 guide.
- [x] Record PDF/JPEG document-input rules and the guide’s dated sealed/confidential-document limitation.
- [x] Record the current registration page’s pro se restriction.
- [x] Preserve the January 2025 FAQ as an older source that differs on new civil-case filing.
- [ ] Confirm current county-by-case-type availability and the alternative route for self-represented filers.
- [ ] Identify the exact child-welfare intake form before rating that process.
- [ ] Conduct an authorized walkthrough with synthetic data; do not use a live case.

### M2 — Public prototype — preview verified; release pending
- [x] Add /case-entry/ as a static route in the existing community/public site.
- [x] Reuse the state map and link it from the existing authority map.
- [x] Add source cards, coverage states, receipt-state diagram, scope note, and privacy boundary.
- [x] Link source suggestions to the existing contact page and reviewer interest to the existing reviewer application.
- [x] Verify the route, core links, source/status rendering, and state selection in the Vercel preview.
- [x] Verify the code preview at commit d30e5cf8666e6a18253d1287d33e0a3a1a7963a1 (deployment dpl_8BaWX2B8YwQDkY7pPxSe4QinSd5v): https://kapukai-community-h2ku6bw74-kapukais-projects.vercel.app/case-entry/

### M3 — Independent review — protocol defined; human review pending
- [x] Define source/scope and technical/process reviewer roles.
- [x] Require separate methods, conflict disclosures, dated outcomes, and visible disagreement.
- [ ] Recruit and assign one reviewer for each role.
- [ ] Publish signed review records with reviewer consent.
- [ ] Keep the record unreviewed until both roles complete their checks.

### M4 — Release and operations — preview gate passed; branded release blocked
- [x] Pass four synthetic receipt-state tests, JavaScript syntax checks, JSON validation, static HTML parsing, and browser checks; no case-file upload input is present.
- [x] Verify the exact Vercel preview commit/deployment above.
- [ ] Install the exact tested release at the intended short path on kapukai.org. Blocked on authenticated access to the existing nginx host and its backup; Vercel access does not provide either.
- [ ] Verify the branded URL, page content, key links, and assets after installation.
- [ ] Set event-triggered source refresh plus a quarterly review date.

### M5 — Scale — after the Oklahoma pilot
- [ ] Add one jurisdiction at a time using the same claim/source/review schema.
- [ ] Separate legal authority, portal behavior, clerk operations, receipt/status, and judicial decision into distinct layers.
- [ ] Add funding claims only when tied to appropriations, awards, contracts, reimbursements, and outcome data.
- [ ] Consider a structured contribution backend only after the public-source workflow and privacy controls are proven.

## Excluded from this MVP

Individual case uploads, personal evidence, automated legal judgment, a public jury/tribunal, smart contracts, production portal testing without authorization, and claims that a portal limitation alone proves a constitutional violation.
