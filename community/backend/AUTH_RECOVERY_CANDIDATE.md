# Shared account recovery — review candidate

**Release status: NOT ACCEPTED.** This is a local candidate for the existing `kapukai-member-access` service. No SQL has been applied, no Edge Function deployed, no real account changed, and no real message sent by these tests.

The source baseline is `Kapukai/kapukai-governance-site` commit `175600795f65c9cc43d8f859808bea86b32e1c63`. Read-only inspection found deployed `kapukai-member-access` v2 matching that handler, entry point and auth helper after surrounding whitespace normalization. Existing `createSignupSender` has been extracted into `kapukai-members/auth-code-delivery.mjs`; the original handler re-exports the same signup factory. Both signup and recovery now use that shared Supabase Auth / Postmark transport. The signup template and successful return shape are preserved; acceptance additionally requires HTTP 200 and a matching recipient if Postmark supplies `To`.

## Client contract

Only `https://www.humanlibertyledger.org` may call the new action. Its access is limited to that action; existing member, consent-token and operator actions keep their previous origins. Existing origins do not gain recovery access.

```json
{"action":"auth_recovery_request","payload":{"email":"person@example.invalid","request_id":"11835f81-6373-4ee0-9fef-32698771d80b"}}
```

The client generates one UUID for a deliberate request and keeps it for any retry of that same request. It must not automatically create a new UUID after a timeout. The only accepted payload keys are `email` and `request_id`. The complete request body is limited to 4096 UTF-8 bytes. The server normalizes surrounding spaces and email case, rejects controls and recipient-list syntax, and permits no client redirect, HTML, token, password or identity field.

| Outcome | HTTP | Response |
| --- | --- | --- |
| Existing or absent account, throttled request, duplicate request, accepted/failed/uncertain send | 202 | `{"ok":true,"result":"request_received"}` |
| Invalid JSON or exact payload schema | 400 | Safe `INVALID_BODY` or `INVALID_REQUEST` code |
| Oversize body | 413 | `BODY_TOO_LARGE` |
| Origin or action outside its origin scope | 403 | `ORIGIN_DENIED` |
| Missing shared configuration/background support, invalid budget result, or unavailable claim database before a send claim | 503 | Safe configuration or temporary-unavailability code |

Supabase generates a native numeric recovery OTP (6–10 digits); Postmark delivers it to the submitted mailbox. No recovery account is created. The client separately calls native Supabase `verify` with type `recovery`, email and OTP, then updates the password with the resulting recovery session. The frontend must isolate that session from ordinary app submissions and persistence. This backend never receives the new password and returns no OTP, recovery link, provider details or recipient.

The email explains that this changes the shared Kapukai account password. It uses fixed text and HTML, no remote images, no dynamic links, and Postmark `TrackLinks: "None"`, `TrackOpens: false`, transactional `outbound` stream. It uses the existing `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` / `POSTMARK_FROM_EMAIL`, Supabase secret-key lookup and service credential path. No second mail service or SMTP credential pipeline is introduced.

## Durable handoff and abuse limits

Existing `createRateFingerprint` and `kapukai_claim_signup_attempt` provide independent daily recovery budgets: **3 per address, 40 per network fingerprint, 50 globally**. The existing database helper clamps at 50; the new global constant reflects that real bound. Fingerprints use a recovery namespace distinct from existing membership and signup traffic. Forwarded network headers supplement the address and global bounds; they are not trusted as the sole control.

The candidate SQL adds a private request claim and receipt table. A unique request UUID binds to a keyed address fingerprint before either OTP generation or Postmark handoff. Concurrent duplicate claims cannot authorize another send. `pending`, `accepted`, `failed` and `unknown` receipts never reopen a claim. A provider timeout, malformed receipt, process crash or failed receipt write therefore cannot trigger an automatic retry. Provider acceptance is not proof of inbox delivery.

After a durable claim, the handler registers the in-memory delivery task using injected `defer`, backed by `EdgeRuntime.waitUntil`. It returns the neutral response without awaiting the account lookup or Postmark outcome. A registration barrier prevents delivery from starting if background registration throws. Every background error is handled without logging sensitive values. Missing runtime support fails before the claim; a failed registration after the claim leaves a neutral response and a nonreplayable pending row. A new deliberate user request may use a new UUID, subject to the same budgets.

Only service-role RPC execution is granted. Anonymous and authenticated clients have neither function access nor private table access. Functions use an empty search path. The table has RLS and no client policies. It stores no raw email, network address, OTP, password, user ID or session token. It does store pseudonymous address fingerprints, request UUIDs and provider receipt IDs.

## Unresolved release gates and operating limits

- Apply and review the candidate SQL through the repository's normal migration process; this file is deliberately a proposed SQL file, not an applied migration. Deploy the exact reviewed Edge bundle including the new shared module only after the database and client compatibility checks pass.
- The global 50/day budget is a pilot cost and abuse cap. It does not provide nationwide recovery availability. Capacity, denial-of-service resistance and observability need a reviewed operating design before public scale.
- CORS restricts browser access; it is not authentication and cannot stop a nonbrowser caller from supplying the allowed Origin header. Durable budgets remain necessary.
- The account lookup and Postmark outcome run after background registration and are not awaited by the HTTP response. This removes that explicit account-dependent timing branch from the response path; production timing and abuse testing remain release gates. The envelope does not claim constant-time execution or conceal rate/request history.
- `waitUntil` is not a durable job queue. Worker shutdown, hard resource limits or interruption can leave `pending` with no guaranteed delivery. Such records need reconciliation and never authorize an automatic resend. The browser receives request acknowledgment, not a delivery guarantee. In local Supabase CLI tests, configure the documented `edge_runtime.policy = "per_worker"` to allow background completion.
- Set a documented retention and reconciliation policy for pseudonymous fingerprints and provider receipts before public scale. Never delete or reopen UUID tombstones in a way that permits replay. Pending/unknown records require private reconciliation; do not resend automatically.
- Run real multi-connection claim-race tests on isolated PostgreSQL. PGlite runs the actual SQL but serializes a single engine connection; the in-memory Edge concurrency test separately checks dispatch behavior and is not proof of database overlap behavior.
- Verify the deployed Auth configuration, OTP expiry, password policy, recovery verification semantics and session revocation behavior using a dedicated test account. Verify real Postmark acceptance, inbox delivery, expiry, incorrect code, replay, multiple tabs, reset completion and clean sign-in. No owner account should be changed for this test.
- Native signup remains an independent unresolved release gate. These tests do not demonstrate a working public signup flow or establish production privacy, account isolation or delivery.

## Local verification

The baseline repository tracks `community/backend/package.json` and `package-lock.json`. At commit `175600795f65c9cc43d8f859808bea86b32e1c63`, both pin `@electric-sql/pglite` **0.5.8** (manifest blob `8d9c40072681cb86c509d5c440f78e1be8b5c36e`, lock blob `f18015921f361dbad68d73d61e09d157c0023448`). The discovery working copy does not contain the complete dependency manifests. No new package or production dependency is added by this candidate.

In a full checkout, install the existing pinned development dependencies from repository root, then run the focused suite:

```sh
npm ci --prefix community/backend --ignore-scripts
node --test community/backend/tests/member-edge.test.mjs community/backend/tests/member-access-edge.test.mjs community/backend/tests/member-invitation-edge.test.mjs community/backend/tests/auth-recovery-edge.test.mjs community/backend/tests/auth-recovery-db.test.mjs
```

For a partial source working copy, provision only the SQL test engine outside the source tree and select it explicitly. This is the standalone reproduction route; it needs npm registry access during installation but no Supabase credentials or network access during tests:

```sh
RECOVERY_TEST_RUNTIME="$(mktemp -d)"
npm install --prefix "$RECOVERY_TEST_RUNTIME" --no-save --ignore-scripts --package-lock=false @electric-sql/pglite@0.5.8
PGLITE_MODULE="$RECOVERY_TEST_RUNTIME/node_modules/@electric-sql/pglite/dist/index.js" node --test community/backend/tests/member-edge.test.mjs community/backend/tests/member-access-edge.test.mjs community/backend/tests/member-invitation-edge.test.mjs community/backend/tests/auth-recovery-edge.test.mjs community/backend/tests/auth-recovery-db.test.mjs
```

Tests cover the existing signup/auth/access/invitation contracts, action-scoped origins, exact input and body limits, isolated rate budgets, duplicate and mismatched IDs, claimed uncertain sends, fixed recovery generation and message privacy, explicit versus ambiguous provider results, narrow RPC transport, actual SQL transitions, terminal receipt immutability, RLS, grants, private columns and role-based denial. All fixtures are synthetic. No secrets or real personal data are required.

Local result on 2026-11-05, Node 24.22.1 and PGlite 0.5.8: **85 passed, 0 failed** (64 existing contract regressions, 14 recovery Edge tests, 7 isolated SQL tests). This focused run is not the repository's full suite and does not establish deployed recovery or real delivery.

Official background-runtime guidance verified on 2026-11-05: [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks) and [worker timeouts](https://supabase.com/kb/troubleshooting/edge-functions-worker-timeouts-and-websocket-drops). The documented API keeps registered work active after the response but does not bypass CPU, memory or wall-clock limits.
