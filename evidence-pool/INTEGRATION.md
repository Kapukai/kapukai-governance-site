# Integration: public evidence route

## Existing host

Copy the complete `public/evidence/` directory to the verified host's web root as `evidence/`. This yields `/evidence/` without changing other routes. Asset references are relative. Do not copy scripts, private research workspaces, unredacted evidence or unpublished records into a public web root.

The current `kapukai.org` deployment target has not been verified. Establish the actual host and deployment source before installing the route. Do not repoint apex DNS to a standalone project: doing so could replace unrelated production routes.

## Standalone Vercel project

Use this package's `vercel.json`, Framework Preset **Other**, and output directory `public`. The configuration redirects `/` and `/evidence` to `/evidence/`. It is intended for a new standalone project; do not overwrite an existing site's root configuration with it. No remote deployment or domain change is included in this package.

## GitHub review

Publish only this sanitized package. A draft pull request in a public repository is public immediately. Do not include confidential records or assume drafts provide privacy. Copy the issue and pull-request templates into the approved repository's root `.github/` directory after checking existing templates. Set `public_repository_url` in the data only after public visibility and issue handling are verified.

## Release

Run `python3 scripts/validate.py`; verify the desktop/mobile view and download links. Record the reviewed commit and artifact hashes in `publication-manifest.json`. The manifest identifies AI-assisted source/provenance review separately from human publication approval. Hashes establish byte identity, not factual accuracy or authority to publish.

Newly authored code and templates are reusable under the scoped `LICENSE.md`. Third-party source materials retain their rights.
