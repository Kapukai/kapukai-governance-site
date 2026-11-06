# Publish Join and The Remedy Brief on kapukai.org

Run this package once on the Mac that already has administrator SSH access to the Kapukai host. The host then checks Vercel production approximately every 15 minutes and publishes verified releases at the familiar kapukai.org addresses. Closing the Mac afterwards is fine.

**Install.** Open the ZIP, open the extracted folder, then double-click **Install-Kapukai-Branded-Sync.command**. If using Terminal, run the following from inside that folder. Use the Mac's existing trusted SSH connection to the Kapukai host. Verify an unfamiliar server key with the host administrator before accepting it.

```sh
./Install-Kapukai-Branded-Sync.command check
./Install-Kapukai-Branded-Sync.command install
./Install-Kapukai-Branded-Sync.command status
```

A successful install ends with “Branded pages verified.” Visit the [Join page](https://kapukai.org/join/), [newsletter](https://kapukai.org/newsletter/) and [public issue archive](https://kapukai.org/newsletter/archive/). On Join, open the section for the Document Studio and the link for Human Liberty Ledger as a visitor. On the newsletter, open the latest issue and its illustration. These are public page checks. Checking an actual email receipt requires a separate signup test.

**Restore the original pages.** From the same extracted folder, run:

```sh
./Install-Kapukai-Branded-Sync.command rollback
```

Rollback disables the timer, waits for an in-progress release, restores the original files across all releases, verifies public responses, and removes the installed worker and units. It preserves receipts and backups. If a previous rollback lost connectivity, rerun the same command to finish verification.

## How this release works

The community module is already published to Vercel. The broader installer in `community/deploy.py` uses `community/release-manifest.json`. This independently scoped worker uses GitHub's immutable tree for the current `main` commit because the broader manifest covers many additional module paths and may omit recently added files. It requires a successful production deployment for the same commit from the Vercel GitHub app, checks file types and sizes, and compares the bytes served by the production alias with Git's blob IDs. It verifies shared icons and social thumbnails on both origins. Receipts link the commit, deployment URL, release inputs and the installed SHA-256 hashes.

The only pages it publishes are `/join/`, `/newsletter/`, `/newsletter/archive/` and monthly issue pages under `/newsletter/archive/YYYY-MM/`, including supported issue illustrations. The two HTML attributes selecting `app.js` and `style.css` point to byte-identical, versioned copies under `/newsletter/_community-assets/`. Everything else in those documents retains the Vercel source bytes. Existing shared scripts and styles on kapukai.org continue serving their other consumers. Each new issue is discovered from the committed archive. A new dependency or file type outside the supported scope blocks the release for review.

The worker checks the original disk and public bytes for every proposed target before writing. It accepts the known November 5 Join and newsletter pages as starting points, including the standalone Join logo patch. A conflicting proxy, local edit, symlink, unexpected file, unsafe permissions or unpublished source makes the check stop and identify the route. The worker leaves nginx and DNS configuration, the homepage, the Bills and Marketplace applications, and email services under their existing owners.

Each changed file is backed up and replaced atomically, with assets published before pages. A release touching several URLs consists of several file replacements. A hard interruption can leave some URLs at the newer version until recovery. The durable journal records the pending work; the next invocation restores and verifies it before continuing. A concurrent outside edit blocks restoration of that file and requires a host administrator to review it.

## Host requirements and records

The target is the existing 1984 host, with root SSH, Linux/systemd, Python 3.9+, GNU tar and coreutils, `flock`, outbound HTTPS to the public GitHub API, the Vercel production alias and kapukai.org. The worker expects the existing web root at `/var/www/kapukai.org/public_html` and real, root-owned `join` and `newsletter` directories. The path ancestors and managed files must be root-owned without group or public write permission. An administrator should investigate an ownership conflict before onboarding a different host layout. The installer uses the Mac's normal SSH key and host verification.

Systemd runs the fixed local worker. Fetched content is treated as static site data. A first verified publication succeeds before the timer is enabled. If the first service run fails after setup has staged components, run `status`, correct the reported cause and rerun `install`, or use `rollback`. Another package version or a foreign unit with the same name requires review.

The systemd journal shows the outcome of each pass. On the host:

```sh
systemctl list-timers --all kapukai-branded-sync.timer
journalctl -u kapukai-branded-sync.service -n 40 --no-pager
```

Worker receipts and original bytes are retained under `/var/lib/kapukai-branded-sync/worker/`. Retain that directory as long as rollback is needed. Keep the exact installer for recovery. The current scope supports up to 250 release files (6 MiB per file, 64 MiB total), plus up to 40 referenced shared assets. Dependency changes, a new archive format or a busy unauthenticated GitHub API can postpone publication until the next successful pass.

Run the offline regression tests from this directory with `python3 -m unittest -v test_sync.py`; run `systemd-analyze verify kapukai-branded-sync.service kapukai-branded-sync.timer` on a systemd host.
