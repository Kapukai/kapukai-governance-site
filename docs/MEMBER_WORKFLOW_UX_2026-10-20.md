# Member workflow handoff repair — October 20, 2026

The member entry point now presents one selected path: request access, existing-account sign-in, or invited signup. The sign-in bookmark opens sign-in directly. A joining guide explains the sequence. Request status offers an explicit read-only refresh, state-specific next steps, and help. Expired and temporarily unavailable confirmation states no longer ask for an unavailable action. Approval gives the operator a focused recipient-specific copy-and-share card and explains that no invitation email was sent. Invitation tokens and email verification codes are distinguished.

Functional release: `a699b9f2653e0944d0e734213b2b3d7246e79cf7`, Vercel `dpl_3F3NMxXSNvLAEfyKtKJRUqPThkgw` (READY, production). The live public sign-in view and switching to request access were inspected in the browser. Both show the joining guide and distinct fields. No live request, Auth account, invitation, operator grant, or mail was created by these checks.

Validation: 39 local tests passed, including the actual generated HTML/JS through Edge handlers and SQL for request → explicit confirmation → operator approval → invited account creation. Test Auth/mail are controlled substitutes; this does not establish a real recipient completing signup. Existing role, consent, fragment-scrubbing, page-exit clearing, and memory-only session boundaries remain.

A live read confirmed an existing real request is approved with an invitation, but the recipient has no Auth account yet. Identity and request IDs are intentionally omitted. The remaining real-world handoff is the operator sharing the private link, followed by the recipient choosing a password, verifying their email and accepting membership. We did not recover a raw token, impersonate an operator, or claim this human completion occurred.

A small visual follow-up assigns explicit text types to the three display-name fields so they receive the existing full-width input styles. No schema, backend, mail behavior, role assignments or DNS changes accompany this release.

Limitations: invitations remain shown once. If a link is lost, an operator may create another for the same confirmed email using the existing audited control. A separately issued invitation does not transfer the original access-request association. The canonical kapukai.org member route has not been installed on the separate nginx host.
