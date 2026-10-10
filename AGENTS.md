# Kapukai public publishing

Christine's publishing convention, October 8, 2026:

- Keep public page source in this existing repository.
- Deploy and verify the exact release on Vercel first, then publish it at short paths under `https://kapukai.org`.
- Use kapukai.org links in public calls to action after those paths are live. Vercel URLs are the deployment and review addresses.
- Preserve existing kapukai.org pages and email DNS. Do not point the whole domain at a partial site.
- Keep one release manifest linking the Git commit, Vercel deployment and the files installed on kapukai.org.
- Keep private platform data and credentials out of this public repository.
- The `community` module owns the public article, signup, email confirmation, tester, newsletter and practice pages. The existing `public-assurance` module is separate.
- Existing ChatGPT Sites confirmation links must remain usable until a verified migration preserves their private URL fragments.

## Known production boundary

kapukai.org is currently served by nginx at the existing 1984 host. Vercel access does not grant access to that server. Verify the destination and keep a backup before installing a release. Static publication does not require changing DNS or reloading nginx.

## Approved community implementation, October 8, 2026

- Use the approved Workshop direction: ivory, navy, teal actions, decorative gold, and the shared Tools / Explore / Learn / Participate / About navigation.
- Keep interest filters separate from room membership, profile discovery, and publication consent. A post has one audience even when several interest tags match it.
- The owner approved implementing the prior blueprint and requested repeated verification. New public application capture may support assistance, reviewers and witnesses; only a human can decide assignments or assistance. Applying never grants community access, expert status, or publication permission.
- Keep private case records, financial proof, precise locations, and completed agreements out of this public repository and the initial applications.
- Local concept fixtures and tests do not establish production authentication, privacy, real email delivery, signature validity, or court admissibility. State each feature's actual release status.
- Preserve existing signup purposes, token links and withdrawal behavior when adding applications.
- New federation structures, trusts, tribunals and cross-community information-sharing initiatives remain exploration. Agreement templates are drafts for legal review, not effective terms or authority to request signatures.
- Publish and verify on Vercel first; install the exact tested module on the existing kapukai.org host when authenticated deployment access is available. Do not replace the apex with a partial site or alter mail DNS.

## Workshop lifecycle operations, October 8, 2026

- The Workshop lifecycle uses the existing Supabase principal and a separate, revocable `community:applications:review` capability scoped to `community:workshop`. Ordinary accounts and application tokens do not grant owner authority.
- Keep owner decisions human-confirmed. A decision does not send mail; the fixed notice requires a separate preview and explicit sending action. Never retry an uncertain provider handoff automatically.
- The current offer/delivery loop is for bounded free public resources and practice/orientation. Do not imply paid engagements, private case uploads, qualifications, signatures or appointments are included.
- Preserve correction after closure, reconsideration, withdrawal, capacity release, version-bound feedback and legacy consent boundaries. See `docs/workshop-lifecycle-operations.md`, `docs/LIFECYCLE_OPERATING_BLUEPRINT.md` and `docs/LIFECYCLE_RELEASE_2026-10-08.md` for operating and release evidence.

## Signup CRM lifecycle — owner request, October 10, 2026

- Every signup must also reach HubSpot through the shared Supabase CRM outbox. Add future signup sources and lifecycle changes to the projection, trigger coverage and meaningful integration tests; do not introduce independent page-level CRM writes.
- Supabase remains authoritative for consent, identity and access. A HubSpot contact is a relationship record, never newsletter consent, a qualification or a grant of access. Keep source-specific confirmations, withdrawals and suppressions separate.
- Mirror only approved contact facts and fixed lifecycle states. Private narratives, child/case records, application details, credentials and documents must never enter the CRM projection.
- Use the dedicated `KAPUKAI_HUBSPOT_ACCESS_TOKEN` secret and Vault-authenticated worker. Do not set the older shared HubSpot credential names, which can activate legacy direct-write paths.
- See `docs/signup-crm-blueprint.md` for actual release evidence and remaining activation gates. A deployed but paused worker or passing fixture tests do not establish a live connection.
