# Eagle Eyes public routes

This module installs three paths on the existing kapukai.org nginx host without changing the homepage, DNS, email, or nginx configuration:

- `/eagle-eyes/`: public landing page
- `/eagle-eyes/reference/`: curated public court decisions, map and dataset
- `/eagle-eyes/desk/`: public entry page with a deliberate link to the existing protected ChatGPT Sites Family Desk

**The private app is not migrated.** Its login, D1 database, R2 files and permissions remain at its existing origin. The desk entry page contains no case data and does not automatically redirect, proxy authentication, or collect credentials.

## Release

The adjacent release-manifest.json links the exact Git source commit, immutable Vercel deployment, and SHA-256 of every public file. The installer embeds the same values so it can run as one downloaded file. Vercel is the review host; kapukai.org installation remains pending until the installer succeeds on the existing host.

## Install

Requires Python 3 on the local computer and server, and existing SSH access to the documented host. No npm or Vercel CLI is needed. Review install.py, then run:

```sh
python3 install.py --check-only
python3 install.py
```

The known destination comes from this repository's existing `community/portfolio/install.py`: `root@195.246.230.42`, `/var/www/kapukai.org/public_html`. These can be changed with `--ssh` and `--web-root` if the owner has moved the site. Verify any new SSH host fingerprint against the hosting provider or a previously trusted record; do not disable host-key checking. Enter any password only at SSH's terminal prompt, never in chat.

The installer downloads only eight public files from the immutable deployment and verifies their hashes. On the server it verifies the existing Kapukai homepage, rejects symlinks and path escapes, and creates the entire Eagle Eyes directory atomically. An exact rerun is harmless; any differing existing content stops the installation. Existing pages are never overwritten. Receipts are written outside the public web root. First installation requires no backup of existing page files because none are replaced.

Finally it fetches every installed public file from kapukai.org and compares hashes. If that final check fails, files may have installed but publication is not verified. Report the error before changing server configuration.

## Verification scope

Seven installer tests cover initial install/idempotence, preservation of conflicts, unexpected files/directories, path traversal, symlinks, homepage identity and file/directory collisions. All 25 local navigation/asset references resolve. Browser testing verified the public landing page, reference navigation and Washington filter (4 results to 1). These checks do not certify private app authentication or case isolation.

The cloud environment's SSH attempt failed with `Network is unreachable`, so it did not install anything on kapukai.org. The source and tested release are ready for a terminal with existing server access.
