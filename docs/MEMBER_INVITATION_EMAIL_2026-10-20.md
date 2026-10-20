# Member invitation email release — October 20, 2026

Status: backend and frontend deployed and verified. This note does not establish real inbox delivery. The operator must explicitly send each invitation.

## What was broken

Approving an access request or creating an invitation produced a private link for the operator, but did not email that link to the invited person. The invitation existed, while the recipient had no next step unless the operator copied and shared it separately. The interface did not make that handoff clear enough.

The correction adds a verified email preview, a separate explicit **Send invitation email** action, recorded handoff status and a way to use an invitation already created. Approval and invitation creation still do not send email or create an account.

Start at [the member workspace](https://kapukai-community.vercel.app/community/members/). The public request form needs no account, password or invitation code. Only a separately authorized operator sees **Pilot operations** after signing in.

## Operator workflow

1. Sign in with an authorized operator account and open **Pilot operations**.
2. Review a confirmed access request and approve it, or deliberately create an invitation for the intended email address.
3. The **Next: send this invitation** card shows the private link. Save the link privately if you may need it after leaving the page; it is not retained in browser storage.
4. Choose **Preview invitation email**. The service verifies the invitation, intended recipient, expiry and existing email status. This check sends nothing.
5. Review the recipient, message summary and expiry, then choose **Send invitation email** once.
6. Read the resulting status. A provider acceptance means the email service accepted the handoff; it does not prove inbox receipt. Ask the recipient to check inbox and spam and follow **Set up your member account**.

**Copy invitation link** remains available for deliberate direct sharing. Copying only copies the link; the operator must send it to its intended recipient. Sharing the same valid link does not require another access request.

### Invitation already created

Use **Email an invitation you already created** in Pilot operations. Enter the exact invited email address and the saved **Private invitation code or link**, then choose **Check invitation and preview email**. This verifies the existing invitation without creating a replacement, approving again or sending anything. Review the preview and use **Send invitation email** if no send is recorded.

The saved value may be the original code or its full private member link. Unrelated URLs are rejected. The server checks that the supplied email belongs to that invitation, rather than trusting the entered address.

Raw invitation codes cannot be recovered from the server because only their hashes are stored. If a link is lost or has expired, the operator may deliberately create a new invitation for the same email, then preview and send it. An earlier unused invitation should be revoked only if its reference can be identified. The recent-invitations list does not identify recipients. Do not create a replacement merely to work around an uncertain email handoff; first check the recorded status and ask the recipient whether it arrived.

### Email status and safe recovery

| Status | Meaning | Next action |
| --- | --- | --- |
| No send recorded | No email handoff is recorded for this invitation. | Review the preview and explicitly send. |
| Accepted | The provider accepted the email. Inbox delivery is unconfirmed. | Ask the recipient to check inbox and spam; share the same valid link directly if needed. |
| Failed | A definite provider rejection was recorded. | **Retry invitation email** is available as a separate explicit action, subject to limits. |
| Pending | The handoff was claimed but a final receipt has not been recorded. | Use **Check email status** and check with the recipient. No resend is offered. |
| Unknown | The outcome is uncertain; an email may already have been sent. | Use **Check email status** and check with the recipient. No automatic retry occurs. |

Checking status never sends mail. If a browser request failed before any send was recorded, an explicit status check can establish that there is no handoff; only then is sending offered again. A pending or uncertain handoff is never made retryable merely by waiting or refreshing.

Status checks currently require an active, unused, unexpired invitation and an enabled pilot. If those conditions change, the interface may no longer expose the earlier delivery status. A failed status check is not evidence that no email was sent.

## Recipient workflow

1. Open the invitation email and choose **Set up your member account**, or open the private link the operator shared. The invitation is filled in automatically. A person given only the code can choose **Have an invitation?** and enter it.
2. Use the same email address the invitation was created for.
3. For a new account, complete account creation and the required acknowledgements. Enter the separate email verification code sent during account setup to finish joining. This verification code is different from the invitation code.
4. For an existing account, sign in and explicitly accept the invitation with the required acknowledgements.

Opening an invitation does not create an account or accept membership. A public access request is also not an account. Newsletter subscriptions, profile discovery, introductions and permission to publish feedback remain separate choices.

## Security and delivery semantics

- Invitation delivery uses the existing authenticated member-access Edge service and a new private delivery ledger. Both delivery RPCs are service-role-only; browser roles cannot call them or read the ledger directly.
- Every preview and send checks a verified live Auth session and current operator authority. An ordinary member, forged or stale session, or revoked operator cannot send invitations.
- The invitation token hash and normalized recipient email hash must match the same existing invitation. Revoked, claimed or expired invitations and a paused pilot cannot be sent. Only one bare recipient address is accepted; header injection and multiple-recipient syntax are rejected.
- The database atomically claims a handoff before the provider is called. Its idempotency identifier is bound to the invitation, operator and recipient hash. Replays and competing requests cannot claim a second handoff for an invitation with a pending, accepted or unknown result.
- Only a recorded definite failure permits a new explicit retry, with a fresh idempotency identifier. The first terminal receipt is retained. Missing or failed receipt writes are treated as uncertain, not as permission to resend.
- Rolling 24-hour limits are three attempts per recipient, 30 per operator and 100 across the pilot; failed attempts count. Creating another invitation for the same recipient does not reset that recipient's limit.
- The ledger stores no raw invitation token or plaintext recipient email. Provider identifiers remain private. Browser responses expose bounded status and expiry, not internal delivery or provider identifiers.
- The email contains a fixed member URL with the invitation in its private fragment. Open and link tracking are disabled. Operator previews, codes and links remain in page memory and are cleared on sign-out or page exit; no persistent invitation drafts were added.
- Sending an invitation does not create membership, reissue an invitation, grant operator authority, subscribe the recipient, publish a profile or publish feedback. No DNS or mail-routing change is part of this correction.

## Local verification

The focused suite covers the actual page code, Edge handlers and PostgreSQL functions. Tests use a local PGlite database and controlled Auth/Postmark substitutes; no real invitation email is sent by these tests.

| Suite | Scope |
| --- | --- |
| `member-invitation-db.test.mjs` | Session and operator boundaries; recipient/token binding; inactive invitations; private table/RPC grants; idempotency and competing claims; retry rules; rate limits; receipt immutability. |
| `member-invitation-edge.test.mjs` | Strict action payloads; authenticated sender configuration; claim-before-send; bound-recipient validation; safe status projection; provider rejection versus ambiguous outcomes; failed receipt persistence; fixed message and tracking settings. |
| `member-invitation-ui.test.mjs` | Separate preview and send; saved-code recovery; unrelated URL rejection; status inspection; explicit failed-send retry; no automatic uncertain resend; ordinary-member denial; secret clearing and late responses after sign-out. |
| `member-invitation-integration.test.mjs` | Operator creation, preview and one explicit email handoff; recipient opening the generated link, creating an account, verifying email and joining; duplicate-send prevention across the application layers. |

Run from `community/backend`:

```sh
node --test tests/member-invitation-db.test.mjs tests/member-invitation-edge.test.mjs tests/member-invitation-ui.test.mjs tests/member-invitation-integration.test.mjs
```

The four focused invitation suites passed all 32 tests. The broader release verification passed 115 tests: 65 database/Edge checks and 50 UI/integration checks. The focused 32 are a subset of that coverage, not an additional 32 release tests. Local tests do not prove production Auth behavior, real Postmark acceptance, inbox placement, or a graphical real-device walkthrough.

## Backend release evidence

- The additive `member_invitation_email_delivery` migration was applied.
- `kapukai-member-access` version 2 is ACTIVE. All three deployed function files match the source files exactly.
- Live database readback confirms RLS on the new ledger. Anonymous, authenticated and service roles have no direct table access; only the service role can execute the delivery RPCs. A null actor is denied.
- Nine read-only production HTTP boundary checks passed: readiness returns 200, missing and forged authentication return 401, invalid payloads return 400, an unapproved origin returns 403, GET returns 405, and query parameters return 400.
- The security advisor reports no new warning. The existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains unchanged.

These checks establish deployed backend readiness and access boundaries. They do not establish an invitation handoff to the real email provider or receipt by a real person.

## Frontend release evidence

- Functional Git commit: `3d8b876646ab7a6687f5812561849b76ccd30730`.
- Machine-readable release receipt: `docs/releases/member-invitation-email-2026-10-20.json`, including the exact Edge bundle digest and asset hashes.
- Vercel deployment: `dpl_AxqwhNkCCm2oco9v5TkUcWfM6zQB`, READY for that commit and assigned to `kapukai-community.vercel.app`.
- Production member HTML and JavaScript fetched at 2026-10-20 06:05 UTC match the tested generated files byte for byte. Member HTML is `no-store` and `noindex, nofollow`.
- Live browser verification confirms the existing-account sign-in entry, updated invitation-email steps, and no operator send controls in the anonymous view. Authenticated operator interactions and recipient completion were exercised locally with controlled Auth/Postmark substitutes.
- Real invitation provider acceptance: not established by this note.
- Recipient inbox receipt and real account completion: not established by this note.

Retain the additive ledger and audit history if the frontend is rolled back. The existing pilot pause blocks new invitation handoffs. Existing public access confirmation and account verification emails remain separate flows. Publication on the separate `kapukai.org` host is outside this deployment unless independently verified.
