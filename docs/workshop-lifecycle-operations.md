# Workshop lifecycle operations

This implementation extends private applications into a human-operated support workflow. It does not launch a private case workspace, paid engineering engagement, expert appointment, credential, signature, public release, legal trust, tribunal or federated social network. Implementation is not proof of live deployment; consult the release verification record.

## Release and authority

Migration `community/backend/supabase/migrations/20261008191433_workshop_lifecycle.sql` was generated using Supabase CLI 2.120.0. Its identical review source is `community/backend/sql/workshop_lifecycle.sql`. Deploy with the lifecycle gate closed. Existing application intake and newsletter gates are independent. Do not change contacts, legacy purposes or tokens during deployment.

Every owner queue read, command and notice claim requires a verified Supabase user and the principal returned under that same bearer token, plus a database recheck of the live session, active identity, tenant and subject. The session must be less than 30 minutes old and not past its `not_after` deadline. The user must not be banned and must have a verified email. An active `steward` grant must contain the exact capability `community:applications:review` and exact scope `community:workshop`. An email address, frontend label, user metadata, unverified JWT fields or an unrelated engineering capability cannot authorize these operations.

The service role cannot read the auth sessions or identity digest secret directly. A private, fixed-search-path `SECURITY DEFINER` boolean helper performs only the narrow authority check. Its schema and execution privileges deny public, anonymous and ordinary authenticated callers. Public RPCs are security invoker and service-only. New tables have RLS and no public grants or policies. The migration issues no owner grants. An administrator must separately identify and grant the approved owner principal; never select a person by a guessed email or grant every authenticated account.

## Owner routine

1. Open the owner console and establish a fresh account session. Read the active queue. Application aliases and broad preferences are visible; emails and case documents are not in the queue. Active, archived and all views are paginated, with a total count and `has_more` indicator.
2. Review suitability and capacity. Request only a structured clarification of service interest or broad volunteer availability. Do not ask for private narratives or financial proof here.
3. Choose review, waitlist, decline or an explicit bounded free offer. An offer names a fixed public resource or practice/training orientation, 15–120 minutes of scope, and a 1–30 day response deadline. It is nonbinding and costs zero. The applicant can accept or decline. It grants no appointment, qualification or private-system access.
4. After acceptance, explicitly start the activity and deliver the accepted public resource. The original delivery must match the accepted resource. Each correction resolution creates a new delivery version; it may point to a different allowlisted public remedy resource. The earlier delivery remains in history.
5. Invite a voluntary receipt acknowledgement and factual feedback. Receipt means the resource was received, not that every statement is correct. Feedback choices record whether it works, what category is broken and what kind of improvement would help. A correction request reopens the workflow, including after closure when a delivery exists. Receipt, feedback and correction events bind to a delivery version. A delivery version can be acknowledged only once.
6. Close completed work or pause unsuitable work. A declined, waitlisted or closed applicant can ask for reconsideration. This returns the record to human review and never approves it automatically.

All mutation requests carry the expected revision and a stable request UUID. A stale tab must reload. A retry with the same UUID and identical command is idempotent. Reusing the UUID for changed content is rejected. Requests and audit events use structured fields, not unrestricted operator notes.

## Communication

An update does not send mail by itself. The owner previews the fixed transactional message, then explicitly chooses Send update. The exact template version is `kapukai-application-update-v1-2026-10-08`. It says an update is available and directs the recipient back to the original private application confirmation email. It contains no application status, case facts, documents or new token. This is not newsletter consent.

Before returning the existing recipient to the server-only mail adapter, the claim RPC checks current owner authority, expected application revision, global suppression, withdrawal, management expiry and the lifecycle gate. At most one notice is claimed per application revision. A retry returns receipt state without a recipient or permission to send again. Provider `accepted` is not recipient delivery. Definitive errors are `failed`; an uncertain handoff is `unknown`. Neither state automatically retries. Reconcile an uncertain provider event before further contact; do not create a cosmetic application update solely to bypass the notice boundary.

A provider receipt can finish after the owner's session expires because it is bound to an already authorized claim's exact user/session/principal. This receipt-only RPC cannot return a recipient or authorize another send. If the process dies during handoff, maintenance changes an old claim to `unknown` after 10 minutes. It does not retry. A withdrawal or suppression committed after the dispatch claim cannot recall a message already handed to the provider; the generic message deliberately discloses no case information.

## Capacity, expiry and withdrawal

The pilot has a configurable maximum of 12 open offers or accepted commitments. This is a proposed operational ceiling, not a service-level promise or automatic allocation. Only an explicit owner offer reserves capacity. A transaction advisory lock serializes reservations without granting the service role permission to change the configuration. Pending offers past their response deadline do not consume capacity. Acceptance retains the reservation until closure, pause, decline, withdrawal or maintenance release. Applicant mutations are capped at 100 per rolling 24 hours after idempotent retries are checked. Closing and legacy withdrawal remain available at that limit.

The existing private token still confirms, inspects and withdraws only its own application. Confirmation expires in 48 hours; management expires in 180 days. A GET or email scanner cannot confirm, accept an offer or withdraw. Tokens remain fragments, are removed from the browser address bar and are stored only as hashes on the server. Old token action/result semantics are preserved; inspection adds the lifecycle snapshot.

Withdrawal cancels pending/accepted offers and stops further work actions. Global suppression is authoritative and never cleared by this module. `kapukai_workshop_maintenance()` processes at most 100 due offer records per pass, releases pending/accepted commitments for suppressed, withdrawn or management-expired applications, and records expiry events. It sends no mail, deletes nothing, grants nothing and publishes nothing. The separately generated `20261008192631_workshop_maintenance_schedule.sql` registers the named pg_cron job `kapukai-workshop-maintenance` every 15 minutes; its installation and execution must be verified in production. Run maintenance repeatedly when a backlog exceeds one pass.

## Gates and retention

Only an authorized database administrator may change `kapukai_workshop_config.enabled`. The service role can read the gate but cannot enable it. Pausing the lifecycle leaves authorized queue reads, inspection and existing withdrawal available; closure/pause remain possible for active unsuppressed applications. Existing intake continues according to its own gate. No agreement, payment, contract signature or reviewer credential is inferred from accepting a resource offer.

The $250/hour paid engineering reference remains separate from this free resource workflow. Actual paid work requires its own agreed scope, price, infrastructure treatment, authority and payment process. This implementation invents no $500/$1,000 package and cannot charge anyone.

Audit and version records are retained. No automatic retention purge, subject-access export or deletion-job claim is made. Establish an approved retention schedule and a careful contact/application deletion procedure before scaling. Shared newsletter identity means an application deletion must not silently erase unrelated consent records.

## Verification before enabling

Run actual SQL/HTTP tests, including service-role privileges, anonymous denial, session expiry, wrong scope, revoked grants, stale revisions, duplicate requests, capacity, offer expiry, suppression, legacy token operations, correction after closure and notice handoff uncertainty. Then deploy to the existing project with the gate closed. Check production ACLs, advisors, gate behavior and the exact Vercel page paths. Use only an owner-controlled application for the first real confirm → review → offer → accept → deliver → feedback/correction → close/withdraw journey. Do not claim Postmark acceptance is inbox delivery. Preserve existing contact and newsletter state before and after the check.

After the exact release passes, enable only the tested lifecycle. The canonical nginx installation remains a separate host operation; never repoint the entire kapukai.org domain or alter email DNS to install a partial module. Emergency rollback pauses the lifecycle gate and restores the previous static release; it does not drop applications or audit tables.
