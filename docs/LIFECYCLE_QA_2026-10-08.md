# Workshop lifecycle adversarial QA — 8 October 2026

## Result

Independent code and boundary review is ready for a staged rollout. Eighteen adversarial integration tests passed as a complete suite. A nineteenth focused regression checks that receipt acknowledgements attach to the delivered version and cannot inflate the count through repeated clicks. The production deployment, real owner sign-in, and scheduled maintenance require separate verification by the release operator; this document does not claim those occurred.

Test file: `community/backend/tests/lifecycle-adversarial.test.mjs`.

Tested migration: `20261008191433_workshop_lifecycle.sql`.

SHA-256 of the migration and its matching SQL source:

`4b03d47d1ffa4aeff5cbaac465c91d81676992b16c24eb7218fa100a762c227a`

## Meaningful checks

| Boundary | Exercised result |
|---|---|
| Current owner authority | Revoked, expired, future, wrong-scope and wrong-capability grants deny queue and commands. Deleted, mismatched, expired and over-30-minute sessions deny access. Inactive identity, deleted subject, suspended tenant, banned/unconfirmed account and forged subject/tenant deny access. |
| HTTP → privileged SQL | Client actor fields are rejected. An authenticator result cannot override a session revoked in the database. A full service-role review → offer → acceptance → delivery → correction → close cycle succeeds without granting configuration or audit modification privileges. |
| Concurrency controls | Stale revisions do not overwrite a decision. Repeating the identical request is harmless; changed payload or command with the same request ID conflicts. The SQL serializes capacity reservations with a transaction advisory lock. |
| Applicant scope | Applicant tokens cannot act as owner, change another application's target through payload fields, enroll a newsletter, publish, or grant expert status. One application does not change another. |
| Existing links | An application and newsletter link created before applying the lifecycle migration still confirm and withdraw correctly afterward. Merely reading an application does not confirm it. |
| Withdrawal/suppression | A withdrawal after queue inspection blocks later progress and releases its commitment. Suppression blocks owner progress and applicant acceptance. Old links continue to permit withdrawal. |
| Capacity and expiry | Full capacity denies a second offer. Expired pending offers cannot be accepted and stop consuming capacity before maintenance. Maintenance releases commitments for suppression and expired management links. |
| Recovery | A closed delivered request retains feedback, correction and reconsideration. A correction creates a new delivery version. Initial delivery must match the resource accepted by the applicant. |
| Bounded abuse | One application's 100 rolling-day applicant mutations block further update spam with HTTP 429. An identical retry, closing and withdrawal remain available. Older events fall out of the window. |
| Queue completeness | Active, archived and all views have bounded pagination, counts and continuation state. Older resolved records cannot consume the active queue and hide new work. |
| Notice sending | Actual HTTP + SQL with a mocked provider sends only the stored recipient. Recipient injection is rejected. Unknown delivery is recorded and never automatically resent. Reusing a notice request ID against another application conflicts. Suppression, withdrawal, stale revision and session expiry block a new claim. |
| Receipt metrics | A delivery version can be acknowledged once; a corrected version needs its own acknowledgement. Events carry the applicable delivery version. |
| Private data/audit | All seven lifecycle tables have RLS. Anonymous and ordinary authenticated roles cannot read tables or invoke owner, snapshot or maintenance RPCs. Service role cannot change configuration or amend/delete workflow/access audit rows. |

## Defects closed during review

1. Suppressed and management-expired accepted offers could strand capacity. Bounded maintenance now releases them.
2. The fixed oldest-first queue could permanently hide new work behind closed records. Active/archive views and pagination now keep it reachable.
3. Closed delivered work had no direct correction path. The correction path now remains available while the private management link is valid.
4. Initial delivery could substitute an unaccepted resource. It is now bound to the accepted resource; a requested correction is a separately recorded version.
5. A valid applicant token could create unlimited repeated update events. A rolling mutation cap now limits this while preserving exit and idempotent retry.
6. The capacity configuration row lock required a service privilege that was deliberately withheld. The backend owner replaced it with a transaction advisory lock; the independent complete service-role test verifies the corrected path.
7. Delivery receipt counts could be inflated by repeated acknowledgement commands. Receipt events now bind to a version and the action disappears after acknowledgement of that version.

The owner-handler reviewer also corrected `capacity_full` to HTTP 409 so a full commitment queue is not reported as a generic temporary service outage.

## Notification handoff review

The order is: verify the real identity through the Auth provider; recheck the active session, mapping and exact grant in SQL; lock the registry/application; reject suppression, withdrawal, expiry and stale revision; claim this application revision once; return its stored recipient only to the server; call the provider; bind its receipt to the original claim.

The public client supplies no recipient, message body, role, tenant or subject. The preview and provider adapter use the same versioned generic message. It contains no case material or bearer token. Reading the queue or changing an application does not send mail; sending is a separate explicit owner action. Provider acceptance is not inbox delivery. A timeout remains unknown and cannot trigger a retry. Receipt-only completion after session expiry can record the already-started handoff, but cannot send again or authorize a new claim.

There is an unavoidable external boundary: a withdrawal or suppression occurring after the claim commits cannot atomically recall an in-flight provider request. The notice is deliberately generic, and the original private application page rechecks its current state. Do not promise instantaneous recall or exactly-once recipient delivery.

## Limits and rollout gates

- Tests use isolated PGlite and the actual migration/handlers. Provider account data and email delivery are synthetic stubs. The identity digest fixture models mapping equality, not production HMAC security or real provider JWT verification.
- These checks exercise transaction ordering sequentially; they do not prove multi-connection production concurrency, load capacity, provider availability, or browser security. The lock order and capacity serialization were also inspected directly.
- Keep the new lifecycle gate closed until the deployed functions, current privileges, and exact existing owner mapping/grant have been inspected. Confirm unauthorized requests fail. Do not mint or impersonate an owner session for acceptance testing.
- Verify the scheduled bounded maintenance job in the real database. Pending offer expiry is immediately excluded from capacity; suppression and management-expiry cleanup depends on maintenance, so its health must be monitored.
- Existing tokens expire after their published management period. Help recovering access or addressing deletion/retention remains a human contact process; no automatic deletion or new token recovery is claimed here.
- No account, professional qualification, court authority, signed agreement, paid order, publication permission, public directory or community membership is created by these workflows.
