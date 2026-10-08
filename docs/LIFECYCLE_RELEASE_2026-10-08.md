# Workshop lifecycle release — 8 October 2026

## Scope

Private assistance/contribution applications now have structured human review, clarification, waitlisting, bounded free resource offers, applicant responses, delivery versions, private factual feedback, correction, reconsideration and closure. The owner console reuses existing identity, requires a fresh session and a separate narrow Workshop grant. Notifications require an explicit preview and send; no automated campaign was sent.

## Verification

- The final combined backend, generated DOM, actual SQL and identity/mail-adapter suite passed 86 tests, with no failures. An additional focused delivery-version regression passed afterward; see the independent QA report.
- Ten installer tests and eight existing Workshop checks passed. The release manifest contains 29 module files.
- Live additive lifecycle and maintenance migrations applied successfully. Seven new tables have RLS and no public access. The service role cannot enable the lifecycle gate or amend the append-only audit.
- `kapukai-workshop-ops` version 1 and `kapukai-community-apply` version 2 deployed to the existing Supabase project.
- The live configuration endpoint returned only validated public auth configuration; an unauthenticated queue request returned 401. No owner identity or session was impersonated.
- Exactly one existing, active owner principal was provisioned with the narrow Workshop capability, after checking its established engineering grants and active verified identity. No new account was created.
- One named maintenance job is scheduled every 15 minutes. A live invocation completed with zero due offers and no mail, deletion or publication.
- Supabase advisors show intentional default-deny RLS tables without browser policies. The existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . It was not silently changed during this release.

## Separate marketplace correction

The stale marketplace production is now explicitly an archive. Synthetic ratings, testimonials, historical prices, membership balances and simulated purchasing were removed; real invitation authentication was preserved. Current Workshop/contact links are prominent. Exact source: `Kapukai/kapukai-platform` commit `84d9260903b5c76808c9211c2e6b68d88b0c64df`, deployment `dpl_3bCtg413DHLRXRVY1UnGus5UTa9E`. The source derives from the previous production commit, not the newer unreleased platform branches. Nine marketplace/hosting regressions and the build passed; the stable production page was visually verified.

## Acceptance boundaries

Hosted Workshop verification and release IDs are recorded below when complete. Actual owner sign-in and the first owner-controlled review/offer/delivery journey remain distinct from local synthetic/provider-stub tests. No application update email was sent in this rollout.

The canonical nginx host still needs authenticated installation access. No apex or email DNS was changed. No safe public mailing address was supplied, so no residential or inferred address was published. Paid/private work, qualified reviewer assignments, Adobe signing, public release, federation, trusts and tribunals remain separate gates described in the blueprint.
