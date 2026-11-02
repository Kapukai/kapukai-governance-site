# Decision Failures Atlas

A curated public-source research database in Supabase schema `kapukai_case_atlas`, with versioned public JSON/CSV/SQLite editions and a map reusing Kapukai Human Liberty Atlas geometry.

## Evidence contract

Each case identifies its historical decision, underlying jurisdiction, court, docket, named people's documented roles, a short event sequence, source pinpoints, finding, remedy and limitations. Names identify roles; reviewing judges and official-capacity defendants are not automatically accused wrongdoers. No private addresses, children’s identities or private customer records are collected.

Publicly inspectable testing, evidence and accountable review are reform proposals. Missing public signoff and causal responsibility remain unestablished unless evidence directly supports those propositions. Record designers, existing engineers, public-review obligations, attestations, counterevidence and rival causal explanations before making that claim.

## Coverage protocol

Edition 1 is a purposive seed set. It is not all online cases, a national estimate or a current-danger ranking. Empty map states mean not yet indexed. Include protective decisions, constrained remedies, adverse rulings, reversals and corrected systems. Search official appellate and trial opinions, DOJ findings, inspectors general, auditors and official settlements. Track date, query, jurisdiction, inclusion/exclusion reason and missing source in future research editions. Do not count multiple opinions in the same controversy as independent failures without labeling related records.

## Update protocol

1. Retrieve the primary source, identify procedural posture and exact holding.
2. Check later appeals, stays, modification, settlement and compliance; record gaps.
3. Extract public role names with source pinpoints; distinguish adjudicator from challenged actor.
4. Assign a control-failure category separately from the court's own holding.
5. Add reviewed records to `seed.json`, set a new edition ID in `edition.json`, run `python build.py`, review diffs and source coverage. Preserve earlier edition rows; existing case review dates do not certify a new docket review.
6. Use a new edition ID for later snapshots. Run schema/seed SQL via authorized database tools. Verify counts and denied public writes. Exported snapshot must match the edition checksum in Postgres.
7. Publish and browser-test filter, empty-state, case links, sources and D.C. route guidance. Do not publish private intake or infer absent engineers from a silent opinion.

Public page is a frozen reviewed edition, not live docket monitoring. No recurring crawl is configured. Source originals remain with their official publishers; URLs and pinpoints are stored here, not claimed preservation copies.

## Current authoring and publication flow

The current editorial input is the reviewed, manually authored `seed.json`, together with `edition.json`, `verification-contract.json` and `mission-proposals.json`. `build.py` generates public JSON/CSV/SQLite exports and `seed.sql`. The reviewed SQL is applied through authorized database tools to the restricted Supabase case, source and role tables and an immutable edition snapshot. The website serves the static public snapshot; it is not a dynamic database client and does not perform automated docket monitoring.

Supabase therefore stores the structured records and edition history; it is not the sole authoring source in the current workflow. A future controlled editorial database workflow would require authenticated editing, version history, validation and a reviewed publication step before replacing the present authoring path. That workflow is not implemented by this edition.

## Edition 3 verification and mission capability

This edition adds transparency fields without adding external case findings. The original 20 cases, 30 case-source links and 52 documented roles are preserved.

Each case has a `verification` object using the flat status keys in `verification-contract.json`. Source compilation is explicitly AI-assisted document review; independent human technical review is not recorded. Operational testing of the government decision process has not been performed by Kapukai. Test-run, metric and independent-replication arrays are empty. Third-party test evidence has not been systematically extracted. Current compliance is not independently verified, and insurance coverage is not reviewed. These statements concern Kapukai's work, not a claim that no other party has conducted testing. Browser and software checks of the atlas are separate.

Empty arrays and absent estimates are not zeros, passes, failures or confidence scores. A future measurement record must state its claim, method, population, system version, conditions, sample design, denominator, missing-data treatment, uncertainty assumptions and limitations. A confidence interval is not an overall probability that a case claim or government decision is correct.

Defaults fill missing verification and capability fields; explicitly authored fields in `seed.json` are preserved. The checks requiring empty operational arrays and UNASSESSED ratings apply specifically to edition 3.0. Before a later edition introduces assessed ratings, the evidence contract and validation checks must be reviewed and extended to enforce the assessment requirements. Changing a status string alone is not an assessment.

`mission-proposals.json` defines a proposed mission and observable check for each bounded decision process. `mission_capability` carries that proposal, `criteria_status: proposed_not_validated`, `current_status: UNASSESSED`, null assessor/date and the reason assessment is blocked. Historical source findings remain separate. All 20 records are unassessed; no missing-data state is converted to NMC.

The FMC/PMC/NMC terminology is a proposed governance adaptation of [AFMAN 13-1CRCV3, 26 April 2024, sections 4.3.1.1–4.3.1.3](https://static.e-publishing.af.mil/production/1/af_a3/publication/afman13-1crcv3/afman13-1crcv3.pdf), whose original context is Control and Reporting Center operations. It is not an official military or government rating. A rating would require a current validated mission baseline, acceptance criteria, scoped operational evidence, a responsible assessor, date and currency limits. FMC denotes all defined objectives, PMC some but not all, and NMC total inability under the defined conditions; none is a statistical confidence percentage. Mission capability does not establish legal authority, rights compliance, safety certification or insurance coverage.

The SQL starts with an edition-checksum guard. Reusing an edition ID with different content aborts the transaction; previously published edition rows are never overwritten. Reapplying the identical snapshot is allowed.

## Edition 2 priorities

The six additions were selected for primary-source strength, clear human impact, a testable failure, concrete safeguards or correction duties, and coverage they add. Editorial priority is a reading order, not a quantified financial ROI, culpability or risk score. `research-edition-2.json` records the selection rationale, research queries and gaps.

The opening cards highlight Williams (independent evidence and documented approvals), Turner (ability-to-pay safeguards before civil-contempt imprisonment), and D.L. (measurable service delivery and reporting). Ralls supplies a federal procedural-review example; Jones tests response to failed notice; Nelson tests correction of dependent financial consequences. The Terris disclosure ruling is a follow-on note within D.L., not another count of the same underlying service failure.

Williams is a settlement with no admission, not a merits liability finding. Its examiner and police sign-offs are not professional-engineer certification. Proposed control tests and editorial assessments remain distinct from the sources' holdings. Public role names and lawful source links are used; private addresses and children's names are excluded from new records.

## Access

Schema is not exposed to clients. All four tables have RLS enabled; PUBLIC/anon/authenticated have no schema/table access. No policies is intentional deny-by-default, not an unresolved exposure. The public page uses exported public records and has no database credentials. Existing platform case desks and private workspaces are untouched.

## Map provenance

Reuses `states.js` from https://kapukai-human-liberty-atlas.christinehillier.chatgpt.site/states.js . Source geometry: U.S. Census 2025 cartographic boundaries, 1:20m, Albers USA composite; AK/HI inset. State labels are not courthouse/incident coordinates. No risk rate is inferred from case counts.

## Safety path

The D.C. guide is a research-screening framework for qualified counsel. A national pattern does not create standing, venue, a cause of action, an adequate class or universal injunctive authority. No filing, representation, legal service or emergency response has been initiated.


## Edition 4 decision paths

The same 20 indexed cases remain. `decision-paths.json` adds a separate, source-backed decision map for Barry, Turner and Williams. `build.py` validates the overlay through `decision_path_contract.py` before writing exports. Unmapped records have no manufactured path. The path is included in JSON, the CSV `decision_path` field, SQLite `record_json`, and the existing Supabase case `record` and immutable edition snapshot. No database schema change or client access is required.

Every path has four reading stages: information, decision, impact and correction. Each stage identifies acting and affected actors, its evidence posture and source pinpoints. This is a source interpretation, not a causal model. Roles describe that record; a reviewing judge is not automatically a challenged operator. Access records distinguish documented availability, a documented or alleged barrier, a future requirement of a remedy, and what is not established. Technology records distinguish documented or alleged use from unknown use. Automation does not imply AI. An AI claim can attach to an institutional actor or an affected person; neither receives a default AI-use classification.

An agreement or order does not establish implementation. All pilot correction implementation statuses remain `not_independently_verified`; all 20 capability ratings remain `UNASSESSED`, with no government-system test results or measured error rates added. Path review dates concern the named source extraction, not a current docket or personnel audit. Independent human source review and reader testing remain separate milestones.

Run `python3 -m unittest discover -s community/case_atlas -p 'test_decision_paths.py' -v` from the repository root. Tests reject dangling actors, missing pinpoints, unsupported statuses and accidental upgrades of unknown use to sourced use. They establish data-contract behavior, not factual truth. See [the decision-path blueprint](../../docs/decision-path-blueprint.md) for acceptance gates and reproduction commands.
