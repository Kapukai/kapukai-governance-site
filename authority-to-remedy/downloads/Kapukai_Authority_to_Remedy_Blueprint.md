# Kapukai Authority to Remedy Trace
## Implementation blueprint, version 0.1
**Scope:** First educational module. One consequential decision or discrete omission per trace. Checked source registry: 9 October 2026. This is an engineering and teaching model, not a source of governmental authority or a court finding.

### Core unit
An Action Duty Remedy Card joins two traces:
1. Authority trace: constitutional allocation, enabling source, delegation or appointment, actor, jurisdiction, scope, required predicates, evidence, procedure, decision, consequence.
2. Remedy trace: alleged defect, source of a duty or review right, trigger and proof of receipt, competent forum, permitted request, required response or discretionary decision, implementation, verification at affected points of use.

The Declaration expresses the political foundation. Operative legal analysis uses the applicable U.S. and state constitutions, statutes, regulations, court rules, binding decisions and valid orders. State governments are not departments in a federal administrative chain. A federal agency review path does not become a route for appealing a state court order.

### Three views of the same record
| View | Question | Stored evidence |
|---|---|---|
| Authority ledger | What allows this actor to make this particular decision? | Authority source, jurisdiction, scope, predicates, evidence and required procedure |
| Procedural atlas | Who can consider this specific issue and grant the requested relief? | Forum, reviewability, standing, venue, deadline, exhaustion or finality as applicable, filing and service requirements |
| Remedy tracker | What changed for the affected person? | Ruling or response, implementation, corrected source and recipients, remaining consequences, verified outcome |

### Practice sequence
**Record. Classify. Invoke a documented duty. Seek authorized enforcement. Verify the remedy.**

Record means preserve lawfully obtained documents, notes, receipts and originals. Audio or video recording is a separate legal question. Classify action, omission, disputed fact, legal issue and requested relief separately. The user's shorthand 'obligate' is operationalized as identifying and properly invoking a duty that already exists in applicable law, a valid order or another enforceable instrument. A private notice does not manufacture jurisdiction, consent, penalties or a governmental duty.

### Typed objects
| Object | Required fields | Important distinction |
|---|---|---|
| Event | ID, time, time precision, observer/source, action or omission, affected person, consequence | Observed fact differs from interpretation |
| Source | ID, official URL, provision/pinpoint, edition/effective date, retrieval date, supporting text, reviewer, limitations | Retrieval does not establish complete current treatment or applicability |
| Authority | Actor, office, appointment/delegation, enabling provision, geographic and subject scope, limits | Office identity differs from power to take a particular action |
| Predicate | Rule element, burden/standard if applicable, claimed facts, supporting/contrary evidence, status | Unknown or missing in this packet does not prove unlawful action |
| Duty | Holder, source, mandatory/discretionary/conditional classification, preconditions, required act, expected output, timing source | Duty to decide differs from duty to grant a preferred result |
| Request | Recipient, permissible vehicle, requested relief, factual basis, attachments, filing/service, receipt | Sent differs from filed, served, accepted or granted |
| Route | Actor type, subject, stage, forum, jurisdiction, venue, reviewable act, available relief, gate questions | Geography alone cannot select a court |
| Deadline | Source, triggering event, proved date, counting rule, exception, tolling rule, checked by, derived due date | Separate remedies can have independent clocks |
| Disposition | Decision-maker, date, scope, findings, relief granted/denied, reasons, next review | A procedural disposition is not automatically a merits finding |
| Implementation | Ordered act, responsible owner, required date/source, performed act, evidence | A favorable ruling differs from actual delivery |
| Correction | Original item, corrected status, authority, affected recipients, dependent decisions, acknowledgments, gaps | Source correction differs from propagated correction |
| Outcome | Human objective, observable result, baseline, missingness, adverse effects, remaining issue | Closed case differs from verified remedy |

### Decision states
Draft, evidence incomplete, source checked, route unresolved, request prepared, filed or delivered, receipt verified, response pending, response received, review pending, relief ordered, implementation pending, verified, reopened.

These are administrative tracking states. They do not decide whether a legal burden is satisfied. Keep separate clocks for an internal request, a court motion, appeal, service and compliance. A request for correction does not automatically stay an operative order or extend another deadline.

### Legal classification
Each rule receives:
- Type: binding constitutional/statutory/rule/order authority, precedent with jurisdiction and treatment limits, guidance, proposal, or fictional exercise rule.
- Operative verb and object: shall, must, may, prohibited, entitled to request, or unresolved.
- Actor and beneficiary.
- Predicate and exception.
- Required process and output.
- Enforcement/review route, if established.
- Scope of relief and practical verification.

Do not infer 'mandatory' from one word without reading the complete provision, exceptions, applicable precedent and procedural context.

### Narrow worked example
Florida Statutes section 39.701(2)(d)3 is the first real-law example. The predicate is the court's opinion that the social service agency has not complied with its written case-plan obligations. The statute makes a contempt finding discretionary and directs the court to order the agency's compliance plans and require a showing why the child could not safely return home. An allegation of noncompliance alone is not the triggering judicial determination. The separate statutory safe-return conditions still matter. See legal_authority.md and legal_sources.json for the conditional document matrix and source.

The federal comparison uses a discrete, legally required agency act under 5 U.S.C. section 706(1) and Norton v. Southern Utah Wilderness Alliance. The record must identify the actual duty, proper trigger, omission, relevant timing and available review route. A general demand that government behave better is not the same claim.

### Atlas architecture
Route key: jurisdiction + subject matter + actor type + challenged act/omission + procedural stage + requested relief.
Node types: originating agency, internal review office, trial court, appellate court, oversight body, records custodian.
Edge types: original jurisdiction, statutory review, appeal, extraordinary writ, oversight referral, records request, remand and implementation.
Every edge stores prerequisites, authority, review limits and date last checked. An oversight complaint is not drawn as an appeal unless law makes it one.

Initial published coverage is limited to educational federal-agency and Florida dependency examples, plus a Hillsborough circuit-to-Second-DCA illustration. Tribal, military, immigration, other states and other subjects need separately verified modules. Do not present an unbuilt national atlas as complete.

### Living Blueprint crosswalk
| Existing Kapukai stage | This implementation |
|---|---|
| Domain and scope | Consequential public decisions, one act or omission, initial jurisdictions explicitly identified |
| Vision and stakeholders | Usable lawful review and verified practical correction for affected people, including children |
| Priorities | Safety and applicable rights; lawful authority; reliable evidence; meaningful participation; timely remedy; maintainability |
| Heuristics | Source every claimed duty, preserve competing evidence, keep clocks separate, route by relief, verify implementation |
| Functions | Record, classify, trace authority, identify duty, route review, track actual remedy |
| Components | Card, source registry, event ledger, route atlas, deadline register, learning module |
| Evaluation | Source support, route completeness, unresolved gates, receipt integrity, implementation latency, correction reach |
| Coupling | Each derivative finding and asset links to the source it relies on |
| Decoupling | Fictional classroom data remains separate from real case data and public marketing |
| Coherence and dissonance | Compare records and outcomes, retain disagreement as an issue to evaluate |
| Learn and correct | Source changes flag affected lessons and route entries for review and version update |

### Teaching design
Homework: narrated lesson with captions, fieldbook reading, Action Duty Remedy Card and a short readiness check.
Class: 90 minutes with fictional evidence packets, small-group roles, a challenge round and a practical exit assessment.
Group roles: fact recorder, authority researcher, procedural navigator, independent reviewer and affected-person perspective/timekeeper. Smaller groups combine roles.
Assessment rewards supported reasoning and explicit unknowns. It does not reward invented accusations, unnecessary filing, certainty or volume of documents.
Classroom training rules are unmistakably fictional. Real statutes appear in separately marked worked examples.

### Production and source of truth
One approved lesson content set supplies the handbook, website, slide copy, narration and captions. Legal sources have stable IDs across assets. Source changes flag affected slide, paragraph, route and narration segment IDs.
Deck: editable PowerPoint with native exact diagrams.
Video: exact slide renders, generic AI narration, unobtrusive instrumental music, captions, transcript and a source/disclosure endcard.
Descript: editable transcript, video assembly and captioned export.
Runway: narration and musical asset generation. Illustrative footage is optional and cannot substitute for a precise authority diagram.
Authentic founder speaking clips can be added later as separately supplied media.

### Pilot acceptance checks
1. A participant can identify one challenged action or omission without merging an entire life history.
2. Every claimed mandatory duty has a pinpoint source, actor, trigger and required act.
3. A participant can distinguish a factual dispute, legal issue and desired result.
4. The atlas refuses to imply a known court route where jurisdiction/review prerequisites are unknown.
5. Filing, receipt, service and response states remain separate.
6. Each legal deadline has its own rule and trigger. The prototype calculates no real-case deadline.
7. Three synthetic cases expose identity error, access barriers and an omitted discrete decision.
8. A remedy is measured by its implementation and defined reach.
9. Site form data stays in memory until the user exports it. There is no case upload, automatic filing or correspondence service.
10. Published assets identify pilot scope, sources, version and AI narration.

### Deployment
Public source belongs in the existing Kapukai governance repository under authority-to-remedy. The tested release is deployed on Vercel first. The intended short path is https://kapukai.org/authority-to-remedy/. The existing nginx host requires authenticated installation; Vercel access alone cannot change it. Preserve existing pages and email DNS. A release manifest connects source commit, tested deployment and installed files. Report the short path as pending until actual publication and verification.

### Source anchors
- Declaration: https://www.archives.gov/founding-docs/declaration
- Constitution: https://www.archives.gov/founding-docs/constitution-transcript
- Florida judicial review: https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0039/Sections/0039.701.html
- Florida juvenile rules, 1 October 2026: https://www-media.floridabar.org/uploads/2026/09/2027_04-OCT-Florida-Rules-of-Juvenile-Procedure-10-1-2026.pdf
- Federal APA section 555: https://www.govinfo.gov/link/uscode/5/555
- Full provision and case registry: legal_sources.json

This blueprint defines the pilot, not universal filing instructions or a promise of relief.

