# People in the Circuit

Public informational module for the intended branded route `https://kapukai.org/circuit/`.

## Design and scope

Preserves Christine's selected ivory/navy/gold prototype, two-column introduction,
communication diagram, five pathways and four component cards. It integrates the
approved interoperability message and an accessible whole-person/family/community/
society flourishing figure. Flourishing is the intended outcome, not a measured result.

The page has no submission service, account, database, external runtime dependency,
tracking, or private case data. All five pathways are present in HTML. JavaScript
adds a chooser only after its required elements are available. With JavaScript
disabled or unavailable, all pathways remain readable. Print output shows all five.

Selected prototype SHA-256:
`48e0c4860d84e479cdf29eb0563a83c9c5b95b856a1a15fecf1acb2e6d79ea7a`.

## Local preview

From the existing repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/circuit/`. A local server is not public publication.

## Validation

Scoped development tooling is under `tests/circuit`; see that directory's package
scripts and the circuit validation workflow. Historical checks on an older prototype
are not release evidence for this module. Current evidence must identify the exact
source revision and distinguish automated checks from manual review.

## Vercel preview

Use an isolated preview project with this repository's `circuit` directory as its
project root. `vercel.json` builds the three public assets into `dist/circuit/` so
the preview serves the intended `/circuit/` path. Project `rootDirectory` is a Vercel
project setting, not a vercel.json property. Do not change the community project's
root or output to host this separate module.

## Branded publication

Follow root `AGENTS.md`: verify the exact Vercel release, then install the same
three assets on the existing 1984 nginx host. Preserve unrelated routes and mail
DNS. The module does not need a domain migration, database or nginx reload.
`ops/circuit` contains the bounded publication helper and artifact hashes.

Publication is complete only after the exact branded page, CSS, JavaScript and
primary interactions have been checked. Vercel response headers are configured
in this module; nginx response headers are a separate host configuration. The
document also supplies its own applicable content security policy and referrer policy.

## Sources and current route choices

- Federal branch overview: https://www.usa.gov/branches-of-government
- ACA: https://kapukai.org/standards/authority-circuit/
- Standards directory: https://kapukai.org/standards/
- Eagle Eyes: https://kapukai.org/eagle-eyes/
- Bills and proposals: https://kapukai.org/bills/

These Kapukai destinations returned HTTP 200 on November 20, 2026. At that check,
`/atlas/` returned 410 and `/legislation/` returned 404. The Atlas card therefore
identifies the directory as being revised and links to the available standards.
Recheck destinations as part of each release.
