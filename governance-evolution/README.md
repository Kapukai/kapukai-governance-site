# The next architecture of governance

Public visual explainer for `https://kapukai.org/vercel-governance-evolution/`.

This is a standalone, buildless static module. The only public route it owns is
`/vercel-governance-evolution/`. It does not replace the existing homepage or
community deployment. The page includes a local illustrative interaction, six
source links, and SVG/PNG downloads. It collects no personal information.

## Publication

1. Keep this module in Kapukai/kapukai-governance-site.
2. Deploy this directory to the Vercel project `kapukai-governance-evolution`
   with `public` as its output directory. Verify the actual deployed files.
3. Install the same release on the existing kapukai.org nginx host:

   ```sh
   python3 install.py --web-root /absolute/path/to/kapukai-web-root
   ```

   This installs only the declared route and checks every file's SHA-256.
   If a different existing version is present, inspect it first and then use
   `--replace-existing` to create a backup and replace it. The script will
   refuse a symlinked destination. It does not change DNS or nginx configuration.

4. Verify `https://kapukai.org/vercel-governance-evolution/` and the assets
   against `release-manifest.json`. Vercel success alone does not establish
   installation at kapukai.org.

## Content boundaries

- Biological membranes are a design analogy, not a law of political evolution.
- The decision demonstration checks only selected example safeguards; it does
  not verify facts or authorize decisions.
- A completed example says **Ready for human review**, never **Approved**.
- Pilots, independent review operations, and funding mechanisms are proposals.
- Human privacy, challenge, correction, and lawful authority remain necessary
  with or without blockchain.

## Verification limits

Static routes, downloads, SVGs, interaction behavior, and live file hashes can be
checked automatically. Full graphical browser QA requires the supported browser
capability. Do not claim screenshot verification if it was unavailable.
