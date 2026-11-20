# M00 — People in the Circuit /circuit (proposed)
Status: **implementation candidate; exact release verification required before claiming publication**. 2026-11-20.

## Purpose
Add one compassionate, source-linked strategy overview to the existing Kapukai public site. Preserve /atlas, /standards, /bills and Eagle Eyes as separate bounded capabilities. No new database, user accounts, private case evidence, or autonomous institutional actions.

## Product contract
- Human question: What do you need to communicate, and who can lawfully respond?
- Branch lanes: legislative, executive, judicial. Different mandates; do not merge authority.
- ACA cell: authority, evidence, funding, decision, impact, remedy. An intake receipt is not an adopted finding.
- PDIP (proposed): send -> acknowledge -> review -> authorized response -> execution receipt -> correction/observation.
- Data boundary: public standards and synthetic examples only; no protected child or case data.
- Five lifecycle choices: urgent action, obtain records, challenge, reform, implement.
- Public page: educational, not official or legal advice. Preserve contrary evidence and uncertainty.

## Integration decision
Preferred slug: `/circuit/`. Keep source in this existing repository. Root `AGENTS.md` establishes the publishing boundary: verify the exact release on Vercel, then install the same assets at the branded path on the existing 1984 nginx host. Vercel does not serve the apex site. Preserve existing pages and mail DNS. Use an isolated circuit preview without changing the community project's root/output; its existing preview does not contain `/circuit/`. Record the source commit, deployment, installed asset hashes and branded-route verification.

## Gates
G0 asset/repository inventory and routing owner; G1 content and legal terminology review; G2 accessibility and responsive browser QA; G3 no unauthorized external network calls or private data; G4 link and SEO QA; G5 independent production deploy/rollback plan and verified domain; G6 owner approval to publish.

## Test families
T01–T08: semantics, language, branch boundaries, authority/receipt distinctions, no false government endorsement.
T09–T16: five route selections, keyboard access, screen-reader announcement, focus, contrast.
T17–T24: narrow/wide layout, zoom, reduced motion, touch, link behavior, no JS fallback, printing.
T25–T32: privacy isolation, XSS text handling, no external POST, no credentials, no PII in telemetry, CSP, dependency and supply chain.
T33–T40: source provenance, correction loop, contradictory evidence, unknown authority, stale law, late deadline, external outage, rollback.
Automated static and browser checks are necessary but not sufficient; manual and expert gates remain.

## Long-term milestones
M00 strategy overview -> M01 versioned public decision recipe -> M02 synthetic intake/receipt API -> M03 independent security/authority review -> M04 model legislation -> M05 bounded voluntary pilots -> M06 federation and independent conformance. Each stage requires documented approval, measured results and rollback.

## Do not
Do not modify production DNS, auth, payment, private evidence, or Supabase policies as part of the public overview. Do not imply nationwide deployment, official endorsement, legal authority, or proven outcomes.

## Approved direction for proposed public messaging (2026-11-20)
- Primary public headline: **Government should work together. And work for you.**
- Teaching line: **That's interoperability.**
- Formal proposed technology: **PDIP — Public Decision Integrity Protocol**; ACA remains the authority architecture, Eagle Eyes the application, and Kapukai Atlas the map. Do not rename the established technical components.
- Plain-language definition: Interoperability is the ability of different systems to exchange and meaningfully use information under agreed rules without becoming the same system. Introduce the benefit before the term.
- Proposed hero sequence: headline -> teaching line -> “What are you trying to accomplish?” -> relevant authority pathway -> evidence, receipt, response, correction.
- Human-centered outcome: whole-person, whole-family, whole-community flourishing; describe this as the intended outcome, not a validated result.
- Branches remain independent and bounded by law; communication never creates jurisdiction or authority. Public site is independent and not an official government service.

## Patriotic editorial photographic recipe — proposed hero asset
- Restrained, historically respectful United States red, white, and deep navy. Authentic American flag, real civic architecture and people when appropriate. **Never** imply government sponsorship or use fabricated official seals.
- Visual standard: National Geographic-caliber documentary photographic realism; historic-art editorial composition, authentic physical light and materials, not synthetic-looking CGI, glows, cartoons, overprocessing, or aggressive HDR.
- Capture reference: full-frame high-resolution Nikon camera, high-quality NIKKOR prime lens selected for composition (e.g. 35mm for environmental civic context, 50mm for human-scale scenes, 85mm for intimate portraits); RAW, native base ISO when light permits, carefully controlled aperture/depth of field, highlight preservation, realistic white balance, tripod as appropriate. These are art-direction references, **not** assertions of actual camera EXIF for generated imagery.
- Hero composition: dignified, emotionally resonant American civic scene; flag texture and architecture; preserve clear negative space for typography; test text legibility and accessible contrast on desktop/mobile.
- Generated assets must be labeled as AI-created internally, reviewed for geographic/architectural plausibility, licensing, and representation. Prefer licensed documentary photography for any image presented as an actual historic event.
- An exploratory patriotic eagle/Capitol image was generated in this conversation, **not** committed to this repository, not approved as a factual photograph or production asset.
- Do not use image files in the live website until human art-direction approval and rights/asset review.

## Selected design implementation (2026-11-20)

Christine selected the original People in the Circuit prototype (SHA-256 `48e0c4860d84e479cdf29eb0563a83c9c5b95b856a1a15fecf1acb2e6d79ea7a`) as the visual baseline. Preserve its two-column hero, ivory/navy/gold treatment, full ACA communication map, five need-based pathways and four component cards. Integrate the approved benefit headline and flourishing figure into that design. The earlier simplified branch page is not the chosen visual direction.

The implementation separates HTML, CSS and JavaScript for a restrictive content policy. All pathway explanations remain in HTML; enhancement hides unselected panels only after successful initialization. Keyboard access, mobile navigation, darker text gold, reduced motion and print access are part of the release requirements. Current validation evidence belongs to the exact tested revision, not to historical prototype counts.

`/atlas/` was HTTP 410 and `/legislation/` HTTP 404 on inspection. Use verified destinations and retain the Atlas component's descriptive status until a working directory exists. See `circuit/README.md` and the release evidence for details.

