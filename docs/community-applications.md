# Private community applications

Implementation date: 8 October 2026. This document describes the application intake added to `community/backend`. It is not evidence of production deployment or real email delivery; see the release verification record for those checks.

## Scope

Adults can request free or discounted engineering assistance, or apply to become a volunteer independent reviewer or witness. An email confirmation moves an application into `awaiting_human_review`. It does not approve assistance, issue payment, establish membership, qualify a professional, certify independence, appoint a witness, create a legal representation relationship, or sign a contract.

The existing `kapukai_interest_registry.id` remains the contact identity. New applications have their own private records and purpose-specific confirmation tokens. Newsletter topics, legacy contact fields, old signup links and newsletter consent are not changed. A globally suppressed or unsubscribed contact is not automatically reactivated.

This is an application capture and human review queue, not an authenticated social network. No member directory, messaging, evidence sharing, scheduling, automated eligibility decision, or private case workspace is implemented by this module.

## Minimal information

- Required: email; application kind; one service interest; free or discounted support for assistance; adult, privacy and human-review acknowledgements.
- Optional: short display alias; broad profession category and broad availability for volunteers.
- Not accepted: case narratives, attachments, income stubs, income amounts, home addresses, phone numbers, government identifiers, medical information, real credentials or court documents.

Unknown fields are rejected. The alias is capped at 60 characters and excludes control characters, email/address URL delimiters and markup. A short free-text field cannot guarantee that a person never types sensitive information; the page must clearly instruct them to use an alias and no sensitive details.

Professional interests are self-described. They do not substantiate an expert credential. Assistance is not conditional on a public testimonial, exposing a case, performing unpaid labor, or joining a marketing list.

## Versioned consent

Version: `kapukai-applications-v1-2026-10-08`.

The frontend must present the three acknowledgements before submission:

1. I am at least 18 years old.
2. I understand this private application requests only minimal contact and preference information. I will not submit private case records, financial documents, government identifiers, or other sensitive documents. Kapukai may contact me about this application.
3. I understand confirmation requests human review. Assistance depends on capacity and suitability; a volunteer application is not a credential, appointment or approval. Engineering and document formatting are not legal advice.

The backend stores all three `true` values, version, source path, request timestamp and later confirmation/withdrawal events. These acknowledgements are not a sworn declaration, an Adobe Sign agreement, an oath, an admission of legal liability, or a promise that the application will be accepted. Any later service agreement or witness declaration requires a separate, suitable process.

## API contract

Endpoint: `https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-community-apply`.

Only exact browser origins `https://kapukai.org`, `https://www.kapukai.org` and `https://kapukai-community.vercel.app` are allowed. Origin checks are a browser defense, not identity authentication. The public endpoint requires no service credential from the browser.

POST JSON, maximum 4096 bytes even without a Content-Length header:

```json
{
  "action": "request",
  "email": "person@example.test",
  "display_alias": "River",
  "kind": "assistance",
  "service_interest": "tools",
  "requested_support": "free",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "consent_version": "kapukai-applications-v1-2026-10-08",
  "source_path": "/community/assistance",
  "started_at": 1791470000000,
  "adult": true,
  "privacy_acknowledged": true,
  "human_review_acknowledged": true,
  "website": ""
}
```

`started_at` must be the current form-mount timestamp, at least 1.2 seconds and no more than 24 hours before submission. Generate one UUID per logical request and keep it across retries of the unchanged request; change it when the payload changes or the person starts another application.

Allowed kind: `assistance`, `reviewer`, `witness`.

Allowed service: `tools`, `timeline`, `evidence_dossier`, `affidavit_formatting`, `training`, `independent_review`.

For assistance, `requested_support` must be `free` or `discounted`; profession and availability must be omitted/null. For volunteers, support must be omitted/null. Optional profession: `engineering`, `education`, `research`, `administration`, `community`, `other`, `prefer_not_to_say`. Optional availability: `occasional`, `monthly`, `weekly`, `unsure`.

Source paths: `/community/assistance`, `/community/reviewers`, `/community/apply`; a trailing slash is normalized.

Created, duplicate, suppressed, honeypot and address/network-rate-limited requests return the same generic HTTP 202 acknowledgement. This is not a claim that mail was sent, delivered, or that assistance was accepted. A paused launch gate returns 503 without creation. Other malformed input returns 400, oversized input 413, unapproved origin 403.

Token operations accept only the two exact fields:

```json
{"action":"inspect","token":"43-character-opaque-token"}
{"action":"confirm","token":"43-character-opaque-token"}
{"action":"withdraw","token":"43-character-opaque-token"}
```

Inspection returns `ok`, `result: valid`, `state`, `kind`, `service_interest`, `requested_support`, `consent_version`, `can_confirm`, `can_withdraw` and `blocked`. Email, alias, profession, other applications and newsletter choices are not returned. The token authorizes only this application, never a different application or newsletter operation.

Confirm returns `result: confirmed` or `already_confirmed` with `state: awaiting_human_review`. Withdraw returns `result: withdrawn` and `state: withdrawn`, including on repeat. Invalid, suppressed, used or closed tokens cannot activate a request. Expired tokens return 410. There is no edit API; a new application is a separate deliberate request.

## Email and token behavior

Confirmation mail initially links to `https://kapukai-community.vercel.app/community/apply/#app_token=...`, the stable Vercel release host. Switch newly issued links to `https://kapukai.org/community/apply/#app_token=...` only after that exact route is installed and verified; preserve the Vercel route for already issued links. The frontend reads the fragment into memory and removes it immediately from the address bar. Do not put tokens in analytics, logs, query strings, local storage or support screenshots. GET requests do not mutate state; opening an email scanner link does not confirm an application.

Tokens contain 32 random bytes. Only the SHA-256 digest is stored. Confirmation expires in 48 hours; inspection and withdrawal expire in 180 days. Withdrawal applies only to that application and prevents later confirmation. It does not delete the audit record, cancel other applications or unsubscribe newsletters. After expiry, the applicant can request operator help through the published contact route.

The Edge function reuses existing server-only Supabase and Postmark secrets. It sends only a requested transactional confirmation, with no open or link tracking. A provider acceptance is recorded as `accepted`, not recipient delivery. Definite errors become `failed`; uncertain handoff becomes `unknown`. No automatic resends, newsletters, recruitment campaigns or operator notification emails are included. An identical request ID never sends another confirmation.

HMAC fingerprints reuse the existing rate-limit RPC with an application-specific namespace: 40 network attempts/day, 3 address attempts/day. No raw IP is inserted by this module. Forwarding headers are supplemental abuse signals, not trusted identity. This limited launch should be monitored; the control is not a substitute for a future CAPTCHA/WAF if sustained abuse occurs.

## Database and launch

Migration generated with the official Supabase CLI 2.120.0:

`community/backend/supabase/migrations/20261008183145_community_applications.sql`.

Tables: `kapukai_applications`, `kapukai_application_events`, `kapukai_application_config`. All have RLS enabled and no public policies or public table grants. SQL functions are security invoker, fixed empty search path, callable only by service role. The service role can read the gate but cannot change it. Audit events are insert/select only for service role.

The application gate defaults closed independently of newsletter capture. Request and confirmation also check it inside SQL, so a stale HTTP gate check cannot bypass a pause. Inspection and withdrawal remain available during a pause. The migration does not turn on capture.

Deploy the new function with JWT gateway verification disabled because it is deliberately a public request and scoped bearer-token endpoint. Never expose the service key in browser code. Deploy both `index.ts` and `handler.mjs`.

Before enabling: verify the exact static confirmation route on the stable Vercel host used in the email, inspect production ACL/RLS/advisors, and verify closed-gate HTTP behavior. Enable briefly for an owner-controlled real email → explicit confirmation → private queue → withdrawal check; leave the gate open only if that complete flow succeeds, otherwise pause it. The initial capture can use the verified Vercel host while the canonical kapukai.org installation is pending. Do not replace the email destination with kapukai.org until its exact confirmation route has been verified. An authorized database administrator can set:

```sql
update public.kapukai_application_config set enabled=true,updated_at=now() where id=1;
```

Emergency pause uses `enabled=false`. Never drop consent/application tables as a rollback, and do not delete an identity that still has newsletter or application records. An existing global unsubscribe/suppression remains authoritative; operator review is required for an intentional rejoin.

## Human review and operations

The owner reviews applications in the Supabase administrative environment. There is no public admin dashboard. Example private queue query (never expose it through a public RPC):

```sql
select a.id,a.kind,a.service_interest,a.requested_support,a.display_alias,
       a.profession,a.availability,a.confirmed_at,r.email
from public.kapukai_applications a
join public.kapukai_interest_registry r on r.id=a.registry_id
where a.state='awaiting_human_review'
  and r.status not in ('suppressed','unsubscribed')
order by a.confirmed_at;
```

Before replying or allocating support, recheck state and global suppression. Never infer permission to publish an application or share its contact with volunteers. A match requires separate consent. An individual contact or service offer is an owner action, not an automated outcome of this intake.

A retention/deletion job is not included. The owner must review the queue and stale unconfirmed/withdrawn records routinely, honor applicable deletion requests while accounting for shared identity and necessary audit records, and establish a documented retention schedule before scaling. Do not advertise automatic deletion until implemented and verified. Delivery webhook correlation is also not included; Postmark stream suppression still applies, and the module makes no recipient-delivery claims.

## Verification boundary

Isolated PGlite tests exercise SQL, privileges and the HTTP handler together, with synthetic identities and a mocked Postmark adapter. They cover same-identity preservation, no onboarding/newsletter effects, scoped tokens, exact input validation, expiry, withdrawal, idempotency, suppression, RLS/ACL denial, authoritative launch pause, generic responses and uncertain mail handoff. A jsdom integration test loads the built assistance and witness forms, sends their real generated payloads through the HTTP handler and SQL, and uses the real confirmation page for explicit confirmation and withdrawal. It verifies that assistance submits null profession/availability and volunteers submit no requested financial support. The complete existing test suite must also pass. These tests do not prove production delivery, distributed database concurrency, operational moderation, legal enforceability or security of a future social network.
