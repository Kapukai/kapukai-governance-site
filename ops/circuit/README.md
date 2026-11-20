# Publishing the Circuit page

This helper publishes the three reviewed static assets to the existing Kapukai
nginx host. It is a separate step after the exact Vercel preview has been verified.
A Vercel preview alone does not publish `https://kapukai.org/circuit/`.

## Scope

The only public files this helper installs are:

- `/var/www/kapukai.org/public_html/circuit/index.html`
- `/var/www/kapukai.org/public_html/circuit/styles.css`
- `/var/www/kapukai.org/public_html/circuit/circuit.js`

The files receive mode `0644`; the Circuit directory receives mode `0755`.
Backups and release receipts are kept outside the public web root at
`/var/backups/kapukai-circuit/<transaction>/`, accessible only to the operator.
No DNS, nginx configuration, service reload, accounts, keys, databases, or other
site files are changed.

## Before running

Use Python 3, `curl`, `shasum`, and the Mac's existing SSH access to
`root@195.246.230.42`. The host must already have a verified known-host entry and
Python 3. The helper will not add a host key or change SSH configuration.

The release must supply three exact values: the full tested Git commit, the
SHA-256 of `assets.sha256.json`, and the SHA-256 of `publish.py`. Download the
helper **to a file** from that exact commit and check its hash before running it.
Do not pipe it into `python3 -`: it needs its own file to send the same reviewed
worker over SSH. Do not use a moving branch URL for the final command.

From a verified checkout, the command shape is:

```sh
python3 ops/circuit/publish.py \
  --commit FULL_TESTED_COMMIT \
  --manifest-sha256 EXACT_MANIFEST_SHA256
```

These capitalized values are release placeholders. The operator-facing handoff
must replace them with the actual pins. Adding `--dry-run` verifies the pinned
GitHub downloads without connecting to SSH or changing the server.

## What happens

1. Download the pinned manifest and exactly the three named assets. Verify all
   byte counts and SHA-256 hashes before any server connection.
2. Record public response hashes for `/`, `/eagle-eyes/`, and `/darpa/`. If any
   cannot be checked, stop before installation.
3. Through the existing SSH connection, reject symlinked paths and unexpected
   file types, take a private backup, and record previous modes and ownership.
4. Install each file with an atomic same-directory replacement, with HTML last.
   A caught installation failure restores the prior files. The three replacements
   are separate operations; this is not a whole-directory atomic switch.
5. Fetch the exact branded `/circuit/` page and both assets with a cache-busting
   query. Require exact hashes and unchanged response hashes for the three
   existing routes. A verification failure requests rollback of this transaction.
6. Write the final receipt only after successful public checks. It records the
   source commit, asset manifest, UTC times, previous files, and public checks.

The expected final output includes `PASS` for the branded page and unchanged
routes, followed by the private receipt path and source commit. Retain that
receipt path with the exact Vercel deployment URL in the release handoff.

## Rollback and interruptions

Using the same verified helper, a recorded transaction can be rolled back with:

```sh
python3 ops/circuit/publish.py --rollback TRANSACTION_FROM_RECEIPT
```

Rollback first requires all three current files to still match that transaction's
installed manifest, then verifies the private backup hashes and restores the
prior content, modes, and ownership. If Circuit did not exist before, it removes
only the files and empty directory it created. Unrelated directory entries are
preserved. A newer edit causes refusal, not an overwrite.

An SSH interruption can leave the installation outcome unknown. Do not repeat
the publication blindly. Inspect the printed transaction's `transaction.json`
and the branded route first. A process crash, lost connection, or power loss may
leave a transaction awaiting verification; no helper can claim a completed
release without the public checks. After a manual rollback, recheck the public
route before recording that rollback as publicly verified.

## Offline safety tests

```sh
python3 ops/circuit/test_publish.py
```

The tests use temporary directories and the checked-in manifest and assets.
They exercise first installation, existing backups, permissions, symlink
refusal, backup placement, manifest restrictions, corruption rejection, partial
failure recovery, rollback, and refusal to overwrite a later edit. They make no
HTTP or SSH requests and do not touch the real web root.
