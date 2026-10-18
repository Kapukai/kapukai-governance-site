# Kapukai: one simple document workflow
Design and readiness checkpoint: October 18, 2026.

## Decision
Start with one manually managed pilot and one agreed deliverable. Reuse existing tools. Include use permissions in the same scope document. Do not create a separate licensing portal, attorney marketplace, subscription catalogue, or new database for this pilot.

This is a proposed commercial operating path, not a claim that paid checkout, private document delivery or licensing automation is live. The existing free-resource lifecycle remains free.

## The blueprint rules
Derived from LIFECYCLE_OPERATING_BLUEPRINT.md and OPERATIONS_BLUEPRINT_2026-10-18.md:
- Each job has one owner, one next action, a due date and a reference to the accepted scope.
- A request, accepted scope, payment, delivery and client acceptance are different events.
- Keep private records separate from public content and CRM summaries.
- Reserve capacity before promising work.
- Corrections and cancellation have visible paths. Completion needs evidence.

## Prepare once for the first offer
Choose one deliverable from the work Kapukai already offers: factual document organization, a timeline, dossier organization or a suitable technical diagram. State the actual testing/release status of any tool used.

Prepare one short scope-and-use template containing:
1. Deliverable and completion criteria.
2. Inputs, permitted handling method and information limits.
3. Price or capped hours at $250/hour, due date and payment schedule.
4. Exact version of any reusable material and who owns the relevant rights.
5. Permission for the customer to use the completed output, including intended sharing with counsel, an agency or a court; specify any adaptation/redistribution limits.
6. Correction scope, cancellation/refund terms and contact route.

Resolve rights once per reusable asset: ownership, human authorship where copyright is claimed, third-party permissions, existing Creative Commons grants and any exclusive publishing commitments. Copyright registration is a separate protection decision, not an extra step on every order. A use license does not establish accuracy, professional qualification or admissibility.

## Every order follows the same path
| Stage | Christine's action | Evidence required to advance |
|---|---|---|
| 1. Request | Read a short description; identify the requested output and available capacity. | Requested purpose and a next action. No private case upload at this stage. |
| 2. Scope | Send one written scope with price, limits, delivery date and use permissions. | Customer accepts the exact version. Changed scope requires renewed agreement. |
| 3. Ready | Verify agreed payment and permitted input-handling route. | Payment record/readback, accepted scope and available capacity. A checkout success screen alone is insufficient. |
| 4. Work | Produce the agreed output and check source fidelity, readability, permissions and limitations. | Reviewed deliverable with version and internal release decision. |
| 5. Deliver | Send the released version through the agreed route with use terms and correction contact. | Delivery record and, separately, receipt or acceptance response. Sending is not acceptance. |
| 6. Close or correct | Resolve within-scope corrections, obtain any new scope for additional work, and record the actual outcome. | Acceptance or an explained closure, outstanding items, final version and retention/access action where applicable. |

Use one existing HubSpot commercial opportunity as the manual business record. Keep only contact reference, deliverable category, stage, owner, next action, due date, scope reference, payment reference and delivery reference there. Do not place case narratives, evidence, sensitive file links or signed agreements in CRM notes. Do not overwrite server-managed participation summaries.

Operational commitment records remain owned by the existing operations service when its authorized controls are available. No new automatic HubSpot-to-operations transition is claimed or required for the manual pilot.

## Exceptions stay in the same record
- No capacity: waitlist or decline before accepting a commitment.
- Customer changes the request: pause affected work and revise the scope.
- Failed or uncertain payment/email: reconcile the provider record before retrying; do not double-charge or resend blindly.
- Correction: identify the affected version, preserve the prior version and release a corrected version.
- Cancellation/refund: follow the accepted terms and provider record; record cancellation separately from successful completion.
- No response: retain an awaiting-response state; later closure records the real reason rather than inventing acceptance.

## Solo cadence
Proposed starting limit: one active paid pilot.
- Each working day: inspect due actions and exceptions; choose the next action.
- Once a week: reconcile payment, unacknowledged deliveries, corrections and available hours.
- Add recurring licenses only after customers need continuing updates/support and the first complete order has been verified.

## What exists and what still needs proving
| Component | Evidence available at this checkpoint |
|---|---|
| Public diagrams and Privacy Boundary page | Source and Vercel preview exist; intended kapukai.org installation is not established by that preview. |
| Free-resource lifecycle | Source supports bounded free offers, versioned delivery references and correction. It is not a paid service workflow. |
| Operational commitments and CRM summaries | Dated release record reports deployment and verification; current local source also contains additional unfinished changes. |
| Local workflow protections | 17 targeted existing tests passed on October 18: owner/revision controls, evidence-required completion, replay handling, task readback and uncertain-send handling. Tests use local fixtures/stubs. |
| Paid agreement, licensing and checkout | Proposed. No completed end-to-end acceptance evidence inspected. |
| Private customer-input and document delivery | Must be verified for the chosen service before using real confidential material. Existing signup/contact storage does not establish this capability. |
| Today operator UI and purpose-specific email integration | Source candidates exist; the inspected release record lists these as remaining. Do not treat the candidate as a deployed service. |

## Minimum real acceptance test before advertising this as operational
Use one fictional order, a non-sensitive sample and provider test mode where applicable. Do not email outside recipients or create real charges without explicit authorization.
1. Accept a precise scope and permission version; confirm unauthorized edits cannot change it.
2. Verify successful, failed and repeated payment events cannot start duplicate work or charges.
3. Verify the intended recipient can receive the correct deliverable; check any private-access controls.
4. Request one correction and confirm that the new version remains traceable to the old.
5. Exercise cancellation/refund and verify the recorded state matches the provider.
6. Record acceptance or explained closure; confirm a sent message cannot stand in for completion.

Until those checks pass, describe the service as a scoped pilot with manual coordination, not automated checkout or verified private case processing.

## Source references
- docs/LIFECYCLE_OPERATING_BLUEPRINT.md: broader paid loop and actual free-resource contract.
- docs/OPERATIONS_BLUEPRINT_2026-10-18.md: system ownership and solo workflow.
- docs/OPERATIONS_RELEASE_2026-10-18.md: dated deployed evidence and remaining work.
- privacy-boundary/BLUEPRINT.md: public content versus local worksheet boundary.

This guide does not change existing contracts, licenses, prices, access controls, payment settings or public availability.
