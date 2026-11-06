"""Publish verified files in a root-controlled tree. The legacy web root is never used."""
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path

from source import ARCHIVE, ROUTES

BASE = Path('/srv/kapukai-branded-sync')
STATE = Path('/var/lib/kapukai-branded-sync/overlay')
KEY = re.compile(r'[a-f0-9]{64}')
ASSET = re.compile(r'newsletter/_community-assets/([a-f0-9]{64})/(app\.js|style\.css)')
STAMP = '.kapukai-overlay-v2'
ROOT_UID = 0
MAX_FILE = 6 * 1024 * 1024
MAX_RELEASE = 64 * 1024 * 1024
MAX_POOL = 512 * 1024 * 1024
RETAIN_RELEASES = 3


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def inspect(path, kind):
    """lstat, never follow links. Only root may change a trusted parent."""
    s = path.lstat()
    require(s.st_uid == ROOT_UID and not s.st_mode & 0o022, 'Unsafe owner or permissions: ' + str(path))
    require(kind(s.st_mode), 'Unexpected filesystem object: ' + str(path))
    if kind is stat.S_ISREG:
        require(s.st_nlink == 1 and s.st_size <= MAX_FILE, 'Unexpected links or size: ' + str(path))
    return s


def exists(path):
    return os.path.lexists(path)


def trusted(path):
    for part in [*reversed(path.parents), path]:
        if exists(part):
            inspect(part, stat.S_ISDIR)


def directory(path, mode):
    if not exists(path):
        path.mkdir(mode=mode)
        # The SSH bootstrap sets umask 077; nginx must be able to traverse its release.
        os.chmod(path, mode)
        sync_dir(path.parent)
    inspect(path, stat.S_ISDIR)
    require(stat.S_IMODE(path.stat().st_mode) == mode, 'Unexpected overlay directory mode: ' + str(path))


def read(path):
    inspect(path, stat.S_ISREG)
    return path.read_bytes()


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_file(path, data, mode, workspace):
    if exists(path):
        inspect(path, stat.S_ISREG)
    fd, temp = tempfile.mkstemp(dir=workspace, prefix='.writing-')
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(data)
            out.flush()
            os.fchmod(out.fileno(), mode)
            os.fsync(out.fileno())
        os.replace(temp, path)
        sync_dir(path.parent)
    finally:
        Path(temp).unlink(missing_ok=True)


def check_hashes(hashes):
    require(isinstance(hashes, dict) and ROUTES <= hashes.keys() and len(hashes) <= 250,
            'Invalid or incomplete overlay file inventory')
    assets = []
    for name, digest in hashes.items():
        require(isinstance(digest, str) and KEY.fullmatch(digest), 'Invalid SHA-256 in inventory')
        match = ASSET.fullmatch(name)
        if match:
            require(match[1] == digest, 'Content-addressed asset hash mismatch: ' + name)
            assets.append(match[2])
        else:
            require(name in ROUTES or ARCHIVE.fullmatch(name), 'Path outside release scope: ' + name)
    require(sorted(assets) == ['app.js', 'style.css'], 'Expected one versioned script and one stylesheet')


def put(root, name, data, workspace):
    p = Path(name)
    parent = root
    for part in p.parts[:-1]:
        parent = parent / part
        directory(parent, 0o755)
    path = parent / p.name
    if exists(path):
        require(read(path) == data, 'A content-addressed file differs: ' + name)
    else:
        atomic_file(path, data, 0o644, workspace)


def tree_files(path):
    """Walk a protected tree, rejecting symlinks, hard links, special files and mounts."""
    inspect(path, stat.S_ISDIR)
    result = {}
    for entry in path.iterdir():
        require(not entry.is_mount(), 'Unexpected mount inside overlay: ' + str(entry))
        if stat.S_ISDIR(entry.lstat().st_mode):
            for name, leaf in tree_files(entry).items():
                result[entry.name + '/' + name] = leaf
        else:
            inspect(entry, stat.S_ISREG)
            result[entry.name] = entry
    return result


class Overlay:
    """The caller holds the host's release lock across stage, select and HTTP verification."""
    def __init__(self, base=BASE, state=STATE):
        self.base, self.state = Path(base), Path(state)
        for path in (self.base, self.state):
            require(path.is_absolute() and '..' not in path.parts and path != Path('/'), 'Expected fixed absolute path')
        require(self.base != self.state and self.base not in self.state.parents and self.state not in self.base.parents,
                'Overlay receipts must be outside the public tree')
        self.releases = self.base / 'releases'
        self.immutable = self.base / 'immutable'

    def validate(self):
        """Read-only, including a host on which no worker directories exist yet."""
        for path, mode in ((self.base, 0o755), (self.state, 0o700)):
            trusted(path)
            if not exists(path):
                continue
            require(stat.S_IMODE(path.stat().st_mode) == mode, 'Unexpected overlay mode: ' + str(path))
            marker = path / STAMP
            if exists(marker):
                inspect(marker, stat.S_ISDIR)
                require(not any(marker.iterdir()), 'Unrecognized overlay marker: ' + str(marker))
            else:
                require(not any(path.iterdir()), 'Refusing to adopt an existing directory: ' + str(path))
        if exists(self.base) and exists(self.base / STAMP):
            allowed = {STAMP, 'current', 'releases', 'immutable', 'work'}
            for path in self.base.iterdir():
                require(path.name in allowed, 'Unrecognized overlay entry: ' + str(path))
            for path in (self.releases, self.immutable):
                if exists(path):
                    inspect(path, stat.S_ISDIR)
        if exists(self.state):
            for path in self.state.iterdir():
                if path.name in {STAMP, 'work'}:
                    inspect(path, stat.S_ISDIR)
                    continue
                require(path.suffix == '.json' and KEY.fullmatch(path.stem),
                        'Unrecognized overlay receipt: ' + str(path))
                inspect(path, stat.S_ISREG)
        if exists(self.base / 'work'):
            inspect(self.base / 'work', stat.S_ISDIR)
        # Private service sandboxes may bind the storage roots themselves. Nested mounts
        # (including same-device bind mounts) must never be traversed or cleaned up.
        mountinfo = Path('/proc/self/mountinfo')
        if mountinfo.is_file():
            for line in mountinfo.read_text().splitlines():
                target = Path(re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split()[4]))
                require(self.base not in target.parents and self.state not in target.parents,
                        'Unexpected nested mount: ' + str(target))
        self._pointer()

    def _pointer(self):
        current = self.base / 'current'
        if not exists(current):
            return None
        info = current.lstat()
        require(stat.S_ISLNK(info.st_mode) and info.st_uid == ROOT_UID, 'Unsafe overlay selector')
        match = re.fullmatch(r'releases/([a-f0-9]{64})', os.readlink(current))
        require(match is not None, 'Unexpected overlay selector target')
        key = match[1]
        inspect(self.releases / key, stat.S_ISDIR)
        return key

    def current(self):
        self.validate()
        return self._pointer()

    def _initialize(self):
        self.validate()
        for p, mode in ((self.base, 0o755), (self.state, 0o700)):
            # Bootstrap owns the state parent. Never create missing general host directories.
            require(exists(p.parent), 'Missing protected parent: ' + str(p.parent))
            directory(p, mode)
            directory(p / STAMP, 0o700)
            work = p / 'work'
            directory(work, 0o700)
            # Only this serialized operation uses work. An interrupted write, switch or
            # retired release here is invisible to nginx and can safely be discarded.
            for abandoned in work.iterdir():
                require(re.fullmatch(r'\.(?:writing|stage|switch|retired)-[a-zA-Z0-9_-]+', abandoned.name),
                        'Unrecognized workspace entry: ' + str(abandoned))
                if abandoned.is_dir() and not abandoned.is_symlink():
                    shutil.rmtree(abandoned)
                else:
                    abandoned.unlink()
        directory(self.releases, 0o755)
        directory(self.immutable, 0o755)

    def _receipt(self, key):
        require(isinstance(key, str) and KEY.fullmatch(key), 'Invalid release identifier')
        data = read(self.state / (key + '.json'))
        require(sha(data) == key, 'Release receipt checksum mismatch')
        hashes = json.loads(data)['files']
        check_hashes(hashes)
        return hashes

    def files(self, key):
        self.validate()
        hashes = self._receipt(key)
        actual = tree_files(self.releases / key)
        require(set(actual) == {name for name in hashes if not ASSET.fullmatch(name)}, 'Release file inventory differs')
        for name, expected in hashes.items():
            if ASSET.fullmatch(name):
                path = self.immutable / name
                trusted(path.parent)
            else:
                path = actual[name]
            require(sha(read(path)) == expected, 'Stored release differs: ' + name)
        return hashes

    def _prune(self, keep):
        releases = []
        for path in self.releases.iterdir():
            inspect(path, stat.S_ISDIR)
            require(KEY.fullmatch(path.name), 'Unrecognized directory in release storage: ' + str(path))
            releases.append(path)
        releases.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
        retained = set(keep)
        for p in releases:
            if len(retained) < RETAIN_RELEASES:
                retained.add(p.name)
        for p in releases:
            if p.name not in retained:
                self.files(p.name)
                retired = self.base / 'work' / ('.retired-' + p.name)
                os.rename(p, retired)
                sync_dir(self.releases)
                sync_dir(retired.parent)
                shutil.rmtree(retired)
                (self.state / (p.name + '.json')).unlink()
                sync_dir(self.state)

    def stage(self, meta, files):
        require(isinstance(files, dict) and len(files) <= 250, 'Unexpected overlay release size')
        require(all(isinstance(x, bytes) and 0 < len(x) <= MAX_FILE for x in files.values()) and
                sum(map(len, files.values())) <= MAX_RELEASE, 'Overlay content exceeds size limit')
        hashes = {name: sha(data) for name, data in files.items()}
        check_hashes(hashes)
        receipt = encoded({'meta': meta, 'files': hashes})
        require(len(receipt) <= 128 * 1024, 'Release receipt too large')
        key = sha(receipt)
        self._initialize()
        published = self._pointer()
        if exists(self.releases / key):
            require(self.files(key) == hashes, 'Existing release differs')
            self._prune({key, published} - {None})
            return key
        pool = tree_files(self.immutable)
        require(all(ASSET.fullmatch(name) for name in pool), 'Unrecognized immutable asset')
        new_bytes = sum(len(data) for name, data in files.items() if ASSET.fullmatch(name) and name not in pool)
        require(sum(p.stat().st_size for p in pool.values()) + new_bytes <= MAX_POOL, 'Immutable asset retention limit reached')
        for name, data in files.items():
            if ASSET.fullmatch(name):
                put(self.immutable, name, data, self.base / 'work')
        # A private staging directory is outside nginx's allowed URI roots.
        with tempfile.TemporaryDirectory(dir=self.base / 'work', prefix='.stage-') as scratch:
            staging = Path(scratch) / 'content'
            directory(staging, 0o755)
            for name, data in files.items():
                if not ASSET.fullmatch(name):
                    put(staging, name, data, self.base / 'work')
            private = self.state / (key + '.json')
            if exists(private):
                require(read(private) == receipt, 'Conflicting receipt for release')
            else:
                atomic_file(private, receipt, 0o600, self.state / 'work')
            os.rename(staging, self.releases / key)
            sync_dir(self.releases)
        self.files(key)
        self._prune({key, published} - {None})
        return key

    def select(self, key):
        old = self.current()
        path = self.base / 'current'
        if key is not None:
            self.files(key)
        if old == key:
            return
        if key is None:
            path.unlink()
        else:
            with tempfile.TemporaryDirectory(dir=self.base / 'work', prefix='.switch-') as scratch:
                link = Path(scratch) / 'pointer'
                link.symlink_to('releases/' + key)
                os.replace(link, path)
        sync_dir(self.base)
