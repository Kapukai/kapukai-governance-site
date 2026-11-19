# Case Entry Map MVP milestones

Status snapshot: November 18, 2026

## MVP definition

A source-scoped national coverage map with two separate Oklahoma pilots: (1) OUCMS district-court civil e-filing and its receipt/access documentation, and (2) a statutory child emergency-custody case-entry integrity map that traces rules, review clocks, and the conditional Title IV-E funding connection. The public map offers two visitor paths (explore a process or suggest a public source), distinguishes submission from clerk disposition, documents unknowns, and accepts no personal-case uploads.

## Milestones

### M0 — Scope and claim hygiene — complete
- [x] Reuse the existing Decision Failures Atlas map geometry and site repository.
- [x] Keep OUCMS civil e-filing separate from child-welfare intake and criminal case initiation.
- [x] Label unreviewed jurisdictions as unknown, not safe or defective.
- [x] Give the Oklahoma entry a stable claim ID, review date, next review date, observations, tests, unknowns, and source pinpoints.
- [x] Keep statements about file attachments separate from claims about authenticity, cybersecurity, or truth.

### M1b — Case-creation integrity layer — statutory path documented; operations untested
- [x] Map Oklahoma Title 10A emergency-custody routes, source requirements, handoffs, and statutory clocks from the official statute publication.
- [x] Separate legal rule text from portal behavior, operational compliance, and system-control evidence.
- [x] Trace Title IV-E eligibility and reimbursement criteria without implying that case creation itself triggers payment.
- [x] Label the false-injection concern as a testable threat model; no production vulnerability is claimed.
- [ ] Identify and version the exact child-welfare intake and emergency-order forms.
- [ ] Reproduce any system behavior only in a permitted non-production environment with synthetic inputs and written scope.
- [ ] Obtain public or aggregate evidence for real operational and claim-level funding behavior.
- [ ] Publish independent source/scope and technical/process review records.

### M1 — Oklahoma primary-source record — source comparison documented; authority question unresolved
- [x] Add the official e-filing rules, the October 14, 2025 Version 2 guide, the current registration screen, and the dated January 28, 2025 FAQ.
- [x] Record that the FAQ itself says the e-filing rules supersede its information.
- [x] Show the mismatch between indexed rules, the current pro se registration notice, and the new-case guide without deciding which governs.
- [x] Keep current county-by-case-type availability, later amendments/orders, and the self-represented filer route as open questions.
- [ ] Confirm current authoritative interpretation and actual county/case-type eligibility.
- [ ] Identify the exact child-welfare intake form before making claims about that process.
- [ ] Reproduce authorized public steps using synthetic data; no live filing or probing.

### M2 — Public prototype — prior preview verified; this update requires fresh verification
- [x] Add /case-entry/ as a static route in the existing community/public site.
- [x] Reuse the state map and link it from the existing authority map.
- [x] Add source cards, coverage statuses, receipt-state model, scope notes, and privacy boundary.
- [x] Add a manual, source-only correction path and sanitized public correction log.
- [x] Add public review-quality measures and the baseline date.
- [ ] Verify the updated Vercel preview, all linked routes, and the updated map data.
- [ ] Review desktop/mobile layout, keyboard operation, focus visibility, and screen-reader labels on the updated preview.

### M3 — Independent review — roles defined; recruitment open
- [x] Define source/scope and technical/process reviewer roles.
- [x] Require separate methods, conflict disclosures, dated outcomes, and visible disagreement.
- [x] Publish the role-specific call to apply; map applicants are not treated as assigned or credentialed reviewers.
- [ ] Recruit and assign one reviewer for each role.
- [ ] Publish review records only with reviewer consent and without personal case information.
- [ ] Keep the finding marked unreviewed until the required reviews are complete.

### M4 — Verification and release — preview only; branded release blocked
- [x] Run synthetic receipt-model and source-contract tests; keep them distinct from OUCMS tests.
- [ ] Pass refreshed HTML/CSS/JavaScript, accessibility, responsive, and link checks against the new preview.
- [ ] Recheck the source record before publication if official material changes.
- [ ] Install the tested release at the intended path on kapukai.org only after authenticated access to the existing nginx host and a backup are available.
- [ ] Verify the branded URL, page content, links, and assets after installation.
- [x] Set the next source-review date to February 18, 2027 and define a quarterly cadence.

### M5 — Scale — after the Oklahoma pilot
- [ ] Add one jurisdiction at a time using the same claim/source/review schema.
- [ ] Separate legal authority, portal behavior, clerk operations, receipt/status, and judicial decision into distinct layers.
- [ ] Add funding claims only when tied to appropriations, awards, contracts, reimbursements, and outcome data.
- [ ] Consider a structured contribution backend only after source-only manual review and privacy controls are proven.

## Excluded from this MVP

Individual case uploads, personal evidence, automated legal judgment, a public jury/tribunal, smart contracts, production-portal testing without authorization, claims that a portal limitation alone proves a constitutional violation, and any conclusion that an upload feature verifies submitted content.
