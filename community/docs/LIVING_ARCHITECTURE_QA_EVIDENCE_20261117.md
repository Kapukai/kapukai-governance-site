# Living Architecture v1.1 — release QA evidence (2026-11-17)

**Disposition: HOLD.** No production installation, public campaign launch, marketing email, domain mutation, or Publer queue write performed.

## Source and duplicate check
- `Kapukai/kapukai-governance-site` is the canonical public-community source; `community` owns /join/, confirm, newsletter, practice and related pages (see `AGENTS.md`).
- Existing `kapukai-community` GitHub-linked Vercel project provides staging. No new Vercel project, signup backend, member database or email list created.
- `kapukai-flourish`, `kapukai-governance-evolution`, `kapukai-government-body-atlas`, `Eagle Eyes`, `Architecture of Power` and existing public practice flows are complementary, not replaced.
- `kapukai.org` production remains hosted by nginx on the 1984 host, with DNS A=195.246.230.42 and external nameservers. Vercel should not take over the apex.

## HTTP probes and CI observations
Live GET with Vercel Sandbox `sbx_x8K4q77mlxvjnkb2DkSEx7Ysw5OI`:
- `https://kapukai-community-cwycrj137-kapukais-projects.vercel.app/living-architecture/`: HTTP 200; HTML size 11,008 bytes; 15-control phrase present; predecessor commit b0a497a...
- Same preview `/living-architecture/style.css`: HTTP 200 CSS, 5,026 bytes.
- Same preview carousel asset `/living-architecture/files/Kapukai_Living_Architecture_v1_1_Carousel.pdf`: HTTP 404. Consequently all three resource download buttons were replaced with inert text before latest branch preview; **no broken-download buttons should be presented as working**.
- `https://kapukai.org/join/`: HTTP 200, but bytes differ from current GitHub reference (existing independent production drift).
- `https://kapukai.org/living-architecture/`: HTTP 404, nginx/1.22.1. **NOT PUBLIC**.
- Draft PR #32 at https://github.com/Kapukai/kapukai-governance-site/pull/32; GitHub-linked preview auto-deployments marked READY, with per-commit deployment records. READY does not mean end-to-end release passed.

Main branch's 'Verify published Kapukai routes' workflow **already failed independently** on 2026-11-16:
https://github.com/Kapukai/kapukai-governance-site/actions/runs/43915855472
- `/join/` and `/newsletter/` content differs from expected release.
- `/newsletter/archive/`, `/newsletter/archive/2026-11/` missing.
- `/assets/community/app.js` bytes differ.
- `/evidence/decision-failures/` missing (monitor-only).
This pre-existing failure is a *separate* branded website fidelity gate. Do not hide it by merging the new page.

## Binary integrity
The exact three original artifacts were successfully recovered to an isolated working directory. Digests and byte sizes are versioned in `LIVING_ARCHITECTURE_BINARY_ASSETS_v1_1.json`. The original binaries have **not** been placed in GitHub or Vercel yet. This is the current binary-release blocker; production is blocked independently by the 1984 host access requirement.

## Signup
Source form at `community/public/join/index.html` has separate unchecked interests and explicit unchecked confirmation/adult acknowledgement. Signup code requests an email confirmation and activates selected topics after link confirmation. **Live delivery, opt-out and production back-end remain untested in this run**, particularly because production `/assets/community/app.js` differs from repository.

## Accessibility and privacy
Static source reviewed for `lang=en`, viewport, skip-link, labeled navigation, semantic table headers, keyboard focus-visible, responsive CSS, reduced-motion preference, no tracking or embedded signup form. **Not a substitute for mobile browser/screen-reader, contrast, keyboard and live consent QA.**

## Publishing observations
Publishing-agent existing infrastructure uses Publer analytics collector. 2026-11-16 sync:
https://github.com/Kapukai/kapukai-publishing-agent/actions/runs/43978968682
(completed successfully; `446` source post records reported). This is **analytics, not a live queue readback**; no Living Architecture queued or published post verified. The campaign draft and delayed publication plan are in `LIVING_ARCHITECTURE_DISTRIBUTION_v1_1.md`. No network or platform scheduling performed.

## Release decision
Do not merge draft PR or install this page until exact binary upload/hash checks, Vercel direct download MIME and checksums, mobile/accessibility/consent QA, host-level backup and deployment, and final production HTTP readback are all completed. Do not post a `kapukai.org/living-architecture/` CTA while production returns 404.

## Learning
T+7: verify 200/asset availability and source-specific exposure, observable downloads, actual consent confirmations, feedback, accessibility defects, correction tickets; unknown is never zero.
T+30: compare content consumption with voluntary tool use and documented, reproducible feedback; keep downloads, subscriber counts, engagement, and actual institutional remedy conceptually separate. Review human outcome and correction loop without profiling individuals.


## Final branch preview smoke test (later on 2026-11-17)
Verified Vercel deployment `dpl_G6Php6WqAor1zqr4LregsmZmv5dS`, commit `a13986b59694337a68a01aa1769df2b87726b766`:
- `https://kapukai-community-qgavojyp8-kapukais-projects.vercel.app/living-architecture/` HTTP 200, 11,028 bytes HTML.
- `.../living-architecture/style.css` HTTP 200, 5,198 bytes CSS.
- Intended carousel binary path HTTP 404, correctly gated with 3 inert download placeholders and **zero active download links**.
- Static code checks: all 15 control IDs present, optional join link present, noindex, language, skip link, responsive CSS and reduced-motion support present.
- Production `https://kapukai.org/living-architecture/` still HTTP 404.
- No Chromium or Playwright browser available in this QA sandbox; therefore no actual mobile-browser or assistive-technology certification completed.
- Smoke sandbox stopped after probe to avoid ongoing charges.

This static smoke gate **passes**, but binary, real-browser, actual consent, legacy production drift and 1984-origin install gates remain **HOLD**.
