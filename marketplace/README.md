# Kapukai Marketplace public entry

The public share URL is `https://kapukai.org/marketplace/`. This release adds a
single static entry page that immediately opens the existing Marketplace preview
on its established Vercel branch-alias app host. The address bar changes to that host. This is an
entry URL, not a native subpath migration, production checkout launch or new app.
The target alias can serve newer builds later. The manifest separately records
the immutable app build observed during this release; it does not pin the alias
to that build. Preserving the established app origin avoids changing existing
session storage and callback origin assumptions.

The page has a visible fallback link, uses no JavaScript or iframe, and sends no
query parameters, form data or referrer to the app. It changes no account, API,
authentication, database, payment or domain configuration.

## Source and build

The authored page is `community/public/marketplace/index.html`. The existing
`kapukai-community` Vercel project serves the `community/public` directory with
empty build and install commands. Its existing route rules do not intercept
`/marketplace/`. A normal `community/build_community.py` run also preserves this
authored directory. No changes to the community build or its host installer are
needed.

`community/public/marketplace/release.json` carries the exact entry bytes in
base64 with their SHA-256. The installer downloads that carrier so preview
toolbar injection into HTML responses cannot contaminate the installed page.
Only the entry HTML is installed on kapukai.org; the JSON carrier is not copied.

## Release sequence

1. Commit the page, carrier and installer tests to the existing public repository.
2. Deploy the exact commit to the existing `kapukai-community` project as a
   preview. Verify the entry, visible fallback and app destination.
3. Fill `SOURCE`, `SOURCE_COMMIT` and `DEPLOYMENT_ID` in `marketplace/install.py`
   with the immutable entry preview origin, its source commit and deployment ID.
   Keep the pinned carrier and entry hashes aligned with the reviewed bytes.
4. Record both the entry release and the unchanged app identity in
   `marketplace/release-manifest.json`; mark the branded entry pending until it
   is installed and verified. Commit the finalized installer and manifest.
5. Run the commands below from a terminal with existing SSH access.

```sh
python3 marketplace/install.py --check-only
python3 marketplace/install.py
```

The defaults are the existing host `root@195.246.230.42` and web root
`/var/www/kapukai.org/public_html`. `--ssh` and `--web-root` support an owner-verified
host move. Use the normal trusted SSH host-key process; do not disable checking.

The installer validates the public bundle and anonymous access to the expected
Kapukai app before SSH. This HTTP check does not claim commerce readiness.
On the host, it verifies
the existing Kapukai homepage, refuses symlinks or differing existing content,
records a snapshot of the absent destination outside the public web root, and
installs the complete single-file directory atomically. Existing pages are not
overwritten. An exact rerun is harmless. DNS changes and nginx reloads are not
required. Any SSH password is entered in the terminal, never in chat.

It then retrieves `https://kapukai.org/marketplace/` and checks the entry bytes.
Python does not follow HTML meta refresh, so this verifies the branded entry
itself. Browser navigation to the application is a separate acceptance check.
Public verification failure must remain a release blocker, even if the remote
file installation completed.

## Check the installer

```sh
python3 -m unittest discover -s marketplace/tests -v
```

Fixtures exercise the actual remote installer against temporary website roots,
including first install, exact rerun, preservation of unrelated content,
conflicting content, symlinks, unexpected paths and damaged bytes. They do not
prove SSH connectivity, real app login, commerce readiness or live publication.

## Rollback

The receipt in the website root's sibling `marketplace-install-receipts`
directory records the previous absent state and the installed entry hash.
After verifying that the live directory still matches that receipt, move only
the `marketplace` directory outside the public web root to restore that absent
state. Stop for inspection if content has changed. Other public routes and the
application at its existing origin are independent of this entry.

## Verified release — 9 November 2026

Entry source commit: `417d7ef1aa7f851d5f56fe6bf4508a6337db603c`.
Entry Vercel deployment: `dpl_HAVHUwwna3QyvaaA3wt3BYCfE1VD`.
Preview: https://kapukai-community-emp096m2b-kapukais-projects.vercel.app/marketplace/

Nine local installer fixtures passed. The finalized installer's anonymous
`--check-only` run verified the hosted JSON carrier, exact entry bytes and
existing application access. A browser visit to the staged entry opened the
original marketplace alias and rendered the catalog. Catalog search was also
checked. See `release-manifest.json` for the exact scope and limitations.

The branded path returned HTTP 404 before installation. This session's SSH
connection to the existing host failed with `Network is unreachable`; therefore
`https://kapukai.org/marketplace/` is pending owner-run installation and public
verification. The existing application continues to display its preview and
no-live-sales notices. No login or purchase acceptance is claimed by this release.

Download the finalized installer from its own pinned Git commit. Its embedded
`SOURCE_COMMIT` identifies the earlier entry-page build and is not the download
revision for the later installer file.
