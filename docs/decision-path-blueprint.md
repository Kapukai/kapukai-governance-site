# Decision paths: build blueprint

Design date: November 1, 2026. Target: atlas edition 4.0, three mapped cases within the existing 20-case collection. Deployment and completed checks are recorded in the [release manifests](releases/); this blueprint does not certify a live release.

## The reader’s task

A reader should be able to identify **who acted, what information was used, who was affected, and what correction was ordered or agreed**. Each case uses four numbered panels: Information, Decision, Impact and Correction. This is a sourced reading sequence; its arrows or order do not independently establish causation.

Keep the case’s procedural posture, specific limitations, source links and unverified implementation status visible. Put the longer access, technology and testing details in expandable sections. Retain Map and Compare for finding records. Unmapped cases retain their existing summaries and an explicit “not yet mapped” label.

The pilot covers Barry’s benefits database match, Turner’s ability-to-pay determination, and Williams’s challenged facial-recognition arrest. They test distinct evidence types and control failures; they are not a representative sample or a quantified risk ranking.

## Evidence and role contract

- Every actor and factual step needs a source URL and pinpoint. A valid URL is not evidence that the source supports the claim; source review is a separate task.
- Classify the actor’s role in this record: institutional operator, decision authority, affected person, reviewer or representative. A reviewing judge is not automatically the operator of the challenged decision. Membership, delegated authority and actual exercise of control are separate facts.
- Label allegations, court findings, court orders, settlement terms and source descriptions distinctly. An agreed or ordered correction does not prove implementation.
- Record access to see, challenge or correct a decision with a scoped description. Distinguish a permission on paper from practical access and its actual use; do not infer one from another.
- Record technology use per actor. Institutional and affected-person AI use can differ. Automation does not automatically mean AI. Missing evidence remains “not established.”
- Protect the person. Expose the decision. Use lawful public role information and source passages; exclude private addresses, protected identities and private intake. A role reference does not imply misconduct.

## Architecture

`decision-paths.json` adds reviewed paths to the existing `seed.json` cases. The contract validator rejects broken actor references, unsupported status values and missing citations. `build.py` produces the JSON, CSV, SQLite and SQL editions. Paths reside inside each case’s existing JSON record; the restricted Supabase schema and immutable edition snapshots remain in place.

The public site reads the frozen JSON export with the existing vanilla JavaScript interface. It receives no database credentials. No new framework, service subscription, schema migration or live case-monitoring claim is required.

## Milestones and completion gates

| Milestone | Gate | Status at blueprint creation |
|---|---|---|
| 1. Three source-backed paths | Four scoped stages per case; all actors resolve; evidence labels and pinpoints reviewed; unknowns explicit | Being implemented |
| 2. Readable visual pilot | Map/Compare leads to the correct path; every stage exposes its source; narrow screens and keyboard use remain practical | Being implemented |
| 3. Reproducible release | Contract and mutation tests pass; exports agree; original case fields remain unchanged; database snapshot checksum matches; preview and production checks recorded | Pending verification |
| 4. Independent review and reader trial | Human reviewer checks each factual link; trial measures comprehension and correct interpretation of unknowns | Not performed |
| 5. Expand coverage | Resolve pilot findings; apply the same source and test gates to each additional case | Deferred |

The pilot may be published with its actual AI-assisted review status. Independent human review remains an explicit quality milestone. Do not label it complete until a reviewer’s scope and results are recorded.

For the reader trial, propose five readers unfamiliar with a case. After 60 seconds, ask them to identify the actor, information, affected person, correction and one unresolved fact. A proposed initial target is four of five readers correctly answering all five prompts. This target has not been tested; record answers, time and misunderstandings before revising it or claiming usability improvement.

## Test and reproduce

From the repository root, with Python 3 and Node installed:

```bash
python3 community/case_atlas/build.py
python3 -m unittest discover -s community/case_atlas -p 'test_decision_paths.py' -v
node --check community/public/evidence/decision-failures/atlas.js
python3 -m http.server 8000 --directory community/public
```

Open `http://localhost:8000/evidence/decision-failures/`. Check all three mapped cases, an unmapped case, direct links, shared filters, an empty result, source links, keyboard focus and disclosures. Also inspect at phone width; desktop success alone does not establish mobile usability. The build regenerates local exports but does not publish or change Supabase.

Mutation tests should reject dangling actors, missing source pinpoints and invalid evidence states. Export checks should confirm deterministic data, SQLite integrity and preserved historical fields. Publish the exact verified commit to Vercel and record its deployment and checks. Install that tested release on the separate kapukai.org host only when authenticated access is available; preserve existing pages and DNS.

These tests validate the atlas’s data structure and software. They do not test the government decision systems, estimate their error rates, verify present compliance, or establish FMC, PMC or NMC. Historical source review dates are not fresh docket certification.
