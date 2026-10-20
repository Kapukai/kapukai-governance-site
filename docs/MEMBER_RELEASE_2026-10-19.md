# Workshop member pilot release

Release target: the existing `kapukai-community` Vercel project, from the existing public governance-site repository. The source baseline is `8da5a8753ab588bd63cd73caac082f3707fd46af`. This is an additive invitation-only pilot. No existing member, subscriber or application is silently enrolled.

## Workforce and ownership

- Release integrator: existing source, navigation, privacy notice, production configuration and deployment evidence.
- Member backend engineer: private transactional schema, authorization, consent states and database tests.
- Interface engineer: accessible member workspace, operator controls, public projection and DOM workflow tests.
- API engineer: verified identity boundary, bounded requests, private service calls and requested verification delivery.
- Independent reviewer: adversarial security review and rollback-only live acceptance queries.

## Implemented journeys

- Personal email-bound invitation → account verification → explicit membership acceptance. Existing accounts can sign in and accept an invitation. No invitation or test email is sent as part of this build.
- Profile and interest pools → bilateral opt-in discovery → introduction request → recipient acceptance. Email addresses are not shared through introductions.
- Explicit room membership → discussion → report, deletion, blocking and human moderation. Rooms are Welcome & connections, Tools & feedback, and Learning circle.
- Minimal review request → qualified-scope candidate → requester proposal → reviewer conflict declaration and acceptance. Private case files are outside this pilot.
- Private appointment offer → participant acceptance → overlap check → cancellation. Public First Circle classes retain their existing calendar.
- Private feedback → human-proposed excerpt → author approval of exact version → explicit human publication. Editing or withdrawing consent removes public release.
- Credential claim → human source check and limited scope → separate member publication choice. Claims do not confer court authority or guarantee competence.
- Own-data export and membership closure, with separate account/subscription choices preserved.

## Release gates

The data schema starts disabled. Anonymous and ordinary authenticated database roles receive no direct member-table or privileged RPC access. The Edge service verifies identity; the database independently validates the live verified session, membership and operator authority. Public outputs are whitelisted twice. Privileged roles never come from user-editable metadata.

No production replacement of existing auth, signup, application, CRM, email-worker or learning services is included. New member account creation uses the existing Postmark sender only in response to an explicit invited signup. The existing auth-to-CRM integration can mirror basic account facts; member discussions and records have no CRM export.

## Verification evidence

Status on 20 October 2026: implementation complete and tested; production activation is blocked by the database connector. Production frontend remains at the baseline deployment. No account was enrolled, invitation created or email sent.

- Frozen backend suite: **146 passed, 0 failed** (`node --test backend/tests/*.test.mjs`).
- Existing Workshop interface/link/accessibility suite: **8 passed, 0 failed** (`node --test tests/workshop-ui.test.mjs`).
- Includes the built member interface connected to the real Edge handler and actual SQL in PGlite, plus adversarial authorization, consent, publication, closure, calendar, export and invitation tests.
- Independent security review: no known blocking code finding. See `MEMBER_SECURITY_REVIEW.md`.
- Static rebuild and release manifest generated successfully; `git diff --check` clean.
- Security advisor comparison: no new warnings/errors. The new private tables intentionally have RLS with no browser policies; the project-wide disabled leaked-password check was pre-existing and was not changed. Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- New `kapukai-members` Edge function deployed successfully, version 1, bundle SHA256 `7ea8b95aa57a063d7519d06be8068c1da9fba9b3e78a69d11eae600a88497275`.
- Live HTTP checks: configuration 200 with only public configuration; unauthenticated private state 401; unapproved origin 403; all responses `no-store`.
- The original whole migration twice failed with connector `INVALID_ARGUMENT / invalid_request_state: Invalid or expired requestState`. Readback confirmed no schema after those attempts. A reviewed seven-stage partition was prepared and verified locally equivalent to the original final schema and permissions.
- Stage 1 (`member_tables_locked`) applied. Stage 2 (`member_private_helpers`) returned the same connector error. Readback: disabled, capacity 25, zero members/operators/invitations, zero private functions/public RPCs, and zero member tables lacking RLS. No retry is safe without checking migration history and catalog first.
- Remaining stages 2–7, rollback-only live acceptance, verified operator bootstrap, frontend production release and pilot activation are **not completed**. Do not claim a working live member system from the API's configuration endpoint alone.
- The original SQL is the complete fresh-install source; use `community/backend/recovery/member-community-2026-10-20/README.md` for this partially installed project. Graphical browser automation is unavailable in this environment; DOM workflow tests do not establish visual acceptance on real devices. No email is sent to a real participant during automated verification. Live email receipt and real-user acceptance are separate pilot observations.

## Rollback

1. Pause the member pilot using its operator control or set only `kapukai_members.config.enabled=false` through an authorized database operation. Withdraw/export/close remain available under their own access rules.
2. Restore the previous Vercel production deployment `dpl_7zWjfY73fLDowDR8xSP6wyPVe9fq` if the frontend release needs rollback.
3. Keep the additive schema and audit records; do not drop user data as a deployment rollback.
4. Existing confirmation links, email subscriptions and application workflows are unchanged.

The existing nginx host at kapukai.org is a separate publication destination. Vercel access is not authority or access to that host; this release makes no DNS or email-routing change.
