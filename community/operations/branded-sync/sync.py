#!/usr/bin/env python3
"""Verify and publish the small, explicitly owned subset of the community site."""
import argparse
import concurrent.futures
import errno
import fcntl
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPRedirectHandler, Request

from source import prepare

ROOT = Path('/var/www/kapukai.org/public_html')
STATE = Path('/var/lib/kapukai-branded-sync/worker')
BRAND = 'https://kapukai.org'
MAX_FILE = 12 * 1024 * 1024
ROLLBACK_BASES = {
    'join/index.html': {
        'd51f237752b0285b5ad1893e6f39a1351318306a1448a175fc0971a6ae2e9943',
        '1ef7925c173a4f80a8114add530d7a5a7e3c5d5ba4a41c011a22bde2bf20176a',
    },
    'newsletter/index.html': {
        'b83a9dfd4ba5cb2e6b6ff07b0bd4511465a0d58a4f1b92765092ce7273a06729',
    },
}
PAGES = {'join/index.html', 'newsletter/index.html', 'newsletter/archive/index.html'}
ISSUE = r'newsletter/archive/[0-9]{4}-(?:0[1-9]|1[0-2])/(?:index\.html|[a-z0-9][a-z0-9-]{0,100}\.(?:png|jpg|jpeg|webp))'
IMMUTABLE = r'newsletter/_community-assets/([a-f0-9]{64})/(?:style\.css|app\.js)'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def sha(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def valid_name(name):
    if name not in PAGES and not re.fullmatch(ISSUE, name) and not re.fullmatch(IMMUTABLE, name):
        raise ValueError('Path outside publishing scope: ' + name)


def public(name):
    route = name[:-10] if name.endswith('/index.html') else name
    url = BRAND + '/' + route + '?release_verify=' + str(time.time_ns())
    request = Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'KapukaiRelease/1'})
    try:
        with build_opener(NoRedirect).open(request, timeout=15) as response:
            if response.status != 200:
                raise ValueError('Unexpected HTTP status for /' + route)
            data = response.read(MAX_FILE + 1)
            if len(data) > MAX_FILE:
                raise ValueError('Oversize public file: ' + name)
            return data
    except HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def verify_public(hashes, reader):
    def check(item):
        name, expected = item
        if sha(reader(name)) != expected:
            raise ValueError('Public content differs from the local file at /' + name +
                             '. Check the host route, cache or an existing nginx location.')
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(check, hashes.items()))


def safe_directory(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise ValueError('Expected a trusted, owner-controlled directory: ' + str(path))


def trusted_ancestors(path):
    for current in reversed(path.parents):
        if current.exists() or current.is_symlink():
            safe_directory(current)


def check_root(root):
    if root.resolve(strict=True) != root:
        raise ValueError('Unexpected web root symlink: ' + str(root))
    for path in (root, root/'join', root/'newsletter'):
        safe_directory(path)


def target(root, name):
    valid_name(name)
    path = root / name
    directory = root
    for part in Path(name).parts[:-1]:
        directory = directory / part
        if directory.is_symlink() or directory.exists():
            safe_directory(directory)
    if path.is_symlink():
        raise ValueError('Unexpected symlink: ' + name)
    if path.exists():
        info = path.stat()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > MAX_FILE
                or info.st_mode & 0o022 or info.st_uid != os.geteuid()):
            raise ValueError('Unexpected existing file: ' + name)
    return path


def local_hash(root, name):
    path = target(root, name)
    return sha(path.read_bytes()) if path.exists() else None


def fsync_dir(directory):
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(path, data, mode=0o600, owner=None):
    fd, filename = tempfile.mkstemp(dir=path.parent, prefix='.kapukai-tmp-')
    temp = Path(filename)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            if owner is not None:
                os.fchown(handle.fileno(), *owner)
            os.fchmod(handle.fileno(), mode)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        fsync_dir(path.parent)
    finally:
        temp.unlink(missing_ok=True)


def write_public(root, name, data, entry):
    path = target(root, name)
    if data is None:
        path.unlink()
        fsync_dir(path.parent)
        return
    for directory in reversed(path.parents):
        if root in directory.parents and not directory.exists():
            directory.mkdir(mode=0o755)
            fsync_dir(directory.parent)
    # Preserve uid, gid and the original read/write permissions; never copy special mode bits.
    atomic(path, data, entry.get('mode', 0o644), entry.get('owner'))


def prune(root, created):
    for name in sorted(set(created), key=lambda n: -n.count('/')):
        path = root / name
        if path.exists():
            safe_directory(path)
            try:
                path.rmdir()
                fsync_dir(path.parent)
            except OSError as exc:
                if exc.errno not in (errno.ENOTEMPTY, errno.EEXIST):
                    raise


def journal(state, record):
    atomic(state/'state.json', (json.dumps(record, indent=2) + '\n').encode())


def log(state, txn):
    if not re.fullmatch(r'[0-9]{12,22}', txn):
        raise ValueError('Invalid transaction receipt identifier')
    return json.loads((state/txn/'release.json').read_text())


def restore(root, state, txn, recovering):
    record = log(state, txn)
    for entry in reversed(record['changes']):
        name = entry['name']
        current = local_hash(root, name)
        if recovering and current == entry['before']:
            continue
        if current != entry['after']:
            raise ValueError('Outside change detected; will not overwrite /' + name)
        data = None
        if entry['before'] is not None:
            data = (state/txn/'backup'/name).read_bytes()
            if sha(data) != entry['before']:
                raise ValueError('Backup checksum mismatch: ' + name)
        write_public(root, name, data, entry)
    prune(root, record.get('created_dirs', []))


def snapshot(state, history):
    return log(state, history[-1])['files'] if history else {}


def release(root, state, record, stage, reader, check):
    metadata, contents = stage()
    files = {name: sha(data) for name, data in contents.items()}
    if not PAGES <= files.keys() or not any(re.fullmatch(ISSUE, name) and name.endswith('/index.html') for name in files):
        raise ValueError('Release is missing required pages')
    old = snapshot(state, record['history'])
    new_names = set(files)
    removed = {k for k in old.keys() - new_names if not re.fullmatch(IMMUTABLE, k)}
    ordered = sorted(new_names | removed, key=lambda n: (n.endswith('index.html'), -n.count('/'), n))
    changes = []
    for name in ordered:
        expected = files.get(name)
        match = re.fullmatch(IMMUTABLE, name)
        if match and expected != match.group(1):
            raise ValueError('Immutable URL hash mismatch: ' + name)
        current = local_hash(root, name)
        if name in old and current != old[name]:
            raise ValueError('Outside change detected; will not overwrite /' + name)
        if name not in old and current not in (None, expected) and current not in ROLLBACK_BASES.get(name, set()):
            raise ValueError('Unrecognized existing file; manual review required: /' + name)
        if current != expected:
            changes.append({'name': name, 'before': current, 'after': expected})
    # Ensure the host routes to the actual local files before claiming or changing them.
    verify_public({name: local_hash(root, name) for name in ordered}, reader)
    print('Verified release', metadata.get('commit'), 'with', len(files), 'files and', len(changes), 'changes.', flush=True)
    if check:
        return
    if not changes and old == files and record['history']:
        return
    txn = str(time.time_ns())
    directory = state/txn
    directory.mkdir(mode=0o700)
    for entry in changes:
        name = entry['name']
        if entry['before'] is not None:
            path = target(root, name)
            info = path.stat()
            data = path.read_bytes()
            if sha(data) != entry['before']:
                raise ValueError('Changed while backing up /' + name)
            backup = directory/'backup'/name
            backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            atomic(backup, data)
            entry.update(mode=stat.S_IMODE(info.st_mode) & 0o777, owner=[info.st_uid, info.st_gid])
    created = set()
    for entry in changes:
        for path in (root/entry['name']).parents:
            if path == root:
                break
            if not path.exists():
                created.add(str(path.relative_to(root)))
    receipt = dict(metadata, files=files, changes=changes, created_dirs=sorted(created))
    atomic(directory/'release.json', json.dumps(receipt, indent=2).encode())
    fsync_dir(state)
    record['pending'] = {'txn': txn, 'direction': 'publish'}
    journal(state, record)
    try:
        for entry in changes:
            name = entry['name']
            if local_hash(root, name) != entry['before']:
                raise ValueError('Outside change while installing /' + name)
            write_public(root, name, contents.get(name), entry)
        if removed:
            past_dirs = {name for previous in record['history'] for name in log(state, previous).get('created_dirs', [])}
            prune(root, past_dirs)
        verify_public({name: files.get(name) for name in ordered}, reader)
    except BaseException:
        # A hard kill leaves this same work recorded for recovery on the next invocation.
        restore(root, state, txn, recovering=True)
        verify_public({entry['name']: entry['before'] for entry in changes}, reader)
        record['pending'] = None
        journal(state, record)
        raise
    record['history'].append(txn)
    record['pending'] = None
    journal(state, record)
    print('Published and checked canonical URLs; receipt', txn, flush=True)


def run(root, state, mode, stage=prepare, reader=public):
    check_root(root)
    if state.is_symlink():
        raise ValueError('Unexpected state directory symlink')
    if mode == 'check' and not state.exists():
        return release(root, state, {'history': []}, stage, reader, True)
    state.mkdir(parents=True, mode=0o700, exist_ok=True)
    safe_directory(state)
    with (state/'worker.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = state/'state.json'
        record = json.loads(path.read_text()) if path.exists() else {'history': [], 'pending': None}
        if 'rollback_verify' in record and mode != 'rollback':
            raise ValueError('Operator rollback is in progress; retry rollback to verify the original site.')
        pending = record['pending']
        if pending:
            if mode == 'check':
                raise ValueError('An interrupted installation needs recovery; run sync or rollback.')
            txn = pending['txn']
            restore(root, state, txn, recovering=True)
            if pending['direction'] == 'rollback':
                record['history'].remove(txn)
            else:
                verify_public({e['name']: e['before'] for e in log(state, txn)['changes']}, reader)
            record['pending'] = None
            journal(state, record)
        if mode != 'rollback':
            return release(root, state, record, stage, reader, mode == 'check')
        expected = {}
        baseline = {}
        for txn in record['history']:
            for entry in log(state, txn)['changes']:
                name = entry['name']
                expected[name] = entry['after']
                baseline.setdefault(name, entry['before'])
        for name, digest in expected.items():
            if local_hash(root, name) != digest:
                raise ValueError('Outside edit blocks rollback: /' + name)
        if 'rollback_verify' not in record:
            record['rollback_verify'] = baseline
            journal(state, record)
        while record['history']:
            txn = record['history'][-1]
            record['pending'] = {'txn': txn, 'direction': 'rollback'}
            journal(state, record)
            restore(root, state, txn, recovering=False)
            record['history'].pop()
            record['pending'] = None
            journal(state, record)
        verify_public(record['rollback_verify'], reader)
        del record['rollback_verify']
        journal(state, record)
        print('Original site files restored. Backup receipts retained.', flush=True)


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('action', choices=('check', 'sync', 'rollback'))
    try:
        if os.geteuid() != 0:
            raise ValueError('An authorized host administrator is needed.')
        trusted_ancestors(ROOT)
        trusted_ancestors(STATE)
        run(ROOT, STATE, args.parse_args().action)
    except Exception as exc:
        sys.exit('Stopped: ' + str(exc))
