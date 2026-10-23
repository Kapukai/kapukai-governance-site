# Kapukai Evidence & Transparency Pool

A standalone, dependency-free static site at `/evidence/`, published for code and source review in a public draft pull request. Live-site deployment remains pending.

## Open locally

Open `public/evidence/index.html`, or serve the `public` directory with any static HTTP server. Search, filters, case expansion and source navigation work offline using `public-data.js`; HTTP deployments fetch the canonical `public-data.json`.

## Data and downloads

`public/evidence/public-data.json` is the source-linked publication data. Regenerate the matching JavaScript fallback after changing the JSON:

```bash
python3 scripts/sync_public_data.py
```

Only copy materials deliberately cleared for public release to `public/`. The private case-management tree and unredacted originals must never be copied into a web root or GitHub repository. Sources may be cited without redistributing copyrighted source files.

Download entries in the data must point to an existing file in `public/evidence/downloads/`. Atlas entries must point to an existing image. `scripts/validate.py` validates references, publication structure and local file links before release.

## Deployment status

The standalone `/evidence/` package is prepared for review. The current `kapukai.org` deployment target has not been verified. See `INTEGRATION.md` for routing options. The bundled Vercel configuration does not change domain settings or overwrite the live Kapukai homepage.

## Contribution and correction

The website provides a downloadable contribution template until a dedicated public repository and issue workflow are established. Set `public_repository_url` only after verifying the chosen repository, its public visibility and enabled issue templates. Never point the public contribution link to a private repository.

The issue and PR templates in `.github/` are ready to copy into the approved public repository. Public issue content is not confidential intake.

## Reuse

Newly authored code and templates in this subtree are available for reuse under `LICENSE.md`. Third-party records, quoted material and trademarks retain their original rights. Citing a source does not grant redistribution permission over that source.
