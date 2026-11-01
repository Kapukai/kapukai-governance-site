# Decision Failures Atlas

A curated public-source research database in Supabase schema `kapukai_case_atlas`, with versioned public JSON/CSV/SQLite editions and a map reusing Kapukai Human Liberty Atlas geometry.

## Evidence contract

Each case identifies its historical decision, underlying jurisdiction, court, docket, named people's documented roles, a short event sequence, source pinpoints, finding, remedy and limitations. Names identify roles; reviewing judges and official-capacity defendants are not automatically accused wrongdoers. No private addresses, children’s identities or private customer records are collected.

Engineering assurance is a testable reform proposal. Missing public signoff and causal responsibility remain unestablished unless evidence directly supports those propositions. Record designers, existing engineers, public-review obligations, attestations, counterevidence and rival causal explanations before making that claim.

## Coverage protocol

Edition 1 is a purposive seed set. It is not all online cases, a national estimate or a current-danger ranking. Empty map states mean not yet indexed. Include protective decisions, constrained remedies, adverse rulings, reversals and corrected systems. Search official appellate and trial opinions, DOJ findings, inspectors general, auditors and official settlements. Track date, query, jurisdiction, inclusion/exclusion reason and missing source in future research editions. Do not count multiple opinions in the same controversy as independent failures without labeling related records.

## Update protocol

1. Retrieve the primary source, identify procedural posture and exact holding.
2. Check later appeals, stays, modification, settlement and compliance; record gaps.
3. Extract public role names with source pinpoints; distinguish adjudicator from challenged actor.
4. Assign a control-failure category separately from the court's own holding.
5. Add reviewed records to `seed.json`, run `python build.py`, review diffs and source coverage.
6. Use a new edition ID for later snapshots. Run schema/seed SQL via authorized database tools. Verify counts and denied public writes. Exported snapshot must match the edition checksum in Postgres.
7. Publish and browser-test filter, empty-state, case links, sources and D.C. route guidance. Do not publish private intake or infer absent engineers from a silent opinion.

Public page is a frozen reviewed edition, not live docket monitoring. No recurring crawl is configured. Source originals remain with their official publishers; URLs and pinpoints are stored here, not claimed preservation copies.

## Access

Schema is not exposed to clients. All four tables have RLS enabled; PUBLIC/anon/authenticated have no schema/table access. No policies is intentional deny-by-default, not an unresolved exposure. The public page uses exported public records and has no database credentials. Existing platform case desks and private workspaces are untouched.

## Map provenance

Reuses `states.js` from https://kapukai-human-liberty-atlas.christinehillier.chatgpt.site/states.js . Source geometry: U.S. Census 2025 cartographic boundaries, 1:20m, Albers USA composite; AK/HI inset. State labels are not courthouse/incident coordinates. No risk rate is inferred from case counts.

## Safety path

The D.C. guide is a research-screening framework for qualified counsel. A national pattern does not create standing, venue, a cause of action, an adequate class or universal injunctive authority. No filing, representation, legal service or emergency response has been initiated.
