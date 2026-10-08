> Historical implementation notes. Current migration and verified email status: see [community README](../README.md).

> Original release status: see [October 8 release record](../RELEASE-2026-10-08.md). The notes below document the original candidate and are historical; the signup service is now deployed with additional independently consented community purposes. Real confirmation-email acceptance is pending.

# Scoped signup candidate

Status: local candidate. No production schema changes, deployments, email sends or subscriber enrollments were performed by this implementation task.

## What this adds

A public, email-confirmed request for exactly two purposes:
- `tester_invites`: invitations to suitable tests, with optional interests `affidavit`, `timeline`, `evidence_dossier`.
- `remedy_brief`: newsletter frequency `monthly` or `every_other_week`.

It reuses `public.kapukai_interest_registry.id` as the identity and adds scoped intents, subscriptions and events. It does not create another contact list. It does not start the four legacy onboarding messages. It sends only the necessary confirmation requested through the form. There is no newsletter or tester-invitation sender in this candidate.

The launch gate defaults closed in `public.kapukai_scoped_config`; only the database administrator can enable it. The Edge Function can read the gate but cannot change it. Turning the gate off blocks new requests and confirmations while preserving token inspection and unsubscribe.

## Files and runtime

- `sql/proposed_schema.sql`: transaction-ready proposed database change. Create the normal repository migration using the current Supabase CLI before adopting it into deployment history.
- `supabase/functions/kapukai-scoped-signup/index.ts`: Supabase Edge entrypoint.
- `supabase/functions/kapukai-scoped-signup/handler.mjs`: dependency-free validation and HTTP logic shared with tests.
- `supabase/config.toml`: function JWT verification disabled, because public requests and scoped bearer-token operations have their own controls.
- `tests/`: isolated SQL + HTTP integration coverage, using synthetic contacts and mocked SMTP.
- `package.json`, `package-lock.json`: test dependency pinned to PGlite 0.5.8.

The parent task supplies the public frontend. No separate frontend is shipped here.

Test: `npm ci --ignore-scripts && npm test`.

## Provenance and compatibility

The candidate was written against the observed 5 October 2026 schema in project `tbxfsjipkrdwyctepesf`, including the registry interest-value constraint and legacy onboarding trigger.

One compatibility change permits zero legacy interests. New scoped-only identities are inserted with:
- `interests=[]`;
- `status='pending'`;
- no `email_confirmed_at`.

These explicit values avoid the old registry defaults of updates/subscribed. Existing contacts' names, status, global confirmation time, legacy interests and consent metadata remain unchanged by this add-on. The old trigger consequently does not queue onboarding for scoped confirmation.

The existing public legacy signup endpoint still enforces a nonempty legacy-interest selection. A future intentional legacy enrollment can supply that choice through its original flow.

Consent scope states:
- An intent begins `pending`.
- Successful explicit confirmation creates/updates `confirmed` subscription rows.
- A scoped opt-out creates `unsubscribed` state.
- Older pending links may become `canceled` when revoked or superseded.
- Per-topic pause is not exposed in this capture-only version. The operator launch pause is separate from a person's consent.

## API contract

Endpoint:
`https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-scoped-signup`

Allowed browser origins:
- `https://kapukai-join.christinehillier.chatgpt.site`
- `https://kapukai.org`
- `https://www.kapukai.org`

POST requires JSON and one of those exact origins. No browser API key or login is needed. Unknown input fields, including story/document fields, are rejected; the body limit is 4 KiB even without Content-Length.

Request:
```json
{
  "action": "request",
  "email": "person@example.test",
  "topics": ["tester_invites"],
  "tool_interests": ["affidavit"],
  "newsletter_cadence": "monthly",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "consent_version": "kapukai-scoped-v1-2026-10-05",
  "source_path": "/testers",
  "started_at": 1791180000000,
  "privacy_acknowledged": true,
  "adult": true,
  "website": ""
}
```

The frontend must generate a fresh UUID for a new logical request and preserve it for retries of the same unchanged payload. Generate a new ID when the payload changes or the request succeeds. The timestamp is the real form-mount timestamp; a request faster than 1.2 seconds or older than one day is rejected. `website` is a honeypot.

Valid paths are `/join`, `/testers`, `/newsletter`, without a trailing slash. Tool interests are optional but, if present, require tester_invites. An empty tools array means no tool preference was captured; a future sender must not assume permission to expand into every new tool category.

The API returns the same generic HTTP 202 response for a created request, a duplicate request, global suppression, honeypot interception and a rate-limited address. It does not reveal membership status or claim the email was delivered. Nothing becomes subscribed until the scoped link is confirmed.

Token operations:
```json
{"action":"inspect","token":"43-character-opaque-token"}
{"action":"confirm","token":"43-character-opaque-token"}
{"action":"revoke","token":"43-character-opaque-token","topics":["tester_invites"]}
```

An inspect success returns:
```json
{
  "ok": true,
  "result": "valid",
  "state": "pending",
  "topics": ["tester_invites"],
  "active_topics": [],
  "newsletter_cadence": "monthly",
  "tool_interests": ["affidavit"],
  "can_confirm": true,
  "blocked": false
}
```

Only the link's scope is shown; email and other subscriptions are never returned. Render the current `active_topics` to describe current permission. `state` is the historical intent state and is not proof that every topic remains subscribed.

Successful confirmation returns `result: confirmed` with topics, or `already_confirmed` on replay. Successful opt-out returns `result: unsubscribed` with selected topics. `expired`, `invalid`, `used`, `superseded` and `suppressed` cannot grant permission. After `superseded`, ask the person to make a fresh deliberate request if their newest choice is different.

## Confirmation and management

Mail uses:
`https://kapukai-join.christinehillier.chatgpt.site/join/#token=...`

The token is 32 cryptographically random bytes, URL-safe encoded, with only its SHA-256 digest stored. The record binds the requested topics, cadence, tool choices and consent version.

Confirmation is allowed for 48 hours. Scoped unsubscribe remains available for 180 days. Keep the token only in page memory; remove it from the address bar after reading the fragment. Do not place it in analytics, referrers, local storage, logs or public QR codes.

GET on the Edge Function performs no subscription mutation. It redirects a syntactically valid token to the owned static page's fragment. Supabase's current Edge documentation states that GET text/html responses are rewritten to text/plain, so HTML confirmation UI belongs to the static site. Email scanners opening a link cannot activate permission; the user must explicitly POST Confirm.

A later confirmed request has a greater monotonic `request_seq`. An older pending request cannot overwrite newer cadence or tool choices. An unexpired old management token can revoke its allowed topics even if there is a newer grant: opt-out wins. Such an event records both the controlling token intent and the affected latest grant IDs. A token cannot revoke outside its original scope or reactivate a withdrawn intent.

Global legacy `suppressed` and `unsubscribed` statuses block new requests and confirmations; this add-on never clears them. This may require an operator-assisted correction where a person intentionally wants to rejoin after a global opt-out. No consent is inferred from old registry membership.

## Provider integration and limits

The Edge entrypoint reuses only existing server-side environment values:
- SUPABASE_URL;
- SUPABASE_SECRET_KEYS default, or SUPABASE_SERVICE_ROLE_KEY;
- POSTMARK_SERVER_TOKEN;
- POSTMARK_FROM_EMAIL.

No new secret is required. Confirmation mail uses the existing Postmark `outbound` transactional stream, with open/link tracking disabled and no marketing material. The receipt stores accepted, failed or unknown. Accepted means provider acceptance, not recipient delivery.

The existing legacy webhook does not correlate these new scoped intent receipts. It does not currently provide new scoped delivery/bounce/complaint state. Postmark still enforces its own stream suppression. Before enabling any future newsletter or invitation sender, implement provider-event correlation and global/stream suppression reconciliation for this new scope. Do not present capture readiness as broadcast readiness.

A timeout after handoff is stored as unknown. There is no automatic resend worker. A duplicate HTTP request ID does not produce another email. Operator reconciliation is required for unresolved provider acceptance. A fresh explicit request may obtain another confirmation, subject to the per-address limit.

The existing rate-limit RPC is reused with HMAC fingerprints scoped to this add-on, date and network/address. No raw IP is stored by the candidate. Limits are 40 requests per network/day and 3 per address/day; forwarding headers are supplemental abuse signals, not authentication.

A read-only check found no current public/private database function source combining registry access and DELETE, and no current cron command directly mentioning the registry. That is not a guarantee against future cleanup changes. Any future cleanup must preserve confirmed scoped subscriptions even though their legacy registry status remains pending.

## Deployment prerequisites

1. Copy the candidate backend and tests into the repository that owns the production backend. Preserve the versioned consent text in the same commit.
2. Create the normal migration using `supabase migration new`, then use the reviewed candidate SQL as its content. The SQL assumes the observed existing registry constraint; stop on a drift error.
3. Apply it in a test environment first. The isolated tests passed but do not exercise production networking or concurrent database connections.
4. Deploy `kapukai-scoped-signup` with both index.ts and handler.mjs, and `verify_jwt=false`. Do not overwrite the old signup or sending worker.
5. Verify existing Postmark credentials and outbound stream are available to the new function; do not print their values.
6. Publish the static /testers/, /newsletter/ and /join/ pages at the configured origin. Their current consent text must match this version and promise only enrollment/invitations and the selected editorial cadence.
7. Confirm the blocked launch response before changing the gate. Once source, public page and owner-controlled end-to-end confirmation/unsubscribe test are ready, enable deliberately:
```sql
update public.kapukai_scoped_config
set enabled=true, updated_at=now()
where id=1;
```
8. Publish QR codes only after the actual static destination works. QR codes must contain the public signup path, never a personal token.
9. Keep new editorial/tester campaign dispatch disabled. Future policy: one discretionary email per rolling seven days across all topics, monthly or every-other-week newsletter selection respected, purpose checked again immediately before send, and explicit reviewed content required.

Emergency pause:
```sql
update public.kapukai_scoped_config
set enabled=false, updated_at=now()
where id=1;
```

This does not block scoped unsubscribe. Do not drop consent tables as a rollback. Do not narrow the legacy interests constraint while zero-interest scoped identities remain.

## Verification completed

14 tests passed:
- same-registry identity with no legacy onboarding;
- no unauthenticated permission changes for existing contacts;
- scoped confirm/revoke and request idempotency;
- expired and replayed tokens;
- global suppression before and after request;
- out-of-order confirmation and scope-preserving opt-out;
- latest grant version in revocation audit;
- public-role denial, sequence ACLs and service-role operation;
- strict origin/body/schema rejection;
- no activation on GET;
- real SQL plus HTTP confirmation flow with mocked SMTP;
- fail-closed launch configuration;
- unsubscribe remains available while signup is paused;
- ambiguous delivery is recorded without automatic retry.

No real email was sent. No production state was changed. Separate production verification must check the deployed route, gateway, actual confirmation mail and operator-owned unsubscribe.

