# Member pilot security review

Review date: 19 October 2026. Scope: `community/backend/sql/member_community.sql`, `kapukai-members` Edge function, `community/assets/members.js`, generated member/public pages, and Vercel response headers. This is an independent code and acceptance review for the small invitation-only pilot, not a penetration-test certification.

**Code disposition: no known blocking security finding remains in the reviewed pilot implementation.** Production deployment, live database acceptance and the release decision belong to the release integrator. Real email receipt and a real invited user's browser journey must not be described as verified by mock-provider tests or SQL fixtures.

## Findings corrected before release

| Finding | Correction inspected |
| --- | --- |
| A command could check authorization before waiting for the global write lock, then proceed after another command closed or suspended access. | The transaction lock now precedes live session, operator, membership and configuration reads. All member commands use the same lock. |
| Database session checks originally lacked the Edge's absolute 30-minute session-age limit. | SQL now checks session age, expiry, user role, anonymous status, email confirmation, ban and deletion. |
| Discovery combined an any-scope eligibility flag with all self-selected review scopes, allowing the interface to label unsupported scopes as checked. | Discovery now projects only scopes that pass current credential and participation predicates. Assignment creation and acceptance independently enforce the requested scope. |
| Unbounded public arrays could exceed the Edge's 100-item projection limit and stop the public page from loading. | Public and workspace collections are bounded. Own-data export has explicit pagination and includes additional owned record types. |
| Changing attribution could change already approved public content without new consent. | Display-name changes withdraw feedback publication consent and credential publication consent. |
| Reviewer eligibility could be revoked while related appointment offers remained active. | Relationship cleanup cancels appointment coordination when its only valid relationship has ended. |

## Access and consent assessment

- **Identity and invitation:** Auth verifies bearer tokens before claims are used. Only verified, nonanonymous, active identities with current live sessions may enter member commands. User metadata and email addresses never grant operator authority. Invitations are random, hashed, expire, are single-use and bind to the authenticated email. An application or newsletter signup grants no membership.
- **Database boundary:** All member tables reside in a private schema with RLS enabled. `anon`, `authenticated` and `service_role` have no direct table or private-helper access. The narrow public RPCs are explicitly revoked from browser roles and callable only by the service. Their definer context is intentional: each command checks the supplied identity/session against current Auth tables before applying member predicates. Search paths are fixed and object references qualified.
- **API boundary:** Exact action schemas reject identity overrides and unknown fields. The Edge accepts only exact approved origins; CORS is supplemental and never substitutes for authentication. Requests and provider responses have byte bounds, timeouts, no redirects and safe error responses. Private responses use `no-store`.
- **Discussion and discovery:** Discovery requires both active members to opt in and share an interest. Room membership is explicit. A room member cannot delete another author's post. Reports are exposed only to authorized moderation; blocking is symmetric for discovery and shared activity.
- **Review work and calendar:** Requests remain private to their owner and the eligible proposed/accepted reviewer. Owners propose; reviewers explicitly accept and affirm their conflict check. Revoked credentials, closed requests, blocks and closed/suspended memberships remove access and active relationships. Appointment details are participant-scoped; acceptance checks overlap for both people under the serialized command boundary.
- **Public publication:** Private feedback is separated from its proposed public excerpt. The author approves an exact version and an operator separately publishes that version. Editing, withdrawal, attribution change and account closure remove publication. Credential claims require a human source decision, bounded scopes and a separate publication choice. Public fields are whitelisted in both SQL and the Edge.
- **Signup delivery:** A valid invitation and durable request quota are required before Auth account/link generation. Passwords are kept in request memory and sent only to Auth. The generated verification code is validated as numeric before entering the fixed email template. No password, invitation, action link or token hash enters email or client replies. Tracking is disabled. Provider uncertainty is reported without automatic retry. Account-exists and ineligible responses do not expose account registration status.
- **Browser privacy:** Member-controlled strings use text nodes, not HTML injection. External credential links are HTTPS with `noopener noreferrer`. Auth tokens, pending invitation data and drafts are volatile and cleared on signout/page exit. Generated pages and deployment headers prevent framing; the member route is `noindex` and `no-store`; referrers are suppressed. No external analytics or third-party script was added.
- **Closure:** Membership closure withdraws visibility and active participation. It deliberately preserves separate Auth/subscription records and bounded audit/moderation history. The interface explains this distinction and offers own-data export. It does not falsely promise complete account erasure.

## Verification performed by this reviewer

1. Independently inspected the SQL, Edge, frontend and header boundaries listed above.
2. Ran `node --test tests/member-db.test.mjs tests/member-edge.test.mjs`: **35 passed, 0 failed** at review time. Additional tests added later are recorded in the release record.
3. Authored `community/backend/tests/member-live-acceptance.sql` and ran it locally against the actual migration in PGlite: passed. It performs eleven groups of assertions inside one `BEGIN` / `DO` / `ROLLBACK` transaction: schema ACL/RLS and direct role denials; missing/foreign/expired/old/unverified sessions; bound one-use invitations; mutual discovery; room isolation; review eligibility and conflict acceptance; introduction/calendar isolation and overlap; exact-version publication consent; credential downgrade; closure visibility and export.
4. The live script uses newly generated identifiers and reserved `example.invalid` emails, no passwords and no network/API calls. The integrator inspected live Auth columns and triggers before live use. The users trigger was reported to write transactional CRM records only and reject synthetic email; sessions had no noninternal trigger. Execution and rollback evidence belong in `MEMBER_RELEASE_2026-10-19.md`.

## Limits and operation

- This review does not prove email inbox receipt, provider availability, human credential-review quality, legal status, visual acceptance on real devices or unrestricted-scale security.
- The command lock intentionally favors clear ordering for a maximum 30-member pilot. Sequential overlap tests and lock placement inspection do not constitute a distributed load test.
- After an uncertain signup handoff, the member should check their inbox and use the published help route. The implementation intentionally avoids automatic resend or guessed recovery actions.
- Older workspace collections may require own-data export or operator assistance; the pilot presents a bounded recent view. Export is paginated.
- Existing project-wide Auth/CRM behavior is outside this additive module. No existing user, subscriber or application was silently enrolled by these changes.

## Documentation checked

The Supabase skill, current changelog and current Auth generation documentation were consulted. The relevant changelog entries concern explicit API grants, PostgreSQL extensions not used by this module, and old TLS ciphers; no additional module change was indicated. Raw Auth response fields for generated OTPs were checked against the provider's public source.

- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://github.com/supabase/auth/blob/master/internal/api/mail.go
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
- https://supabase.com/changelog/cbc-tls-ciphers-deprecated
