#!/usr/bin/env python3
"""Install the already released community module on the existing Kapukai host.

Run as root on the existing nginx host. --plan-only downloads and validates the
release and reports conflicts without modifying nginx or the website. Roll back
with the copy of this script saved in the printed private backup directory.
No build, DNS change, database change, or email is performed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import glob
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request


COMMIT = "8da5a8753ab588bd63cd73caac082f3707fd46af"
MANIFEST_SHA256 = "332275a8e7578a747aae462daf4e74d4cb68b06196ef0c2872ff52ccfb66f6fc"
RAW = "https://raw.githubusercontent.com/Kapukai/kapukai-governance-site/" + COMMIT
WEB_ROOT = Path("/var/www/kapukai.org/public_html")
SITE_CONFIG = Path("/etc/nginx/sites-enabled/kapukai.org")
MAIN_CONFIG = Path("/etc/nginx/nginx.conf")
PREFIXES = ("community/", "contact/", "join/", "confirm/", "testers/", "newsletter/",
            "articles/tort-law-and-accountability/", "tort/", "assets/community/",
            "architecture-of-power/")
BEGIN = "# BEGIN KAPUKAI NATIVE COMMUNITY " + COMMIT
END = "# END KAPUKAI NATIVE COMMUNITY " + COMMIT
OLD_REWRITE = ("rewrite ^/join(/|/index[.]html)?$ "
               "https://kapukai-community.vercel.app/join/ redirect;")
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; connect-src https://tbxfsjipkrdwyctepesf.supabase.co; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
PRIVATE = ("confirm/", "community/apply/", "community/operate/")
CORE = ("join/index.html", "assets/community/app.js", "assets/community/style.css",
        "assets/community/favicon.svg", "community/privacy/index.html")
EXCLUDED_PREFIXES = ("architecture-of-power/", "community/files/architecture-of-power/",
                     "assets/community/architecture", "assets/community/pattern-library")
EXCLUDED_FILES = {"assets/community/requirement-map.svg"}
TOKEN = re.compile(r'''\s+|\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};\#"']+''')


class Failure(RuntimeError):
    pass


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        # nginx errors may quote configuration values. Keep the complete output
        # private; the operator can inspect it locally when needed.
        raise Failure("Command failed: " + " ".join(args))
    return result


def atomic_write(path: Path, data: bytes, metadata: dict | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, name = tempfile.mkstemp(prefix=".kapukai-install-", dir=str(path.parent))
    temp = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchmod(handle.fileno(), metadata["mode"] if metadata else 0o644)
            if metadata:
                os.fchown(handle.fileno(), metadata["uid"], metadata["gid"])
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def metadata(path: Path) -> dict:
    value = path.stat()
    return {"mode": value.st_mode & 0o7777, "uid": value.st_uid, "gid": value.st_gid}


def download(relative: str) -> bytes:
    request = urllib.request.Request(RAW + "/" + relative,
                                     headers={"User-Agent": "Kapukai-pinned-native-installer/1"})
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise Failure("Release download failed: " + relative)
        data = response.read(32 * 1024 * 1024 + 1)
        if len(data) > 32 * 1024 * 1024:
            raise Failure("Unexpectedly large release file: " + relative)
        return data


def validate_manifest(data: bytes) -> dict:
    if sha(data) != MANIFEST_SHA256:
        raise Failure("The release manifest does not match the pinned SHA-256.")
    manifest = json.loads(data)
    files = manifest.get("files", {})
    if len(files) != 60 or manifest.get("module") != "kapukai-community":
        raise Failure("Unexpected release manifest structure.")
    for name, digest in files.items():
        path = PurePosixPath(name)
        if (path.is_absolute() or ".." in path.parts or str(path) != name
                or not name.startswith(PREFIXES)
                or not re.fullmatch(r"[a-zA-Z0-9_./-]+", name)
                or not re.fullmatch(r"[a-f0-9]{64}", digest)):
            raise Failure("Unsafe manifest entry: " + name)
    return manifest


def stage_release(stage: Path) -> dict:
    raw_manifest = download("community/release-manifest.json")
    manifest = validate_manifest(raw_manifest)
    (stage / "release-manifest.json").write_bytes(raw_manifest)
    # Keep the immutable source manifest intact; select only the signup and
    # Workshop journey. Independently installed research/atlas files stay alone.
    manifest = {**manifest, "files": {name: digest for name, digest in manifest["files"].items()
                                      if not name.startswith(EXCLUDED_PREFIXES)
                                      and name not in EXCLUDED_FILES}}

    def one(item: tuple[str, str]) -> None:
        name, expected = item
        data = download("community/public/" + name)
        if sha(data) != expected:
            raise Failure("Release file failed its hash check: " + name)
        target = stage / "public" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, manifest["files"].items()))
    return manifest


def parse_nginx(source: str) -> list[dict]:
    """Small read-only tokenizer; unsupported syntax fails instead of guessing."""
    tokens = []
    cursor = 0
    for match in TOKEN.finditer(source):
        if match.start() != cursor:
            raise Failure("Cannot safely parse this nginx configuration.")
        cursor = match.end()
        value = match.group()
        if not value.isspace() and not value.startswith("#"):
            tokens.append((value, match.start(), match.end()))
    if cursor != len(source):
        raise Failure("Cannot safely parse this nginx configuration.")
    position = 0

    def nodes(in_block: bool = False) -> list[dict]:
        nonlocal position
        answer = []
        while position < len(tokens):
            if tokens[position][0] == "}":
                if not in_block:
                    raise Failure("Unexpected nginx closing brace.")
                position += 1
                return answer
            start = tokens[position][1]
            words = []
            while position < len(tokens) and tokens[position][0] not in ("{", "}", ";"):
                words.append(tokens[position][0])
                position += 1
            if not words or position >= len(tokens):
                raise Failure("Unexpected nginx directive syntax.")
            terminator = tokens[position][0]
            position += 1
            children = nodes(True) if terminator == "{" else None
            if terminator not in ("{", ";"):
                raise Failure("Unexpected nginx directive terminator.")
            end = tokens[position - 1][2]
            answer.append({"name": words[0], "args": words[1:], "children": children,
                           "start": start, "end": end, "raw": source[start:end]})
        if in_block:
            raise Failure("Unclosed nginx block.")
        return answer

    return nodes()


def unquote(value: str) -> str:
    return value[1:-1] if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'" else value


def direct_headers(nodes: list[dict], seen: set[str] | None = None) -> list[dict]:
    """Include directives inherit their surrounding context, unlike child blocks."""
    seen = set() if seen is None else seen
    result = []
    for node in nodes:
        if node["name"] == "add_header":
            result.append(node)
        elif node["name"] == "include":
            if len(node["args"]) != 1:
                raise Failure("Unsupported nginx include syntax.")
            pattern = unquote(node["args"][0])
            if "$" in pattern:
                raise Failure("Cannot resolve variable nginx includes safely.")
            if not pattern.startswith("/"):
                pattern = str(MAIN_CONFIG.parent / pattern)
            for filename in sorted(glob.glob(pattern)):
                resolved = str(Path(filename).resolve())
                if resolved in seen:
                    continue
                seen.add(resolved)
                result.extend(direct_headers(parse_nginx(Path(filename).read_text()), seen))
    return result


def inherited_headers(server: dict) -> list[str]:
    headers = direct_headers(server["children"])
    if not headers:
        http = [n for n in parse_nginx(MAIN_CONFIG.read_text()) if n["name"] == "http"]
        if len(http) != 1:
            raise Failure("Cannot identify the nginx http block for header inheritance.")
        headers = direct_headers(http[0]["children"])
    managed = {"content-security-policy", "referrer-policy", "x-content-type-options",
               "x-frame-options", "cache-control", "x-robots-tag"}
    return [n["raw"] for n in headers if n["args"] and unquote(n["args"][0]).lower() not in managed]


def nginx_block(manifest: dict, extra_headers: list[str], indent: str) -> str:
    lines = [indent + BEGIN]
    types = {".html": "text/html", ".css": "text/css", ".js": "application/javascript",
             ".svg": "image/svg+xml", ".png": "image/png", ".pdf": "application/pdf",
             ".zip": "application/zip", ".json": "application/json", ".xml": "application/xml",
             ".txt": "text/plain", ".md": "text/plain"}
    for name in sorted(manifest["files"]):
        routes = [("/" + name, False)]
        if name.endswith("/index.html"):
            directory = "/" + name[:-len("index.html")]
            routes.extend([(directory, False), (directory.rstrip("/"), True)])
        for route, redirect in routes:
            lines.append(indent + "location = " + route + " {")
            prefix = indent + "    "
            lines.append(prefix + "expires off;")
            if redirect:
                lines.append(prefix + "return 308 " + route + "/$is_args$args;")
            else:
                lines.append(prefix + "root " + str(WEB_ROOT) + ";")
                lines.append(prefix + "try_files /" + name + " =404;")
                lines.append(prefix + "types { }")
                lines.append(prefix + "default_type " + types.get(PurePosixPath(name).suffix, "application/octet-stream") + ";")
            for header in extra_headers:
                lines.extend(prefix + line for line in header.splitlines())
            lines.extend([
                prefix + 'add_header X-Content-Type-Options "nosniff" always;',
                prefix + 'add_header Referrer-Policy "no-referrer" always;',
                prefix + 'add_header X-Frame-Options "DENY" always;',
                prefix + 'add_header Content-Security-Policy "' + CSP + '" always;',
            ])
            if name.startswith(PRIVATE):
                lines.extend([
                    prefix + 'add_header Cache-Control "no-store" always;',
                    prefix + 'add_header X-Robots-Tag "noindex, nofollow" always;',
                ])
            else:
                lines.append(prefix + 'add_header Cache-Control "no-cache" always;')
            lines.append(indent + "}")
    lines.append(indent + END)
    return "\n".join(lines) + "\n"


def prepare_config(original: str, manifest: dict) -> str:
    existing = None
    if BEGIN in original or END in original:
        if original.count(BEGIN) != 1 or original.count(END) != 1:
            raise Failure("Unexpected managed nginx block markers.")
        pattern = r"(?m)^[ \t]*" + re.escape(BEGIN) + r"\n[\s\S]*?^[ \t]*" + re.escape(END) + r"\n?"
        match = re.search(pattern, original)
        if not match:
            raise Failure("Cannot identify the existing managed nginx block.")
        existing = match.group()
        original = original[:match.start()] + original[match.end():]
    lines = original.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.strip() == OLD_REWRITE]
    if len(matches) > 1:
        raise Failure("Multiple temporary Join rewrites need manual review.")
    if matches:
        del lines[matches[0]]
    original = "".join(lines)
    anchors = list(re.finditer(r"(?m)^(?P<indent>[ \t]*)root[ \t]+" + re.escape(str(WEB_ROOT))
                              + r"[ \t]*;[ \t]*(?:#[^\n]*)?$", original))
    if len(anchors) != 1:
        raise Failure("Expected exactly one known web-root directive; no configuration was changed.")
    anchor = anchors[0]
    servers = [n for n in parse_nginx(original) if n["name"] == "server"
               and n["start"] < anchor.start() < n["end"]]
    if len(servers) != 1:
        raise Failure("The known web root is not inside one identifiable server block.")
    server = servers[0]
    roots = [n for n in server["children"] if n["name"] == "root"]
    names = [unquote(a) for n in server["children"] if n["name"] == "server_name" for a in n["args"]]
    listens = [unquote(a) for n in server["children"] if n["name"] == "listen" for a in n["args"]]
    if (len(roots) != 1 or roots[0]["args"] != [str(WEB_ROOT)] or "kapukai.org" not in names
            or not any(value == "443" or value.endswith(":443") for value in listens)):
        raise Failure("The root directive does not match the expected HTTPS Kapukai server.")
    block = nginx_block(manifest, inherited_headers(server), anchor.group("indent"))
    if existing is not None and existing != block:
        raise Failure("The existing managed nginx block has changed; review it before replacement.")
    return original[:anchor.start()] + block + original[anchor.start():]


def checked_target(root: Path, name: str) -> Path:
    target = root / name
    if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink():
        raise Failure("Destination contains an unsafe symbolic link: " + name)
    if target.exists() and not target.is_file():
        raise Failure("Destination is not a regular file: " + name)
    return target


def preflight_files(root: Path, manifest: dict) -> list[dict]:
    records, conflicts = [], []
    for name, expected in manifest["files"].items():
        target = checked_target(root, name)
        old_sha = sha(target.read_bytes()) if target.exists() else None
        if old_sha == expected:
            continue
        if old_sha is not None and old_sha != manifest.get("replaces", {}).get(name):
            conflicts.append(name)
        records.append({"path": name, "before_sha256": old_sha, "installed_sha256": expected,
                        "metadata": metadata(target) if target.exists() else None})
    if conflicts:
        raise Failure("Existing files differ from the tested release; nothing was installed:\n  " + "\n  ".join(conflicts))
    return records


def local_http(path: str) -> tuple[int, dict, bytes]:
    with tempfile.TemporaryDirectory(prefix="kapukai-http-") as temporary:
        headers_path = Path(temporary) / "headers"
        body_path = Path(temporary) / "body"
        response = run(["curl", "--silent", "--show-error", "--noproxy", "*",
                        "--connect-timeout", "5", "--max-time", "15",
                        "--resolve", "kapukai.org:443:127.0.0.1",
                        "--header", "Connection: close", "--header", "Cache-Control: no-cache",
                        "--dump-header", str(headers_path), "--output", str(body_path),
                        "--write-out", "%{http_code}", "https://kapukai.org" + path])
        # No -L: a redirect to another host cannot pass verification.
        headers = {}
        for line in headers_path.read_text().splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                headers.setdefault(key.lower(), []).append(value.strip())
        return int(response.stdout), headers, body_path.read_bytes()


def verify_live(manifest: dict, homepage_sha: str) -> None:
    for name in CORE:
        path = "/join/" if name == "join/index.html" else "/" + name
        status, headers, body = local_http(path)
        if status != 200 or sha(body) != manifest["files"][name]:
            raise Failure("HTTPS body verification failed: " + path)
        if "location" in headers:
            raise Failure("Unexpected redirect header: " + path)
        if name == "join/index.html":
            if not any("text/html" in v for v in headers.get("content-type", [])):
                raise Failure("Join did not return HTML.")
            if headers.get("content-security-policy") != [CSP]:
                raise Failure("Join CSP does not match the tested policy.")
    for path in ("/confirm/", "/community/apply/", "/community/operate/"):
        status, headers, body = local_http(path)
        if status != 200 or sha(body) != manifest["files"][path.lstrip("/") + "index.html"]:
            raise Failure("Private-route body verification failed: " + path)
        expected = {"cache-control": "no-store", "x-robots-tag": "noindex, nofollow",
                    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
                    "x-frame-options": "DENY", "content-security-policy": CSP}
        if any(headers.get(key) != [value] for key, value in expected.items()):
            raise Failure("Private-route security headers failed verification: " + path)
    status, _, body = local_http("/")
    if status != 200 or sha(body) != homepage_sha:
        raise Failure("The homepage changed during installation.")


def write_receipt(backup: Path, receipt: dict) -> None:
    atomic_write(backup / "install-receipt.json", (json.dumps(receipt, indent=2) + "\n").encode(),
                 {"mode": 0o600, "uid": 0, "gid": 0})


def rollback(backup: Path, *, automatic: bool = False) -> None:
    backup = backup.resolve(strict=True)
    if not backup.is_relative_to(Path("/root")):
        raise Failure("Rollback backup must be a private directory under /root.")
    receipt = json.loads((backup / "install-receipt.json").read_text())
    if receipt.get("source_commit") != COMMIT or receipt.get("web_root") != str(WEB_ROOT.resolve()):
        raise Failure("The backup does not identify this release and web root.")
    root = Path(receipt["web_root"])
    config = Path(receipt["config_path"])
    if config != SITE_CONFIG.resolve(strict=True):
        raise Failure("The nginx configuration target changed after installation.")
    old_config = (backup / "nginx-before.conf").read_bytes()
    if sha(old_config) != receipt["config_before_sha256"]:
        raise Failure("The nginx backup hash is invalid.")
    if sha(config.read_bytes()) not in {receipt["config_before_sha256"], receipt["config_installed_sha256"]}:
        raise Failure("The nginx configuration has later changes; rollback refused to overwrite them.")
    for record in receipt["files"]:
        target = checked_target(root, record["path"])
        current = sha(target.read_bytes()) if target.exists() else None
        if current not in {record["before_sha256"], record["installed_sha256"]}:
            raise Failure("A file has later changes; rollback refused: " + record["path"])
        if record["before_sha256"] is not None:
            saved = backup / "files-before" / record["path"]
            if sha(saved.read_bytes()) != record["before_sha256"]:
                raise Failure("A file backup hash is invalid: " + record["path"])
    for record in receipt["files"]:
        target = root / record["path"]
        if record["before_sha256"] is None:
            target.unlink(missing_ok=True)
        else:
            atomic_write(target, (backup / "files-before" / record["path"]).read_bytes(), record["metadata"])
    atomic_write(config, old_config, receipt["config_metadata"])
    run(["nginx", "-t"])
    run(["nginx", "-s", "reload"])
    receipt["state"] = "rolled_back_automatically" if automatic else "rolled_back"
    receipt["rollback_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_receipt(backup, receipt)
    print("Previous files and nginx configuration restored. Backup:", backup)


def install(plan_only: bool) -> None:
    if not WEB_ROOT.is_dir():
        raise Failure("The known web root is missing: " + str(WEB_ROOT))
    for command in ("nginx", "curl"):
        if not shutil.which(command):
            raise Failure("Required existing server command is unavailable: " + command)
    run(["nginx", "-t"])
    stage = Path(tempfile.mkdtemp(prefix="kapukai-native-stage-", dir="/root"))
    stage.chmod(0o700)
    print("Checking the signup/Workshop files from verified release", COMMIT, flush=True)
    manifest = stage_release(stage)
    config = SITE_CONFIG.resolve(strict=True)
    original = config.read_bytes()
    candidate = prepare_config(original.decode("utf-8"), manifest).encode()
    root = WEB_ROOT.resolve(strict=True)
    records = preflight_files(root, manifest)
    status, _, homepage = local_http("/")
    if status != 200:
        raise Failure("The existing local HTTPS homepage does not return 200; nothing was installed.")
    print("Validated:", len(manifest["files"]), "selected release files;", len(records), "file changes; nginx configuration",
          "will change." if candidate != original else "already matches.", flush=True)
    if plan_only:
        print("Plan only. Website and nginx unchanged. Validated stage:", stage)
        return
    backup = Path(tempfile.mkdtemp(prefix="kapukai-native-backup-" + time.strftime("%Y%m%dT%H%M%SZ-", time.gmtime()), dir="/root"))
    backup.chmod(0o700)
    (backup / "nginx-before.conf").write_bytes(original)
    shutil.copy2(Path(__file__).resolve(), backup / "installer.py")
    shutil.copy2(stage / "release-manifest.json", backup / "release-manifest.json")
    for record in records:
        if record["before_sha256"] is not None:
            saved = backup / "files-before" / record["path"]
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / record["path"], saved)
    receipt = {
        "state": "prepared", "source_commit": COMMIT, "manifest_sha256": MANIFEST_SHA256,
        "verified_vercel_deployment": "dpl_7zWjfY73fLDowDR8xSP6wyPVe9fq",
        "verified_vercel_url": "https://kapukai-community-hyauinsa5-kapukais-projects.vercel.app",
        "canonical_url": "https://kapukai.org/join/", "web_root": str(root),
        "config_path": str(config), "config_metadata": metadata(config),
        "config_before_sha256": sha(original), "config_installed_sha256": sha(candidate),
        "homepage_before_sha256": sha(homepage), "files": records, "stage": str(stage),
        "scope": "signup-and-workshop", "selected_file_hashes": manifest["files"],
        "started_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    write_receipt(backup, receipt)
    print("Private backup:", backup, flush=True)
    try:
        # Recheck immediately before mutation to avoid overwriting concurrent work.
        if config.read_bytes() != original or preflight_files(root, manifest) != records:
            raise Failure("The website or configuration changed during preparation; no install was attempted.")
        atomic_write(config, candidate, receipt["config_metadata"])
        validation = run(["nginx", "-t"], check=False)
        (backup / "nginx-validation.txt").write_text(validation.stdout + validation.stderr)
        if validation.returncode:
            raise Failure("The candidate nginx configuration failed validation; see private nginx-validation.txt.")
        for record in records:
            source = stage / "public" / record["path"]
            data = source.read_bytes()
            if sha(data) != record["installed_sha256"]:
                raise Failure("A staged file changed before installation: " + record["path"])
            atomic_write(root / record["path"], data, record["metadata"])
        run(["nginx", "-s", "reload"])
        failure = None
        for attempt in range(20):
            try:
                verify_live(manifest, receipt["homepage_before_sha256"])
                failure = None
                break
            except (Failure, OSError, ValueError) as error:
                failure = error
                if attempt != 19:
                    time.sleep(0.5)
        if failure is not None:
            raise failure
        for name, expected in manifest["files"].items():
            if sha((root / name).read_bytes()) != expected:
                raise Failure("Installed file hash mismatch: " + name)
        receipt["state"] = "verified"
        receipt["verified_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        receipt["homepage_after_sha256"] = receipt["homepage_before_sha256"]
        write_receipt(backup, receipt)
    except BaseException:
        try:
            rollback(backup, automatic=True)
        except Exception as rollback_error:
            print("Automatic rollback requires attention:", rollback_error, file=sys.stderr)
            print("Private backup:", backup, file=sys.stderr)
        raise
    print("VERIFIED: https://kapukai.org/join/ returns the tested signup page directly.")
    print("Core assets and private-route headers verified; homepage unchanged.")
    print("Existing confirmation-email links and backend settings remain unchanged.")
    print("Rollback: python3", backup / "installer.py", "--rollback", backup)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--plan-only", action="store_true")
    group.add_argument("--rollback", type=Path, metavar="BACKUP_DIRECTORY")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run this installer as root on the existing Kapukai nginx host.")
    try:
        if args.rollback:
            rollback(args.rollback)
        else:
            install(args.plan_only)
    except (Failure, OSError, ValueError) as error:
        print("STOPPED:", error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
