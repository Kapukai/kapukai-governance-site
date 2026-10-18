# Operations release — October 18, 2026

## Deployed and verified
- Supabase project: tbxfsjipkrdwyctepesf (kapukai-marketplace-pilot).
- Private commitments, dated transition events, operational incidents and incident history.
- Service-only create and transition RPCs with request replay protection, owner/revision checks, and completion evidence requirement. Not a browser management UI.
- Monitor scheduled every five minutes; scheduled execution succeeded at 07:15 UTC.
- Worker heartbeat, credential failures, blocked/overdue sync and overdue commitment detection.
- Sync incidents remain open during retry and require current-generation readback to resolve.
- kapukai-hubspot-sync version 4 deployed with seven allowlisted operational summary properties.
- All seven existing contacts reprocessed and verified at 07:16 UTC; zero open incidents.
- No participation roles inferred or commitments fabricated for existing contacts.
- Eight targeted local tests passed: access control, duplicate incidents, recovery evidence, required completion evidence, revision checks, creation idempotency, CRM allowlisting/readback, HTML escaping.
- Security advisor: new private tables intentionally have RLS with no client policies. Existing unrelated leaked-password-protection warning remains; no auth settings changed.

## Prepared, not connected to dispatch
Six HTML and plain-text templates: engineer, technician, tester, evaluation, follow-up, correction. Existing navy/gold/white K-monogram shell reused. Lotus brand asset still unverified. No new email was sent.

## Remaining implementation
- Expanded public signup purposes and campaign capture.
- Automatic creation of purpose-specific commitments from confirmed signup choices, including withdrawal propagation.
- Operator dashboard and management access, task/deal automation, and visible HubSpot saved views.
- Purpose-specific email preview/send integration and inbox testing.
- Verified lotus asset replacement.
- Canonical public-site deployment requires authenticated access to existing nginx host; Vercel is not the apex host.

No claim that the full end-to-end participation flow is live. Existing public signup forms are unchanged. HubSpot operational fields are server-managed summaries and should not be manually edited; edits would be overwritten by sync. Record new commitments through the protected service RPCs with explicit source evidence.
