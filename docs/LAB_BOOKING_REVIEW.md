# Lab booking independent review

Reviewed 22 October 2026. Scope: the additive private Lab SQL, Edge API, guarded owner bootstrap, and rollback-only acceptance script. The member interface is reviewed separately below when available. This document records bounded evidence, not a claim of production readiness or zero defects.

## Review disposition

No outstanding blocking issue found in the reviewed SQL and Edge candidate. Deployment must remain disabled until real opening windows and the deliberate approved-member list are configured. No existing account becomes a Lab member merely by signing in or being a community member.

## Findings corrected during review

- Canonical JavaScript ISO timestamps ending in `.000Z` initially failed the Edge validator. The validator now handles canonical fractional and bare-second minute boundaries, with invalid-date tests.
- Class bookings initially lacked a correction path. An operator can now cancel a scheduled class; all confirmed seats release atomically and receive cancellation notices through the outbox. Removing an opening window refuses to orphan confirmed reservations.
- Email receipt writes now require a provider ID for acceptance, reject receipt IDs for failed/unknown states, and append separate handoff history. Unknown/sending messages are never automatically reclaimed.
- Operator-only email delivery counts are projected to the interface. Member identities and email addresses remain excluded from the shared calendar projection.
- Guarded operator bootstrap locks authoritative grant sources and rechecks/locks the current verified Auth identity before granting access. It resolves existing authority rather than assuming a mailbox is the Auth identity.

## Evidence reviewed

- Private schema and helpers deny direct browser/service-role table access; only bounded public RPCs are executable by the service role. RLS is enabled on all Lab tables. Edge checks real Supabase identity, and every command independently rechecks a current live session and current Lab grants.
- A singleton config row is locked `FOR UPDATE` before decision reads and writes. The lock serializes the low-volume Lab's overlapping inventory, class seats, membership changes and idempotency decisions until transaction completion. Under ordinary PostgreSQL READ COMMITTED execution, subsequent PL/pgSQL statements after a waiter obtains the lock see the committed inventory. Direct privileged database bypass remains administrative authority, not a member API path.
- End times are independent whole minutes; only starts are quarter-hour aligned. Half-open interval comparisons permit adjacent reservations. Failed rescheduling retains the original booking.
- A successful mutation and both notification rows commit together. Email sending follows commit; uncertain delivery does not turn a confirmed booking into a failed reservation. Repeated request IDs cannot make a second booking or duplicate the same version's outbox rows.
- Explicit decisions and denial outcomes carry actor, session, policy version and request/reference data. Stored request responses and booking versions permit reconstruction of changes. The private audit is not externally tamper-proof, and successful schedule reads are not recorded as decision events.
- Focused DB and Edge run observed: 24 tests passed, zero failures. A later dedicated Edge-to-SQL integration suite is owned by the API agent and included by the release integrator.
- `community/backend/tests/lab-live-acceptance.sql` passed locally against the actual member and Lab SQL in PGlite. It includes ACLs, separate Lab grant, invalid/mismatched session, quarter-hour starts with independent 47-minute end, replay and request mismatch, room/person collision, private projection, failed reschedule preservation, class capacity/release/cancellation, scoped outbox claim/no uncertain retry, revoked member cancellation and session revocation.
- The acceptance SQL is one BEGIN/ROLLBACK transaction and refuses a nonempty or enabled Lab. Synthetic addresses use `example.invalid`; there are no provider or Auth API calls. The root integrator inspected current auth triggers and confirmed transactional CRM changes only before live use. Live execution evidence belongs in the release receipt.

## Accepted limits and next observations

- PGlite and the rollback acceptance are not a multi-connection concurrency/load experiment. Global serialization prioritizes correctness over throughput at this scale.
- Real sign-in and receipt by an actual member/owner inbox require live observation; mocked Postmark acceptance is not inbox delivery.
- Interrupted `sending` and `unknown` email handoffs need provider reconciliation. The implementation deliberately does not blindly resend them. The initial pending-message recovery is operator initiated, not a scheduled autonomous worker.
- One private Lab calendar is authoritative. It does not claim Google Calendar conflict synchronization, door-code delivery, payment entitlement enforcement, or external room inventory synchronization.
- The existing account identity is reused, with the existing memory-only short session approach. A separate page may require signing in again; no separate account is created.

## Interface review

The generated `/lab/` shell and `lab.js` were reviewed for current account reuse, private access gating, time selection, DOM injection, receipt messaging and correction controls. Booking drafts retain their request ID after an uncertain transport response. Other-member occupancy is rendered as “Reserved”; strings use DOM `textContent`. The following review fixes were verified in source:

- Sign-out is scoped to the current Auth session rather than globally signing out other Kapukai sessions.
- A confirmed mutation remains reported as saved even when the subsequent calendar refresh fails.
- Operator controls include class cancellation, opening removal and pending-notification dispatch; approved-member email addresses stay in the operator-only view.

This source review does not replace graphical/mobile acceptance or a real member sign-in. The calendar polls for changes and refreshes after commands; the database remains the final conflict authority.
