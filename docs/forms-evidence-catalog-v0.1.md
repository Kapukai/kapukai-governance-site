# Eagle Eyes: forms, evidence opportunities, time and cost

Version: 2026-11-21.v0.1.0. Owner: Kapukai Governance Lab. Development home: the existing Case Entry / Evidence Access Audit draft, PR #33.

## Product question

At a consequential decision, what could each participant provide, what reached the decision maker, which checks occurred, and what did waiting, required payment, actual expense, or inability to proceed cost?

Money is an independent dimension of access. A person can face a funding shortfall before any recorded waiting interval starts. Keep required upfront payment, confirmed assistance, available funds, actual spending, estimated time value, and alternative routes separate. Do not turn all of them into a single risk or ROI score.

## Implemented first slice

- `/case-entry/forms/` extends the existing map. It uses the same state geometry and selected-state navigation.
- Six official form metadata entries: California DV-100, DV-109, DV-110, DV-120, DV-520-INFO, and EPO-001.
- Two distinct routes: a civil domestic-violence request with San Diego procedural detail, and a separate police-requested emergency protective order.
- Twelve official source records, per-form effective dates, source pinpoints, retrieval method, and checked date.
- Documented submission opportunities, responsible roles, published review clocks, money categories, and explicitly unestablished response/correction details.
- A local synthetic affordability illustration, deterministic rules module, and tests. No case information is submitted or stored by the illustration.
- A versioned JSON catalog and immutable edition manifest. The snapshot hash identifies the catalog bytes; it does not authenticate source PDFs or establish the truth of a process description.

This is selected pilot coverage, not a complete filing packet, 50-state survey, live court integration, or observed performance dataset. Source review is AI-assisted. Independent review is not recorded. Current public sources remain linked for readers to inspect. Source PDFs were not acquired; their hashes are null and field-level extraction has not been performed.

## Reusable data contract

`community/public/case-entry/forms/catalog.json` is the current edition. Preserve each released edition under `editions/`; do not silently replace an earlier edition after publication.

| Record | Purpose |
| --- | --- |
| Source | Official URL, issuing scope, pinpoint, effective/publication/check dates, retrieval method, archive and review status. |
| Form | Stable ID, form number, title, document role, jurisdiction, edition date, official landing page, source IDs, and archive status. |
| Route | Proceeding, initiating actor, court/county/state, first consequential decision, independent review status, source and form IDs. |
| Step and channel | Responsible actor, documented input opportunity, bounded description, source IDs, and explicit unknowns. A descriptive sequence is not a mandatory national order. |
| Review clock | Exact scope, trigger, effective interval, time zone, cutoff, calendar dependency, and exceptions. Published windows remain separate from actual durations. |
| Cost component | Published/variable/unknown amount, currency, obligation, payment timing, source, and limitations. |
| Operational metric | Explicit null until a suitable dataset supplies a definition, population, period, denominator, missing-data treatment, method, and review. |

The state selector indexes research coverage. An unreviewed state is unknown. A sourced field is not an independent verification badge. The receipt model, source documentation, and actual operational observations retain separate statuses.

## Deterministic checks

`rules.mjs` provides four pure functions:

1. `checkAffordability`: compares a specified required payment with known available funds and confirmed support, using integer minor currency units. Pending assistance is not confirmed money. A numerical shortfall is not a finding of unlawful exclusion, causation, or lack of alternative channels.
2. `observedDuration`: calculates elapsed minutes only between valid, ordered timestamps with explicit UTC offsets. It does not compute legal deadlines or infer performance from missing events.
3. `summarizeObservedCosts`: separates observed and estimated amounts by currency, preserving unknown/invalid counts and incomplete totals. It never performs an implicit currency conversion.
4. `inspectCatalog`: checks structural traceability, identifiers, scope, dates, and unknown-data boundaries. Structural passes do not certify legal meaning, accuracy, independent review, or live court conduct.

For each result retain rule ID/version, approved input, result, reason, and source linkage. Missing values are not zeros. No signature, checksum, receipt, or submitted attachment alone establishes factual truth, admissibility, or recorded judicial consideration. Statements and declarations must not be classified as “no evidence” merely because no separate exhibit is attached.

## Money and time measurement

Define one participant opportunity within one proceeding and an observation window before calculating a rate. Keep attempts, successful receipts, accepted filings, decision-maker availability, review, notice, response, correction, and downstream acknowledgment distinct. Preserve clock source and precision.

Record the outcome at the observation cutoff: completed, delayed, blocked, abandoned, or unknown. Do not drop people unable to complete a step from the population definition. A reported financial barrier needs its attribution, evidence basis, alternatives, and uncertainty recorded separately. Missing evidence of an attempt is not proof that no attempt occurred.

For financial measures, retain the currency and whether the number is published, actually observed, or estimated. Required cash before a step and later reimbursement are different fields. A zero court charge does not imply zero total participant burden. Report elapsed time and participant hours separately before assigning a dollar value to time.

`observation-template.json` documents a future aggregate record. It contains null observations and does not collect data. A later operational service needs its own authorized access, privacy, retention, and aggregation design; do not place case-level events, private files, names, or individual financial records in this public repository.

## Current source-specific boundaries

- The DV-120 metadata lists January 1, 2026. Other selected forms retain their own dates; no single blanket packet revision is assumed.
- The San Diego notice, published October 15, 2026 and effective November 16, describes an inclusive 3 p.m. processing cutoff. Court-calendar data, completeness, applicable exceptions, and actual event times are not supplied; the legal clock remains uncomputed.
- The San Diego FAQ separates no court e-filing fee from possible provider charges and documents optional e-filing. Provider amounts and participant affordability are unknown.
- The police EPO route has its own initiating actor. Civil request fees, attachment instructions, and cutoff are not copied into it.
- Complete service, post-decision response, modification, appeal, and correction routes remain gaps. Empty source references are acceptable only when the entry explicitly marks an unestablished research question or measurement category.

## Development and reproducibility

From the repository root:

```sh
node --test community/public/case-entry/tests/*.test.mjs
node community/public/case-entry/forms/validate-catalog.mjs
node --check community/public/case-entry/app.js
node --check community/public/case-entry/forms/app.js
python3 -m http.server 8000 --directory community/public
```

Open `/case-entry/` and `/case-entry/forms/?state=CA`. Check an unreviewed state, both California routes, current source links, the independent-review label, and the funding-shortfall illustration at zero elapsed minutes. Test desktop/mobile layout, keyboard selection, and a failed catalog request. Synthetic software checks do not establish live court behavior.

## ChatGPT Work continuity

Use the existing project for research, implementation, source review, and follow-up. GitHub remains the canonical code and catalog history. Future Work/Codex tasks should read `AGENTS.md`, this document, and the current branch diff before editing. Start from PR #33 rather than generating another website, domain, database, or duplicated nationwide atlas.

Priority for subsequent work: identify exact forms and complete channel/review routes; archive verified source bytes and editions; obtain independent source and technical review; acquire suitable aggregate observations; evaluate a specific improvement against a stated baseline. Train a custom model only after a defined task and evaluation show its value.

## Release boundary

This module is developed on the existing draft branch. A preview is a review environment. Follow repository instructions: verify the exact release on Vercel before any branded-host publication. The existing `community/deploy.py` prefix list does not own `case-entry/`; a branded install needs an explicitly scoped release path and backup. Do not treat a Vercel preview as publication at kapukai.org, change the apex, or alter mail DNS. Record actual verification and blockers in the release note.
