#!/usr/bin/env python3
"""Publish exactly three pinned Circuit assets using the operator's existing SSH access.

No third-party Python packages are needed. Run --help before use. The --worker
entry point is invoked over SSH by this same reviewed file, never by a web route.
"""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid


REPOSITORY = "Kapukai/kapukai-governance-site"
HOST = "root@195.246.230.42"
DESTINATION = Path("/var/www/kapukai.org/public_html/circuit")
BACKUP_ROOT = Path("/var/backups/kapukai-circuit")
PUBLIC_ROOT = "https://kapukai.org"
FILES = ("styles.css", "circuit.js", "index.html")  # Publish HTML last.
REGRESSIONS = ("/", "/eagle-eyes/", "/darpa/")
MANIFEST_PATH = "ops/circuit/assets.sha256.json"
MAX_ASSET_BYTES = 2 * 1024 * 1024


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def validate_manifest(manifest):
    require(isinstance(manifest, dict), "Manifest must be an object")
    require(set(manifest) == {"version", "files"}, "Unexpected manifest fields")
    require(type(manifest["version"]) is int and manifest["version"] == 1, "Unsupported manifest version")
    require(isinstance(manifest["files"], dict), "Manifest files must be an object")
    require(set(manifest["files"]) == set(FILES), "Manifest must name exactly the three Circuit assets")
    for name, item in manifest["files"].items():
        require(isinstance(item, dict) and set(item) == {"sha256", "bytes"}, "Invalid entry for " + name)
        require(isinstance(item["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", item["sha256"]), "Invalid SHA-256 for " + name)
        require(type(item["bytes"]) is int and 0 < item["bytes"] <= MAX_ASSET_BYTES, "Invalid size for " + name)


def verify_asset(name, data, manifest):
    item = manifest["files"][name]
    require(len(data) == item["bytes"], "Size mismatch: " + name)
    require(digest(data) == item["sha256"], "SHA-256 mismatch: " + name)


def no_symlinks(path):
    """Reject symlinks in every existing path component, including the leaf."""
    path = Path(path).absolute()
    for entry in reversed((path, *path.parents)):
        try:
            mode = entry.lstat().st_mode
        except FileNotFoundError:
            continue
        require(not stat.S_ISLNK(mode), "Symlink refused: " + str(entry))


def regular_bytes(path):
    no_symlinks(path)
    require(path.is_file(), "Expected a regular file: " + str(path))
    return path.read_bytes()


def atomic_write(path, data, mode=0o644, owner=None):
    """Write and fsync a same-directory temporary file, then atomically replace."""
    no_symlinks(path)
    descriptor, temporary = tempfile.mkstemp(prefix=".circuit-stage-", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
            if owner is not None:
                os.fchown(handle.fileno(), *owner)
            os.fchmod(handle.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_record(path, data):
    atomic_write(path, (json.dumps(data, indent=2) + "\n").encode(), 0o600)


def transaction_dir(backup_root, transaction):
    require(isinstance(transaction, str) and re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}", transaction), "Invalid transaction ID")
    path = backup_root / transaction
    no_symlinks(path)
    return path


def restore(transaction_path, destination, record):
    """Restore only the three managed files; preserve all unrelated directory entries."""
    for name in reversed(FILES):
        target = destination / name
        no_symlinks(target)
        previous = record["previous"][name]
        if previous["existed"]:
            data = regular_bytes(transaction_path / (name + ".before"))
            require(digest(data) == previous["sha256"], "Backup integrity failure: " + name)
            atomic_write(target, data, previous["mode"], (previous["uid"], previous["gid"]))
        elif target.exists():
            require(target.is_file(), "Unexpected restore target: " + name)
            target.unlink()
    if record["directory_existed"]:
        os.chmod(destination, record["directory_mode"])
    elif destination.exists():
        # Refuse to remove unexpected files added by another process.
        destination.rmdir()
    record["status"] = "rolled-back"
    record["rolled_back_at"] = utc_now()
    write_record(transaction_path / "transaction.json", record)


def install(payload, destination=DESTINATION, backup_root=BACKUP_ROOT):
    manifest = payload["manifest"]
    validate_manifest(manifest)
    require(re.fullmatch(r"[0-9a-f]{40}", payload["commit"]), "Commit must be a full Git SHA")
    require(set(payload["assets"]) == set(FILES), "Unexpected transfer files")
    assets = {name: base64.b64decode(payload["assets"][name], validate=True) for name in FILES}
    for name, data in assets.items():
        verify_asset(name, data, manifest)
    no_symlinks(destination)
    no_symlinks(backup_root)
    require(destination.parent.is_dir(), "Expected web root is missing")
    require(not destination.exists() or destination.is_dir(), "Circuit destination is not a directory")
    require(backup_root != destination.parent and destination.parent not in backup_root.parents,
            "Backups must be outside the public web root")
    for name in FILES:
        target = destination / name
        no_symlinks(target)
        require(not target.exists() or target.is_file(), "Managed path is not a regular file: " + name)

    backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(backup_root, 0o700)
    transaction_path = transaction_dir(backup_root, payload["transaction"])
    transaction_path.mkdir(mode=0o700)  # Existing IDs are never reused.
    record = {"version": 1, "commit": payload["commit"], "transaction": payload["transaction"],
              "manifest": manifest, "status": "prepared", "started_at": utc_now(),
              "directory_existed": destination.exists(),
              "directory_mode": stat.S_IMODE(destination.stat().st_mode) if destination.exists() else None,
              "previous": {}}
    for name in FILES:
        target = destination / name
        if target.exists():
            data = regular_bytes(target)
            atomic_write(transaction_path / (name + ".before"), data, 0o600)
            original = target.stat()
            record["previous"][name] = {"existed": True, "sha256": digest(data),
                                        "mode": stat.S_IMODE(original.st_mode), "uid": original.st_uid, "gid": original.st_gid}
        else:
            record["previous"][name] = {"existed": False}
    write_record(transaction_path / "transaction.json", record)
    try:
        destination.mkdir(exist_ok=True, mode=0o755)
        os.chmod(destination, 0o755)
        for name in FILES:
            atomic_write(destination / name, assets[name])
        for name in FILES:
            verify_asset(name, regular_bytes(destination / name), manifest)
        record["status"] = "installed-awaiting-public-verification"
        write_record(transaction_path / "transaction.json", record)
    except BaseException as exc:
        try:
            restore(transaction_path, destination, record)
        except BaseException as rollback_error:
            raise RuntimeError("Installation failed; automatic rollback also failed. Inspect " + str(transaction_path) + ": " + str(rollback_error)) from exc
        raise RuntimeError("Installation failed; previous files restored. Backup: " + str(transaction_path)) from exc
    return {"ok": True, "status": record["status"], "transaction": payload["transaction"], "backup_dir": str(transaction_path)}


def finish(payload, destination=DESTINATION, backup_root=BACKUP_ROOT):
    transaction_path = transaction_dir(backup_root, payload["transaction"])
    record = read_json(regular_bytes(transaction_path / "transaction.json"))
    require(record["status"] in {"installed-awaiting-public-verification", "verified"}, "Transaction is not installed")
    for name in FILES:
        verify_asset(name, regular_bytes(destination / name), record["manifest"])
    if payload["action"] == "rollback":
        restore(transaction_path, destination, record)
    elif payload["action"] == "confirm":
        record["status"] = "verified"
        record["verified_at"] = utc_now()
        record["public_verification"] = payload["verification"]
        write_record(transaction_path / "transaction.json", record)
    else:
        raise ValueError("Unsupported finishing action")
    return {"ok": True, "status": record["status"], "transaction": payload["transaction"], "backup_dir": str(transaction_path)}


def remote_worker():
    # A private, process-held advisory lock prevents this helper racing itself.
    import fcntl
    no_symlinks(BACKUP_ROOT)
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(BACKUP_ROOT, 0o700)
    lock_path = BACKUP_ROOT / ".publish.lock"
    no_symlinks(lock_path)
    descriptor = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w"):
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = sys.stdin.read(5 * MAX_ASSET_BYTES + 1)
        require(len(raw) <= 5 * MAX_ASSET_BYTES, "Transfer exceeds the allowed size")
        payload = read_json(raw)
        result = install(payload) if payload["action"] == "install" else finish(payload)
        print(json.dumps(result))


def fetch(url, maximum):
    request = Request(url, headers={"User-Agent": "KapukaiCircuitRelease/1.0", "Cache-Control": "no-cache"})
    with urlopen(request, timeout=30) as response:
        require(response.status == 200, "HTTP check failed: " + url)
        expected, actual = urlsplit(url), urlsplit(response.geturl())
        require((actual.scheme, actual.netloc, actual.path) == (expected.scheme, expected.netloc, expected.path), "Unexpected redirect: " + url)
        data = response.read(maximum + 1)
    require(len(data) <= maximum, "Response exceeds expected size: " + url)
    return data


def ssh_worker(payload):
    # SSH uses the operator's existing credentials and verified known-host entry.
    # No host-key, account, privilege or server-configuration changes are made.
    source = Path(__file__).read_text()
    command = "python3 -c " + shlex.quote(source) + " --worker"
    result = subprocess.run(["ssh", "-T", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
                             "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", HOST, command],
                            input=json.dumps(payload), text=True, stdout=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError("SSH operation did not complete successfully. Do not retry blindly; inspect transaction " + payload["transaction"] + " under " + str(BACKUP_ROOT))
    receipt = read_json(result.stdout)
    require(receipt.get("ok") is True, "Remote worker did not confirm completion")
    return receipt


def public_hash(path, transaction):
    data = fetch(PUBLIC_ROOT + path + "?circuit_release=" + transaction, MAX_ASSET_BYTES)
    return {"status": 200, "sha256": digest(data), "bytes": len(data), "checked_at": utc_now()}


def publish(args):
    require(re.fullmatch(r"[0-9a-f]{40}", args.commit), "Use the complete 40-character tested commit SHA")
    require(re.fullmatch(r"[0-9a-f]{64}", args.manifest_sha256), "Use the supplied 64-character manifest SHA-256")
    source_root = "https://raw.githubusercontent.com/" + REPOSITORY + "/" + args.commit + "/"
    raw_manifest = fetch(source_root + MANIFEST_PATH, 65536)
    require(digest(raw_manifest) == args.manifest_sha256, "Manifest SHA-256 mismatch; no upload attempted")
    manifest = read_json(raw_manifest)
    validate_manifest(manifest)
    assets = {}
    for name in FILES:
        data = fetch(source_root + "circuit/" + name, manifest["files"][name]["bytes"])
        verify_asset(name, data, manifest)
        assets[name] = base64.b64encode(data).decode("ascii")
    print("Verified the pinned manifest and all three source files.", flush=True)
    if args.dry_run:
        print("Dry run complete. No SSH connection or installation attempted.")
        return
    transaction = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:12]
    baseline = {path: public_hash(path, transaction) for path in REGRESSIONS}
    print("Installing only Circuit assets. Transaction: " + transaction, flush=True)
    receipt = ssh_worker({"action": "install", "commit": args.commit, "transaction": transaction, "manifest": manifest, "assets": assets})
    print("Backup: " + receipt["backup_dir"], flush=True)
    try:
        checks = {}
        for name in FILES:
            path = "/circuit/" if name == "index.html" else "/circuit/" + name
            checks[path] = public_hash(path, transaction)
            require(checks[path]["sha256"] == manifest["files"][name]["sha256"], "Public content mismatch: " + path)
        regressions = {path: public_hash(path, transaction) for path in REGRESSIONS}
        for path in REGRESSIONS:
            require(regressions[path]["sha256"] == baseline[path]["sha256"], "Existing route changed or could not be verified: " + path)
    except Exception:
        print("Public verification failed. Requesting rollback of this Circuit transaction.", file=sys.stderr, flush=True)
        ssh_worker({"action": "rollback", "transaction": transaction})
        raise
    receipt = ssh_worker({"action": "confirm", "transaction": transaction,
                          "verification": {"source_commit": args.commit, "manifest_sha256": args.manifest_sha256,
                                           "circuit": checks, "unaffected_before": baseline, "unaffected_after": regressions}})
    print("PASS: https://kapukai.org/circuit/ and both assets match the pinned source.")
    print("PASS: home, Eagle Eyes and DARPA page bytes are unchanged.")
    print("RELEASE RECEIPT: " + receipt["backup_dir"] + "/transaction.json")
    print("COMMIT: " + args.commit)


def main():
    if sys.argv[1:] == ["--worker"]:
        remote_worker()
        return
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--commit", help="Exact reviewed 40-character Git commit SHA")
    action.add_argument("--rollback", metavar="TRANSACTION", help="Restore a recorded transaction if its installed files remain unchanged")
    parser.add_argument("--manifest-sha256", help="Required when publishing: SHA-256 of ops/circuit/assets.sha256.json")
    parser.add_argument("--dry-run", action="store_true", help="Verify downloads only; never connect to the server")
    args = parser.parse_args()
    if args.rollback:
        require(not args.dry_run and args.manifest_sha256 is None, "Rollback cannot be combined with publication options")
        require(re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}", args.rollback), "Invalid transaction ID")
        receipt = ssh_worker({"action": "rollback", "transaction": args.rollback})
        print("RESTORED: previous Circuit files, permissions and ownership.")
        print("RECEIPT: " + receipt["backup_dir"] + "/transaction.json")
        print("Recheck the branded route before declaring the public rollback verified.")
    else:
        require(args.manifest_sha256 is not None, "--manifest-sha256 is required when publishing")
        publish(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("STOP: " + str(error), file=sys.stderr)
        sys.exit(1)
