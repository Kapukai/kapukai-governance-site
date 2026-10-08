# Community verification — 8 October 2026

## Scope and result

An independent review tested the existing interactive Workshop concept and the existing scoped email signup implementation. The concept uses fictional fixtures and local state. It does not implement accounts, server authorization, protected member data, persistence, enrollment, introduction delivery, or a live community.

Three reproducible usability/accessibility problems were found in the concept, corrected, and retested. Current results:

| Verification layer | Result | What it establishes |
| --- | --- | --- |
| Existing source-derived concept logic checks | 18 passed | Filtering, reciprocal discovery logic, permission-state examples, text escaping, no API/persistence calls |
| Independent concept DOM interaction checks | 11 passed | Actual render/event-handler behavior, controls, local state transitions, focus recovery, and empty-state recovery |
| Existing signup tests, independently rerun | 19 passed | 17 SQL/HTTP/validation checks and 2 DOM form/confirmation checks, using isolated PGlite SQL and mocked email |

These results do not constitute browser layout acceptance, a security audit of a deployed member system, or current inbox-delivery verification.

## Defects found and corrected

1. **Incomplete ARIA tabs behavior.** The original custom tablist left all four tabs in the sequential keyboard order. The inline concept now uses a labeled group of native view buttons with `aria-pressed`. Native tab order is preserved without adding `tabindex`; the content region has a visible heading as its accessible label.
2. **Keyboard focus lost after visibility changes.** Replacing the rendered content removed the focused discovery checkbox. Rendering now restores the corresponding native control; when a membership action removes a control, focus moves to an appropriate remaining control.
3. **Class empty state offered ineffective recovery.** Selecting “Self paced” and “In person” produced no classes, but the offered action cleared only jurisdiction/institution. A separate “Clear class filters” action now resets delivery mode and learning format. Interests and room membership remain unchanged.

The first independent DOM run produced 8 passes and these 3 failures. After the corrections, all 11 checks passed. The earlier 18 logic checks were rerun and remained green.

## Concept behavior exercised through DOM events

- Initial conversations and zero-discovery People view.
- Interest checkbox changes do not join a room or opt the member into discovery.
- A join request remains pending and provides no conversation access.
- Discoverability requires mutual room eligibility and opt-in.
- Leaving a room immediately removes that room's example conversations and discovery relationship.
- Overlap filters preserve the source conversation's single audience.
- Empty results broaden only after an explicit action.
- Jurisdiction and institution filters compose and reset visibly.
- Reply and feedback previews render executable-looking input as literal text and make no network request.
- Delivery mode and learning format remain independent, with homework inside the selected class.
- Native view controls expose pressed state and preserve focus.
- Clearing every interest produces no visible posts, profiles, or classes.
- A visibility checkbox retains keyboard focus after its state changes.
- Class-filter recovery actually restores matching example classes.

No real browser was used in this run. jsdom exercises DOM/event behavior but does not perform layout, native keyboard traversal, touch, or screen-reader testing.

## Signup verification and boundaries

The existing public source was read at commit `a16c909f110eddf3c1fb720bbf792402fd045917`. Tests ran from an isolated copy; the original repository and production were not changed by this QA pass.

The suite checks same-registry identity reuse; preservation of legacy subscriptions/onboarding; explicit confirmation; exact topic scopes; token hashing, expiration, replay and management lifetime; idempotent requests; old confirmation links; out-of-order confirmation; opt-out precedence; global suppression; anonymous role denial and service-role operation; strict origin/body validation; no activation through GET; a closed capture gate; and uncertain email results without automatic resend.

The two signup DOM tests check explicit selected interests, stable retry IDs, visible error recovery, confirmation-page inspection without activation, deliberate confirmation, and withdrawal. The SQL tests use PGlite, and the mail adapter is mocked. They do not execute the deployed Deno entrypoint, a real Postmark transaction, concurrent PostgreSQL connections, or current production DNS/CDN routing.

The current signup supports five email-interest scopes: tester invitations, Remedy Brief, volunteer opportunities, free classes/webinars, and collaboration/connection. An email-interest signup is not an assistance application, reviewer qualification, room membership, user account, class reservation, or public-profile consent.

The repository's `community/README.md` records earlier owner-authorized production checks: Gmail inbox delivery, token confirmation and withdrawal, plus Postmark acceptance of a test to `architect@kapukai.org` whose inbox was not accessible. This QA pass read that historical record; it did not independently repeat live delivery or inspect the private inbox evidence. Provider acceptance must not be described as inbox delivery.

## Release gates still requiring evidence

- Graphical browser checks at desktop and mobile widths, visible keyboard focus, screen-reader labels/announcements, and touch interaction.
- Exact deployed signup route/asset verification and a controlled owner-authorized confirmation/withdrawal check after relevant delivery or routing changes.
- Working canonical `kapukai.org` paths before presenting them as live. Preserve existing private confirmation URL fragments during any migration.
- Server-side accounts, membership/consent enforcement, per-record authorization, leaving/revocation, and unauthorized-access tests before accepting real community data.
- Human moderation, abuse reporting, retention/deletion, backup/recovery, capacity limits, and operational ownership before opening member content.
- Genuine enrollment/scheduling, assistance applications, and reviewer onboarding before claiming those services are active.

Fictional hidden records are present in the concept's client source. That is acceptable for clearly labeled example data; it must never be the design for protecting real member records. Production authorization must prevent unauthorized data from reaching the client at all.

## Reproduction notes

Concept checks executed:

```sh
node /workspace/scratch/kapukai-community-logic-test.cjs
node --test /workspace/scratch/qa-community-audit/prototype-dom.test.cjs
```

Signup checks executed from the isolated copy:

```sh
cd /workspace/scratch/qa-community-audit/current-community/backend
npm test
```

The independent DOM test uses the already installed jsdom package from the earlier signup workspace. It does not install dependencies, open a browser, submit a live form, or send email.

SHA-256 of the corrected concept:
`45e3a45473d9166fa207ae2481e1f56e5e5426b8fd48fcf969109039b7a253bf`

SHA-256 of the independent DOM regression test:
`666219f24d5420e8f44ca4951429305d149fb6d563d95b88d4bdb967955aa677`

The inline concept remains conversation-only content. New approved public page work and its deployment evidence are outside this initial test result and must be recorded separately after verification.

## Follow-up: scoped static installer

The current 26-file release manifest and `community/deploy.py` were exercised in disposable fake web roots. **All 10 installer checks pass** after correcting one concrete defect found by this review.

The checks establish that:

- A plan does not write files; a fresh install verifies all 26 release hashes and preserves an existing homepage and unrelated application files.
- An unreviewed conflicting module file stops the entire install before any release file or backup is written.
- An explicit reviewed `--replace-existing` operation preserves the exact previous bytes in its backup and records created/replaced paths.
- A modified source hash, parent traversal, absolute manifest path, unowned module prefix, direct source symlink, or destination symlink escaping the web root is rejected.
- A planted temporary-file symlink cannot redirect a release write outside the web root.

The first run exposed a predictable `.kapukai-new` temporary filename: `shutil.copyfile` followed a preexisting symlink and overwrote an outside sentinel in the disposable fixture. The installer was corrected to use an exclusively created, unpredictable temporary file in the target directory, write through its open descriptor, flush/fsync, atomically replace the destination, and clean up the temporary file. The independent suite then passed all 10 checks. No live web root was accessed or changed by these tests.

Executed regression command:

```sh
python3 /workspace/scratch/qa-community-audit/deploy_test.py
```

Corrected installer SHA-256:
`e1798099fd7e7f064ab4efa12ba88336bbb51a51ef823e8af22c571f3d6bcea9`

Tested 26-file manifest SHA-256:
`a496e7ab2dab31882ac83ab842fc2d4c69f4e82bbe8a70ed9e651f4369053274`

These are local installer tests, not evidence that the existing kapukai.org host has received the release. Installation still requires access to the correct host, conflict review, a backup, and verification of the installed public routes.

## Follow-up: application backend deployment status

The deployment agent reported that migration `20261008183145_community_applications.sql` and the new `kapukai-community-apply` function version 1 were deployed with the application gate **closed**. The agent's live checks reported denial of anonymous/authenticated read grants. The Supabase advisor's informational “RLS enabled, no policy” finding is deliberate for these tables: client roles have no direct grants or permissive row policies. The preexisting leaked-password protection warning remains relevant before any future account-authentication launch.

The independent QA agent read the new migration and function source. That focused review found explicit service-role-only RPC grants, security-invoker functions, HTTP plus SQL gate checks, fixed application fields, token confirmation into `awaiting_human_review`, and withdrawal remaining available while paused. It did not independently query the deployed service or send an application email. The application implementation agent's own SQL/HTTP/DOM results must be kept distinct from the 19 older signup checks independently rerun above.

The closed gate is a launch boundary: a deployed function does not mean the public can successfully apply. Confirmation requests human review; it does not approve free assistance, reviewer status, witness qualification, membership, or credentials. Existing global email suppression is preserved; a person blocked by suppression needs a contact alternative rather than an automatic override.
