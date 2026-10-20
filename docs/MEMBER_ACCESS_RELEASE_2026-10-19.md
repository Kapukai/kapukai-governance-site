# Public member access release

Released October 19, 2026 EDT; live verification at 2026-10-20 02:20 UTC.

Share https://kapukai-community.vercel.app/community/members/ . A new visitor can request access without a password, account or invitation. They confirm their email using a private link and an explicit button, then wait for human review. An authorized operator reviews the request and creates a private invitation link. The operator copies and shares that link deliberately; approval does not automatically send an invitation email. The invited person creates and verifies an account or signs in to an existing account, then accepts membership with explicit consent.

## Verified release

- Commit: `5f9ce40d6eae285f86cd2c1a49905c8a6ae8cf6a`.
- Production deployment: `dpl_Hmvmzg44rvJ6jamvpV9GoEL4WVio`, READY with the production alias assigned.
- Additive database migration: `20261020021729_member_access_requests`. Original member SQL and operator grants unchanged.
- New isolated Edge service: `kapukai-member-access` version 1; bundle SHA256 `575c577cb9e93f00a53f41e1fc75c6c786d3aab54dc2bfbc908a6415da1d8385`. Public requests and operator-authenticated actions have separate checks.
- 74 release tests passed: request storage and access control, mail/rate/error handling, public and operator UI, two full interface integrations and existing Workshop workflows.
- Seven live PostgreSQL assertion groups completed inside one rollback transaction. Final readback: enabled, capacity 25, one operator, zero members, invitations or access requests; zero synthetic Auth, CRM or outbox rows.
- Nine live API boundary probes passed, including service readiness, unauthenticated queue denial, forged token denial, unapproved origin, malformed input, unknown confirmation and honeypot no-write behavior.
- Eight live routes/assets returned 200 and matched the tested file bytes. All 64 static manifest hashes match. The member page retains no-store and noindex, nofollow. Its public request form needs neither password nor invitation; all consent checkboxes start unchecked.
- Independent review found no remaining blocker. Security advisors show no new warning/error; the new private RLS table intentionally has no browser policies. Existing leaked-password protection warning remains unchanged.

## Boundaries and recovery

Requests use isolated private storage and do not create Auth accounts, CRM contacts, subscriptions, membership or publication permission. Only confirmed requests can be approved. Tokens stay in URL fragments, are cleared into memory before API calls, and are not saved in browser storage. Opening links does not confirm, approve or join. Withdrawal revokes an associated unused invitation; it never closes a claimed membership through a request token. Delivery results are recorded and uncertain sends are never automatically retried.

Public signup does not grant operator authority. To use a different operator email, the intended account must be established and separately authorized; this release does not transfer the existing role.

Real inbox receipt and a graphical real-device walkthrough remain unobserved. The full automated flow uses actual page code, Edge handlers and SQL with simulated Auth/email transport. The live readiness probe checks configuration, not delivery to a recipient.

Frontend rollback: `dpl_9aoCp6hkJevbw6VXQjhTUPof1XnV`. The existing pilot pause control blocks new requests, confirmations and approvals while preserving inspection and withdrawal. Keep the additive schema and participant records. This release does not change DNS/mail routing or install new routes on the separate kapukai.org nginx host.

Machine-readable evidence: `docs/releases/member-access-2026-10-20.json`. The shared manifest links this receipt to the functional commit and deployment; a later evidence-only commit preserves the same public bytes.


## Privacy-link usability correction — October 19, 2026 EDT

Commit `e5119c346e2d67abd1dd6db6f459754c35704daa` deployed as `dpl_7SJCuD5z5DEJUYiw2m8WNTC6VEBY`, READY with the production alias. Form privacy notices and form-page footer privacy links open a clearly labeled separate tab so reading the notice leaves the original form open. No cookies or persistent drafts were added. Existing page-exit clearing, authentication and consent behavior remain unchanged.

The 31 member interface checks and 8 Workshop checks passed. Independent review passed; all 64 manifest hashes match. Seven live pages returned 200 and matched the exact built bytes, with 15 privacy links using the new behavior. The member and operator routes retain no-store and noindex, nofollow.

A real request for the user-designated address was observed with an accepted provider receipt, then email confirmation and state `awaiting_review`. The recipient, request identifier, provider identifier and private token are omitted. No duplicate test mail was sent. Inbox-folder placement was not observed. Operator approval and private invitation issuance remain pending human review. This observation updates the earlier real-recipient confirmation limitation without claiming a graphical browser walkthrough.
