#!/usr/bin/env python3
"""Publish verified public releases from a dedicated tree. Never open the legacy web root."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import build_opener, Request

import source

BASE = Path('/srv/kapukai-branded-sync')
STATE = Path('/var/lib/kapukai-branded-sync')
MAIN = 'join/index.html'
LETTER = 'newsletter/index.html'
LEGACY = {
    MAIN: {
        'd51f237752b0285b5ad1893e6f39a1351318306a1448a175fc0971a6ae2e9943',
        '1ef7925c173a4f80a8114add530d7a5a7e3c5d5ba4a41c011a22bde2bf20176a',
    },
    LETTER: {'b83a9dfd4ba5cb2e6b6ff07b0bd4511465a0d58a4f1b92765092ce7273a06729'},
}
SECURITY_HEADERS = ('Content-Security-Policy', 'Strict-Transport-Security', 'Referrer-Policy',
                    'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy')
ASSET = re.compile(r'newsletter/_community-assets/[0-9a-f]{64}/(?:app\.js|style\.css)')


def trusted_dir(path):
    s = path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != os.geteuid() or s.st_mode & 0o022:
        raise ValueError('Expected a trusted directory: ' + str(path))


def ensure_dir(path, mode=0o700):
    if not path.exists() and not path.is_symlink():
        path.mkdir(mode=mode)
    trusted_dir(path)


def secure_read(path, default):
    if not path.exists() and not path.is_symlink():
        return default
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid != os.geteuid() or s.st_mode & 0o022 or s.st_nlink != 1:
        raise ValueError('Unexpected receipt file: ' + str(path))
    return json.loads(path.read_bytes())


def durable(path, data):
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(json.dumps(data, sort_keys=True).encode())
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
        d = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        Path(name).unlink(missing_ok=True)


def get_public(name):
    if name not in source.ROUTES and not source.ARCHIVE.fullmatch(name) and not ASSET.fullmatch(name):
        raise ValueError('Unrecognized public verification path')
    url = source.BRAND + source.path_url(name) + '?release_verify=' + str(time.time_ns())
    req = Request(url, headers={'User-Agent':'KapukaiRelease/2', 'Cache-Control':'no-cache', 'Accept-Encoding':'identity'})
    try:
        with build_opener(source.NoRedirect()).open(req, timeout=15) as response:
            if response.status != 200 or response.headers.get_content_type() not in source.TYPES[name.split('.')[-1]]:
                raise ValueError('Incorrect HTTP status or media type: /' + name)
            data = response.read(source.MAX_FILE + 1)
            if len(data) > source.MAX_FILE:
                raise ValueError('Unexpected public file size: /' + name)
            return {'sha': source.sha256(data), 'headers': {
                k: response.headers.get_all(k) for k in SECURITY_HEADERS if response.headers.get_all(k)}}
    except HTTPError as exc:
        if exc.code == 404:
            return {'sha': None, 'headers': {}}
        raise


def inspect(names, reader):
    with ThreadPoolExecutor(max_workers=6) as pool:
        return dict(zip(names, pool.map(reader, names)))


def initial(meta, contents, reader):
    live = inspect(sorted(contents), reader)
    for name, result in live.items():
        allowed = {source.sha256(contents[name]), meta['source_sha256'].get(name)}
        if name in LEGACY:
            allowed = (allowed - {None}) | LEGACY[name]
        else:
            allowed.add(None)
        if result['sha'] not in allowed:
            raise ValueError('Existing public page or asset needs review: /' + name)
    return live


def verify(expected, baseline, reader):
    for name, current in inspect(sorted(expected), reader).items():
        if current['sha'] != expected[name]:
            raise ValueError('Published response differs at ' + source.path_url(name))
        if name.endswith('html') and current['sha']:
            before = baseline.get(name, {})
            if not before.get('sha'):
                before = baseline[LETTER]
            for key, value in before['headers'].items():
                if current['headers'].get(key) != value:
                    raise ValueError('Public security policy changed at ' + source.path_url(name) + ' (' + key + ')')


def retry_verify(expected, baseline, reader, pause=time.sleep):
    # Existing nginx workers and in-flight connections may finish during a graceful reload.
    for delay in (0, 1, 2, 4):
        if delay:
            pause(delay)
        try:
            verify(expected, baseline, reader)
            return
        except (OSError, ValueError) as exc:
            problem = exc
    raise problem


class Publication:
    def __init__(self, state, overlay, routes, reader=get_public, prepare=source.prepare, pause=time.sleep):
        self.state = state
        self.overlay = overlay
        self.routes = routes  # sync deliberately receives None: it has no nginx control.
        self.reader = reader
        self.prepare = prepare
        self.pause = pause
        self.control = state/'control'/'install.json'
        self.pending = state/'overlay'/'switch.json'

    def verify(self, hashes, baseline):
        retry_verify(hashes, baseline, self.reader, self.pause)

    def original(self, control):
        hashes = {n: r['sha'] for n, r in control['baseline'].items()}
        self.verify(hashes, control['baseline'])

    def check(self):
        self.routes.baseline()
        meta, data = self.prepare()
        control = secure_read(self.control, None)
        if control and control['status'] == 'active':
            self.verify(self.overlay.files(self.overlay.current()), control['baseline'])
        else:
            initial(meta, data, self.reader)
        print('Verified source, nginx configuration and branded responses.', flush=True)

    def undo(self, control):
        durable(self.control, dict(control, status='restoring'))
        # Ask Routes to recover an interrupted activation even if active() is not yet true.
        self.routes.deactivate()
        self.original(control)
        self.overlay.select(None)
        durable(self.pending, None)
        durable(self.control, None)

    def install(self):
        control = secure_read(self.control, None)
        if control:
            if control['status'] == 'active':
                self.routes.baseline()
                if not self.routes.active():
                    raise ValueError('Recorded route configuration is missing. Review before reinstalling.')
                return self.update()
            self.undo(control)
        self.routes.baseline()
        meta, data = self.prepare()
        baseline = initial(meta, data, self.reader)
        key = self.overlay.stage(meta, data)
        if self.overlay.current() is not None:
            raise ValueError('A release is selected without an active installation receipt.')
        ensure_dir(self.control.parent)
        control = {'status':'installing', 'baseline':baseline}
        durable(self.control, control)
        try:
            self.overlay.select(key)
            self.routes.activate()
            self.verify(self.overlay.files(key), baseline)
        except BaseException:
            self.undo(control)
            raise
        durable(self.control, dict(control, status='active'))
        print('Branded pages verified. Commit', meta['commit'], flush=True)

    def recover_switch(self, control):
        pending = secure_read(self.pending, None)
        if pending:
            if self.overlay.current() not in (pending['previous'], pending['next']):
                raise ValueError('An outside release change blocks recovery.')
            self.overlay.select(pending['previous'])
            self.verify(self.overlay.files(pending['previous']), control['baseline'])
            durable(self.pending, None)

    def update(self):
        control = secure_read(self.control, None)
        if not control or control['status'] != 'active':
            raise ValueError('A verified host install is required.')
        self.recover_switch(control)
        previous = self.overlay.current()
        if previous is None:
            raise ValueError('No active static release.')
        old = self.overlay.files(previous)
        self.verify(old, control['baseline'])
        meta, data = self.prepare()
        key = self.overlay.stage(meta, data)
        if previous == key:
            return
        files = self.overlay.files(key)
        # An issue withdrawn in a later production release must also disappear on the brand.
        removed = {n: None for n in old.keys() - files.keys() if not ASSET.fullmatch(n)}
        durable(self.pending, {'previous':previous, 'next':key})
        try:
            self.overlay.select(key)
            self.verify(dict(files, **removed), control['baseline'])
        except BaseException:
            self.recover_switch(control)
            raise
        durable(self.pending, None)
        print('Branded pages verified. Commit', meta['commit'], flush=True)

    def rollback(self):
        control = secure_read(self.control, None)
        if control:
            self.undo(control)
        elif self.routes.active():
            raise ValueError('A managed route has no public baseline; review before removing.')
        print('Original branded routes verified; release receipts retained.', flush=True)


@contextmanager
def lock(directory):
    path = directory/'publish.lock'
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or info.st_mode & 0o022:
            raise ValueError('Unexpected publishing lock.')
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def main():
    from overlay import Overlay
    from nginx_route import Routes
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'install', 'sync', 'rollback'])
    action = parser.parse_args().action
    if os.geteuid() != 0:
        raise ValueError('Run through the authorized host setup or service.')
    for path in (BASE, STATE):
        for parent in reversed(path.parents):
            trusted_dir(parent)
        if path.exists() or path.is_symlink():
            trusted_dir(path)
    overlay = Overlay(BASE, STATE/'overlay'/'releases')
    routes = None if action == 'sync' else Routes(STATE)
    publication = Publication(STATE, overlay, routes)
    overlay.validate()
    if action == 'check' and not (STATE/'overlay').exists():
        return publication.check()
    ensure_dir(STATE)
    ensure_dir(STATE/'overlay')
    if (STATE/'control').exists() or (STATE/'control').is_symlink():
        trusted_dir(STATE/'control')
    with lock(STATE/'overlay'):
        if action == 'check':
            return publication.check()
        if action == 'install':
            return publication.install()
        if action == 'sync':
            return publication.update()
        return publication.rollback()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        sys.exit('Stopped: ' + str(exc))
