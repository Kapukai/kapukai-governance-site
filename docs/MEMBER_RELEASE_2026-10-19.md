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

Status on 20 October 2026: implementation and database installation complete. All seven migration stages succeeded after the owner renewed approval. Live rollback acceptance passed all 11 assertion groups. The verified existing steward received the separate operator grant; no membership, invitation or consent was created. The frontend is deployed and the invitation-only pilot is enabled with a 25-member cap. No invitations or emails were sent by this release.

- Frozen backend suite: **146 passed, 0 failed** (`node --test backend/tests/*.test.mjs`).
- Existing Workshop interface/link/accessibility suite: **8 passed, 0 failed** (`node --test tests/workshop-ui.test.mjs`).
- Includes the built member interface connected to the real Edge handler and actual SQL in PGlite, plus adversarial authorization, consent, publication, closure, calendar, export and invitation tests.
- Independent security review: no known blocking code finding. See `MEMBER_SECURITY_REVIEW.md`.
- Static rebuild and release manifest generated successfully; `git diff --check` clean.
- Security advisor comparison: no new warnings/errors. The new private tables intentionally have RLS with no browser policies; the project-wide disabled leaked-password check was pre-existing and was not changed. Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- New `kapukai-members` Edge function deployed successfully, version 1, bundle SHA256 `7ea8b95aa57a063d7519d06be8068c1da9fba9b3e78a69d11eae600a88497275`.
- Live HTTP checks: configuration 200 with only public configuration; unauthenticated private state 401; unapproved origin 403; all responses `no-store`.
- The connector initially returned `Invalid or expired requestState`; the disabled checkpoint was preserved. The exact reviewed stage 2 succeeded on the resumed call, followed by stages 3–7. No SQL or permission checks were weakened to obtain success.
- Live PostgreSQL acceptance: **11 assertion groups passed** inside one rollback transaction, covering ACLs/RLS, current verified sessions, invitations, discovery, rooms, reviewer eligibility, calendars, consent-bound publication, credential downgrade, closure and export.
- Rollback readback: zero synthetic Auth users, sessions, CRM accounts and outbox rows; zero member/invitation/operator records before bootstrap; disabled and capacity 25.
- Guarded bootstrap: exactly one currently verified steward identity resolved through existing authoritative grants; one operator created. No member profile, discovery opt-in, room join, invitation or publication consent was created on the owner's behalf.
- Graphical browser automation is unavailable in this environment; DOM workflow tests do not establish visual acceptance on real devices. No email was sent to a real participant during automated verification. Live email receipt and a real invited user's acceptance are separate pilot observations.
- The staged recovery package now records historical checkpoint and completed installation. Do not rerun installation or bootstrap over the completed database.

## Rollback

1. Pause the member pilot using its operator control or set only `kapukai_members.config.enabled=false` through an authorized database operation. Withdraw/export/close remain available under their own access rules.
2. Restore the previous Vercel production deployment `dpl_7zWjfY73fLDowDR8xSP6wyPVe9fq` if the frontend release needs rollback.
3. Keep the additive schema and audit records; do not drop user data as a deployment rollback.
4. Existing confirmation links, email subscriptions and application workflows are unchanged.

The existing nginx host at kapukai.org is a separate publication destination. Vercel access is not authority or access to that host; this release makes no DNS or email-routing change.

## Preserved source and preview

- Tested implementation commit: `3bb8bd30c2159814ec8e086dbe303f5a62039123`, tree `47a7ea5187b20ddcb69324ee64f96b3bd0acbfed`. A later documentation-only commit records this receipt and migration-history detail.
- Branch: `work/member-community-20261019`; release PR: https://github.com/Kapukai/kapukai-governance-site/pull/5 .
- Preview deployment: `dpl_37gSKEEVN34vMoXDKjhH6hF2feKR`, READY, exact implementation commit above, target preview.
- Workspace preview: https://kapukai-community-1sge0n2k8-kapukais-projects.vercel.app/community/members/ . It is a static interface preview; the production API intentionally excludes preview origins. Use the production workspace for member operations after release.
- Live preview HTTP checks returned 200 and byte-identical SHA-256 content for members, voices, member JS/CSS and join routes. Member route returned `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.
- The prior production rollback identifier is `dpl_7zWjfY73fLDowDR8xSP6wyPVe9fq`.

## Production receipt

Verified at 2026-10-20 01:28 UTC (October 19 in America/New_York).

- Production commit: `21d629bcb534d7debdd214c7b114543cc256007d`; deployment `dpl_FXmwfDeuC9v9Hn5gJmUjzzJaA2Wr`, READY, production aliases assigned.
- Live member workspace: https://kapukai-community.vercel.app/community/members/ . Existing verified steward account can sign in and use the Operator controls; operator authority does not require enrolling a member profile.
- Public approved contributions: https://kapukai-community.vercel.app/community/voices/ . Empty is the correct initial state; no testimonial or credential was fabricated or automatically published.
- Final database readback: `enabled=true`, capacity 25, one verified operator, zero members and zero invitations. No synthetic Auth users remain.
- Nine production routes/assets returned HTTP 200 and matched the tested file hashes: members, voices, privacy, status, member JS/CSS, join, confirm and applications. Private member, confirmation and application routes returned `no-store` and `noindex, nofollow`.
- Six live API boundary probes passed. After activation, the public endpoint also returned 200, an empty approved feed, exact production-origin CORS and `no-store`.
- Detailed machine-readable evidence: `docs/releases/member-community-2026-10-20.json`. The shared `community/release-manifest.json` links this evidence to the implementation commit/deployment and all static file hashes.
- The final evidence update is documentation/manifest only. It may produce a later Vercel deployment with identical public files; the identifiers above describe the verified functional release.

Real email receipt, graphical acceptance on real devices and a real member sign-in have not been observed. The release is an invitation-only pilot, with human invitations and publication decisions. The requested Vercel destination is live; no authenticated access to the separate kapukai.org nginx host was available for installing the new member routes there.
