# Public Systems Assurance website

Public education and optional contact/preferences. Proposed office; no official adjudication or case intake. Source is in `public/`; no build or package installation required.

## Deploy
Import `Kapukai/kapukai-governance-site` in Vercel, name the project `kapukai-public-assurance`, and set Root Directory to `public-assurance`, Framework to Other, Output Directory to `public`, and no build command. `vercel.json` carries the security headers and path rewrites.

The existing kapukai.org origin is nginx. Preserve the existing website. Its operator must proxy `/public-assurance/` to the new Vercel origin, or install this static directory at that path. DNS alone cannot route a URL path. Do not replace the apex site's DNS to deploy this one page. A subdomain can be added separately, but confirmation links currently use the canonical `/public-assurance/` route.

## Supabase
Project: tbxfsjipkrdwyctepesf. New isolated tables: `assurance_connections`, `assurance_consent_events`. Schema: `schema.sql`. RLS enabled, no anon/authenticated table grants. `assurance-connect` requires a project JWT at the gateway, accepts narrowly validated submissions, rate-limits via the existing service-only signup RPC, and does not return contact records. The frontend uses only the public legacy anon JWT; service-role credentials stay in the Edge runtime.

The public JWT permits calling a PUBLIC signup endpoint. It is not individual authentication. Random email links establish address control before activation. Confirmation tokens are hashed at rest; URL fragments are cleared on load. Confirmation requires an explicit button click. Withdrawal affects all assurance-registry subscriptions for the same email, not unrelated preexisting lists. Every future campaign must recheck confirmed/non-withdrawn status immediately before sending. No campaign sender is activated by this website.

Postmark secrets are inherited from the existing project. Responses distinguish email acceptance from missing/failed delivery. Owner notifications follow confirmation and omit message contents. Contact-only inquiries require email confirmation but do not consent to marketing. Topics are unchecked by default; research/pilot/expert selections are expressions of interest only. No uploads or attachments.

## Operations
Review confirmed entries in Supabase Table Editor; no public admin panel. Honor correction, deletion and all-list withdrawal requests via architect@kapukai.org. Implement a reviewed retention schedule before expanding volume. Use a dedicated engineering reviewer before sensitive case intake. The office itself remains proposed.

Test addresses ending `.invalid` store a synthetic pending request but send no email. Remove only documented synthetic rows after verification. Do not test with third-party inboxes.
