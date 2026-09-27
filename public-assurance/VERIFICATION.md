# Verification checkpoint — 27 September 2026

Passed against deployed Supabase Edge Function v1:
- Missing gateway authorization rejected (401).
- Disallowed browser origin rejected (403).
- Missing consent, invalid topics and invalid confirmation token rejected (400).
- Synthetic request saved as pending; email transport skipped for `.invalid` test address.
- Database query verified selected topics, pending state and request event.
- Confirmation activated the synthetic request; repeat confirmation was idempotent.
- Withdrawal changed status to unsubscribed and recorded requested → confirmed → unsubscribed events.
- Both new tables have RLS enabled and deny anon/authenticated direct access.
- Local links, anchors, ten downloads, unchecked topic defaults and Vercel JSON checked.
- Frontend JavaScript syntax checked with Node.

The synthetic request was removed after verification. No real person was subscribed and no test email was sent.

Browser rendering was attempted but blocked: agent-browser could not start, and browser downloads failed certificate/archive validation. No visual pass is claimed.

Remaining release checks: browser rendering and complete browser submission, Vercel deployment, kapukai.org path routing, then canonical confirmation-link and real owner-approved inbox delivery testing. The email service has existing successful delivery records; this feature's live email delivery has not yet been exercised.

Supabase advisor INFO entries for RLS-without-policies are intentional for these server-only tables. Existing project-wide warnings (not introduced here): authenticated execution of `kapukai_current_principal`, and disabled leaked-password protection. This feature does not use password login or that principal function.

References for the pre-existing warnings:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
