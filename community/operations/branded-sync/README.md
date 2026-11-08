# Keep Kapukai Join and The Remedy Brief current

Use this package on the Mac with administrator SSH access to the existing Kapukai host. Unzip the complete folder in Downloads. The first command checks the server, the published source and the current branded responses. The second installs the verified release and enables the timer.

```sh
cd ~/Downloads/Kapukai-Branded-Community-Sync-v2
/bin/bash ./Install-Kapukai-Branded-Sync.command check
/bin/bash ./Install-Kapukai-Branded-Sync.command install
```

Double-clicking **Install-Kapukai-Branded-Sync.command** runs the same install. The package uses the Mac’s existing host key and login. A successful install prints that the branded pages were verified. Visit [Join](https://kapukai.org/join/), [The Remedy Brief](https://kapukai.org/newsletter/) and the [issue archive](https://kapukai.org/newsletter/archive/). Afterwards the server checks about every 15 minutes, including when the Mac is off.

To see the timer or return the routes to the original site:

```sh
/bin/bash ./Install-Kapukai-Branded-Sync.command status
/bin/bash ./Install-Kapukai-Branded-Sync.command rollback
```

**If the check stops**, read the final `Stopped` line. The old installer expected a completely root-owned site. On the verified host, the web root and Join directory belong to `www-data`, while other files and the newsletter directory belong to root. This version uses its own release directory, so that ownership is supported. A broken nginx include, competing route, unsupported vhost or unknown public page still requires review. If `nginx -t` reports a missing include, address that pre-existing configuration issue before retrying. Keep this installer for rollback. A failed first check from v1 leaves the host eligible for v2. If v1 was successfully installed, use its original installer to roll it back first.

## What the host serves

The release worker matches the GitHub `main` commit to a successful Kapukai Community Vercel production deployment and checks the production alias bytes against Git blob IDs. It verifies shared thumbnails and icons on both domains. The Git commit, deployment and installed SHA-256 hashes are recorded. Join, the newsletter, the archive and supported monthly issues are published in a dedicated, root-controlled tree under `/srv/kapukai-branded-sync/`. The only edits to upstream HTML replace the two shared CSS/JavaScript references with versioned copies in the newsletter namespace. These keep readers’ existing tabs working across updates.

The installer locates the active HTTPS vhost, checks the baseline nginx configuration and backs up its exact bytes outside the active nginx include directories. It installs narrowly scoped locations and tests the resulting configuration before a graceful reload. Supported paths include the known page destinations and monthly issue illustrations. Other applications, HTTP services, the legacy web root and email configuration remain under their existing owners. The installer checks public content hashes, media types and existing page security headers after cutover. A mismatch triggers restoration. Once installed, the restricted recurring service changes a single release pointer, rechecks the public URLs and restores the prior release if verification fails. Subsequent releases require no nginx reload.

Rollback disables the timer, waits for an ongoing update, validates the managed vhost and restores the prior configuration. It checks the original public responses before removing the service. If an administrator independently edited the vhost, or the original pages changed while the new routes were active, recovery stops for review. Stored release files, backups and receipts remain available under `/srv/kapukai-branded-sync` and `/var/lib/kapukai-branded-sync`.

## Operations

Requires Linux with user namespace support, systemd 247 or later, nginx at its standard path, root SSH, Python 3.9+, GNU tar/coreutils, `flock`, and outbound HTTPS to GitHub, Vercel and kapukai.org. The accepted layout is a single HTTPS vhost for kapukai.org with optional www.kapukai.org alias, and supported static configuration on port 443. Existing overlapping locations or unsupported access/rewrite rules stop the preflight. Replacing live configuration requires a graceful reload on initial cutover and rollback. Run a deployment while other administrators are not editing or reloading nginx.

The source rules currently allow up to 250 release files, 6 MiB per file, 64 MiB total, and 40 referenced shared assets. They include monthly HTML pages and PNG, JPG and WebP issue illustrations. The overlay keeps the active release and recent releases, with a cap on immutable asset storage. The first publication and recurring updates require the GitHub API and end-to-end public HTTPS verification. DNS, rate limits or deployment delays can postpone an update. This release does not test account creation or email delivery.

On the host, use `journalctl -u kapukai-branded-sync.service -n 40 --no-pager` to inspect recorded results. Maintainers can run `python3 -B -m unittest discover -v` from the corresponding repository directory and `systemd-analyze verify kapukai-branded-sync.service kapukai-branded-sync.timer` on Linux.
