# Kapukai Lab booking — release work record

## Outcome and boundaries

An additive private Lab booking module uses the existing Kapukai Supabase identity. A separate, revocable Lab list controls access. A current approved member can reserve available inventory immediately; there is no per-booking human approval. Human approval applies to Lab access only.

The calendar is a weekly visual schedule. Starts are restricted to :00, :15, :30 and :45; the end is selected independently in whole minutes. Room reservations and scheduled classes use the same inventory. Class participants reserve seats rather than the whole room. The lounge is the smallest room; conference room is separate; classroom has six desks. This release caps participants at six, with assigned staff outside that participant count; it is not an occupancy certification.

One private Lab schedule is the reservation source of truth. The connected Google Calendar inventory currently exposes only the owner's main calendar. This release does not copy it, expose personal appointments, or claim two-way Google synchronization. Existing online community appointments remain a distinct function and are not room reservations.

## Workforce

- Integrator: release boundaries, existing service configuration, deployment and evidence.
- Database engineer: live-session and Lab grants, serial reservation decisions, idempotency, audit and transactional notification outbox.
- API engineer: verified identity, strict command schemas, privacy projection and bounded Postmark handoff.
- Interface engineer: weekly calendar, existing-account sign-in, My bookings and explicit operator controls.
- Independent reviewer: cross-component security/functional review and rollback-only live acceptance.

## Critical path

1. Implement and verify atomic reservation/access rules, including conflicting requests, class capacity and cancellation/rescheduling.
2. Connect private weekly UI and automatic member/owner notices to the same committed reservation.
3. Independently review boundaries and run integration/production acceptance without contacting participants.
4. Preserve exact source in the existing repository, deploy to the existing Vercel project, and verify published bytes and API boundaries.
5. Owner sets actual opening windows, confirms displayed timezone and approves the first members; then enables booking. No invented hours or automatically approved participants.
6. Observe one real approved member's booking, both inbox receipts and a cancellation. Provider acceptance alone is not inbox-delivery proof.

## Operational decisions

Initial schedule has no opening windows, the Lab list is empty and booking is disabled. The existing verified steward may receive a separate Lab operator grant using a guarded bootstrap; it does not enroll that person as a participant. All member commands recheck current verified session and current Lab access. Revoked members retain a path to cancel their own bookings.

A successful reservation commits inventory, its decision record and two notices together. Email delivery happens after commit. A mail outage does not lose the reservation. Pending notices can be dispatched by an operator. Uncertain provider handoffs are not blindly retried; accepted, failed, pending and unknown are distinct outcomes. No door codes, case documents, private meeting subjects or attendee identities are exposed in shared calendar blocks.

Same account does not imply a new persistent cross-page browser session: the existing member portal uses memory-only sessions. Lab uses the same identity provider and credentials and preserves this security convention.

## Failure ledger

- Distinction corrected: 15-minute *start intervals* do not imply 15-minute duration. Enforce start alignment independently from end time in UI, API and database.
- Distinction corrected: approving Lab access does not imply approving each booking. Availability is decided atomically using shared inventory.
- Distinction corrected: a confirmed reservation and a delivered email are separate facts. Preserve confirmed booking if email handling fails.
- Correction path required: removing opening windows must not silently invalidate confirmed bookings; cancelling a scheduled class must cancel its seats and notify participants.
- Test limitation: sequential embedded-Postgres tests do not prove two independent production transactions raced. Record locking architecture and actual production assertions separately.

## Release evidence

- Full backend suite: 274 passed, including 35 new Lab DB/API/integration/UI tests.
- Existing Workshop interface/link checks: 8 passed.
- Installer tests: 10 passed after adding the Lab path to the explicit module allowlist.
- Independent review found no remaining blocking code finding. See LAB_BOOKING_REVIEW.md.
- SQL refactored into small private functions after connector request-state failures; all 9 database scenarios passed again.
- Edge function kapukai-lab deployed version 1, bundle SHA256 8fe772876cd1fc9a1c5824fbb5f037491f6ba3351ffc0dcd6d645e09094bdf8b.
- Live HTTP checks: public config 200; unsigned private state 401; unapproved origin 403; responses no-store.
- Database installation COMPLETE at 2026-10-22 03:18 UTC: 10 private tables, 10 private helper/decision functions and 2 service-only command/mail RPCs. All five remaining migration stages succeeded, including the exact operator_action SQL that previously failed. The prior connector failure cause is not established; the evidence does not show a SQL failure. Booking remains disabled pending operator/bootstrap, actual opening hours and member setup.
- Post-install advisors introduced no new warning/error; private tables intentionally have RLS without browser policies.
- Production PostgreSQL rollback acceptance PASSED at 2026-10-22 03:19 UTC: browser privilege denial, current sessions, separate Lab grants, closed-hours gate, quarter-hour starts with 47-minute end, idempotency, room/person conflicts, privacy, failed-reschedule retention, class capacity/release/cancellation, two-recipient outbox, single claim, no uncertain resend, access/session revocation and denied-decision audit. Readback confirms zero synthetic Auth/CRM rows and zero Lab members, openings, bookings and notices. This does not claim a simultaneous two-connection race or real inbox delivery.
- No real email sent. Provider handoffs in integration tests were mocked; actual inbox delivery remains unobserved.
- Vercel review deployment dpl_G2ThwFMwhxCUTcJtqzZhkRhN3kFC reached READY; its sign-in page rendered correctly in Chrome. Preview-origin sign-in is intentionally disabled by a follow-up guard; its new DOM test passed (10 UI tests total). Authenticated calendar graphical acceptance remains pending.

Rollback is to keep booking disabled and restore the prior frontend deployment if necessary. Preserve additive audit/data tables; do not drop user data. Previous production deployment: dpl_Hc6vPrMuV3J1icrmh11PsQYAFECJ. Existing production source baseline: 05fb6fa34502b945abffb98c7eb8db8eb6c32400.

## Current next gate

Installation and live database acceptance are complete. Do not rerun the recovery installation scripts. Next: guarded owner operator bootstrap; production frontend release; actual hours/member setup; controlled authenticated booking and real email receipts. A simultaneous multi-connection reservation race remains a distinct verification item.
