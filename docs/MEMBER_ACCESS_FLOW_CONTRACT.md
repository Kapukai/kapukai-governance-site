# Member access flow contract

The public share URL is `https://kapukai-community.vercel.app/community/members/`.
Requesting access requires neither an Auth account nor an invitation. It grants
no membership, operator authority, subscription, discovery or publication.

## New isolated Edge endpoint

`kapukai-member-access`, same production CORS allowlist as `kapukai-members`.
All requests are POST JSON `{action,payload}`. No tokens in query strings.

- `access_status`: `{}`. Read-only `{ok:true,result:'ok',enabled:boolean}` checks the request service and confirmation transport configuration without sending mail or writing a request. Configuration faults return 503. This does not assert inbox delivery.
- `access_request`: `{email,display_name,request_id,consent_version,adult:true,privacy_acknowledged:true,human_review_acknowledged:true,started_at,website:''}`. Version `kapukai-member-access-v1-2026-10-20`. Generic 202 `{ok:true,result:'request_received'}` for accepted, duplicate, suppressed/rate-limited or honeypot submissions, with no account/existence disclosure. No automatic retry after uncertain mail handoff. Missing configuration/paused service returns 503; malformed input returns 400.
- `access_inspect`, `access_confirm`, `access_withdraw`: `{token}`. Token is 43-character base64url from 32 random bytes, stored only as SHA256. Confirmation URL `/community/members/#access_token=...`; inspect never confirms. Responses `{ok:true,result:'ok',state,revision,can_confirm,can_withdraw,consent_version}` (additional nonidentifying expiry allowed). Never return email or private identifiers. Confirmation valid 48 hours; management valid 180 days.
- `operator_access_queue`: `{}` with verified bearer session. Response `{ok:true,result:'ok',requests:[{id,email,display_name,state,revision,created_at,confirmed_at,...}]}`. Only confirmed reviewable requests, bounded at 100; minimal status/history as needed.
- `operator_access_approve`: `{request_id,expected_revision,expires_days}` with verified bearer session. Atomically uses the stored confirmed email and the existing private invitation command. Response `{ok:true,result:'ok',invite_token,invitation_id,expires_at}`. Raw token shown once. No email is sent by approval.
- `operator_access_decline`: `{request_id,expected_revision}` with verified bearer session. Response `{ok:true,result:'ok'}`. No email sent.

DB states: `awaiting_email`, `awaiting_review`, `approved`, `declined`, `withdrawn`.
Public token inspection may include `claimed:true` to direct claimed members to
their own account closure. Withdrawal revokes an associated unused invitation.

## Database RPC boundary

Private `kapukai_members.access_requests`, RLS/no direct role access. New public
RPCs execute only as service_role with a fixed search path and explicit internal
authentication where applicable. Existing member SQL and membership gate stay
unchanged. Agent implementing DB publishes exact SQL RPC signatures to the Edge
agent. Additive migration lives in `backend/sql/member_access_requests.sql` and
a CLI-created migration file after validation.

Idempotency binds request_id to normalized email and request contents. Public
requests use existing durable rate claims with isolated access-request keys:
3/address/day, 40/network/day, 100/global/day. Never store raw IP. No Auth account
or legacy CRM/email registry creation. Confirmation and approval recheck paused
state, expiry and expected revision; withdrawal remains available when paused.

## Invitation links and interface

Private link `/community/members/#invite=<64hex>` fills invited signup and explicit
join. Strip the exact valid fragment into memory immediately, before any fetch;
reject duplicate/mixed token parameters. Never persist tokens in browser storage
or submit on opening the link. Existing account recipients sign in then choose
Join; new recipients set their account credentials and verify their email.

Show Request access first on a generic visit, with Existing account / Have an
invitation alternatives. The operator queue has explicit human approval, copy
private invitation link, and close-request actions. Show the exact recipient
email only inside authenticated operations, never in public/private share URLs.

## Verification

Test the complete request → requested confirmation message → explicit confirm →
operator approval → invitation link → invited signup/membership path with fake
mail transport and local SQL. Check replay, paused gates, authorization, no Auth
creation before approval, withdrawal/revocation, token scrubbing and no implicit
consent. Production checks must not send messages to real recipients or create
real members on their behalf.
