# Living Architecture v1.1 — resource hub candidate (2026-11-17)
Status: **STAGING / NOT APPROVED FOR PUBLIC DISTRIBUTION**.

Canonical public path (after host-side install and HTTP QA): `https://kapukai.org/living-architecture/`.

## Boundaries
- Source of truth: `Kapukai/kapukai-governance-site`; module owner: `community`; Vercel staging project: `kapukai-community`.
- Actual `kapukai.org` production origin remains 1984/nginx. Vercel is a preview, not a substitute for deploying to this origin.
- Do not modify domain DNS, apex routes, existing `/join/` or member database. Do not invent a new mailing list.
- Use the existing scoped signup (unchecked topic choices and separate confirmation) at `/join/#signup`. Signup and downloading are independent.
- Proposed methodology; no unsupported claim of validated scoring, legal authority, or causation.

## Exact recovered source artifacts (not yet added as Git binaries to this branch)
- `Kapukai_Living_Architecture_v1_1_Carousel.pdf` — seven pages.
- `Kapukai_Living_Architecture_Assessment_v1_1.xlsx` — 15 controls; Assessment, Evidence register, Instructions worksheets.
- `Kapukai_Living_Architecture_Field_Guide_v1_1.pdf` — two pages.
Place these exact bytes at `community/public/living-architecture/files/`; hash compare against recovered originals. Do not regenerate approximations and call them exact.

## Release gates before any link appears in a post
1. Add all three original binary files and verify their SHA-256 digests, names, MIME types, and downloaded byte equality.
2. Page and assets pass Vercel preview HTTP 200/Content-Type and no redirect to login; mobile viewport, keyboard navigation, downloads, and a11y automated + manual tests pass.
3. `/join/` on preview and production: checkboxes unchecked, topics distinct, no posting of data before choice/confirmation; verify a private real double-opt-in end-to-end with explicit test account only.
4. Update `community/deploy.py` allowlist and regenerate `community/release-manifest.json` with digests after adding bytes; run `community/tests` and dry-run destination install with backup and rollback.
5. Restore correct production `robots` behavior and metadata; install only `living-architecture/` assets on existing 1984 host and verify exact branded URLs via HTTP and content digests.
6. Record release commit, preview deployment id, origin installation receipt and UTC readback date. Do not release social CTA until all gates pass.

## Foundational references
- https://www.iso.org/standard/77520.html — ISO 9241-210:2019; current after 2025 review.
- https://www.cdc.gov/evaluation/php/evaluation-framework/index.html — CDC Program Evaluation Framework (2024).
- https://www.nist.gov/itl/ai-risk-management-framework — NIST AI RMF 1.0; only for AI context, revised framework pending.

## Consistency
Preserve `/join/`, existing Workshop, Eagle Eyes, Architecture of Power, Flourish, governance-evolution and government atlas products. This hub introduces no new backend, score, intake or subscription service.

## Metrics and correction
- Daily: page route health, download HTTP success, aggregate resource access counters only if explicitly instrumented.
- Seven-day: inspect referrals, downloads (not people), missing-event diagnostics, click-to-resource funnels, and optional feedback.
- Thirty-day: evaluate use and reproducibility feedback; decisions must be reviewed before changing the instrument.
- Never infer actual remedy, legal accuracy, participation, or a unique person from a click or anonymous request.
