"""Narrow, reversible nginx configuration cutover for the branded static overlay."""
import contextlib
import dataclasses
import fcntl
import glob
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time

BASE = Path('/etc/nginx')
OVERLAY = '/srv/kapukai-branded-sync/current'
IMMUTABLE = '/srv/kapukai-branded-sync/immutable'
MARKER = '# Managed by kapukai-branded-sync v2'
MONTH = r'[0-9]{4}-(?:0[1-9]|1[0-2])'
ISSUE = r'/newsletter/archive/' + MONTH + '/'
IMAGE = r'[a-z0-9][a-z0-9-]{0,80}[.](?:png|jpg|webp)'
ASSET = r'/newsletter/_community-assets/[0-9a-f]{64}/(?:app[.]js|style[.]css)'
FIXED = ('/join/', '/newsletter/', '/newsletter/archive/')
EXACT = {route: p+'index.html' for p in FIXED for route in (p[:-1],p,p+'index.html')}
BLOCKS = [(f'= {route}', OVERLAY, index) for route, index in EXACT.items()]
BLOCKS += [(f'~ "^{ISSUE[:-1]}$"', OVERLAY, '${uri}/index.html'),
           (f'~ "^{ISSUE}$"', OVERLAY, '${uri}index.html'),
           (f'~ "^{ISSUE}(?:index[.]html|{IMAGE})$"', OVERLAY, '$uri'),
           (f'~ "^{ASSET}$"', IMMUTABLE, '$uri')]
def location(key, root, path):
    if key in ('= /join', '= /newsletter', '= /newsletter/archive', f'~ "^{ISSUE[:-1]}$"'):
        body = '        absolute_redirect off;\n        return 308 $uri/$is_args$args;\n'
    else:
        body = '        root ' + root + ';\n        try_files ' + path + ' =404;\n'
    return '    location ' + key + ' {\n' + body + '    }\n'


SNIPPET = '\n    ' + MARKER + '\n' + ''.join(location(*block) for block in BLOCKS) + '    # End kapukai-branded-sync v2\n'


def ensure(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


@dataclasses.dataclass
class Directive:
    words: list
    children: list
    path: Path
    insert: int = -1
    raw: str = ''


# Retain PCRE backslashes, quoted braces, comments, and braced nginx variables.
LEX = re.compile(r"""\s+|\#[^\n]*|[;{}]|(?:(?:\$\{[a-zA-Z0-9_]+\})|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[^\s;{}"'\\\#])+""", re.S)


def directives(path, source):
    stack = [[]]
    words = []
    cursor = 0
    start = 0
    for m in LEX.finditer(source):
        ensure(m.start() == cursor, 'Unsupported nginx syntax in ' + str(path))
        cursor = m.end()
        token = m.group()
        if token.isspace() or token.startswith('#'):
            continue
        if token == '}':
            ensure(len(stack) > 1 and not words, 'Unbalanced nginx block in ' + str(path))
            stack.pop()
        elif token in (';', '{'):
            ensure(words, 'Empty nginx directive in ' + str(path))
            node = Directive(words, [], path, m.end() if token == '{' else -1, source[start:m.end()])
            stack[-1].append(node)
            if token == '{':
                stack.append(node.children)
            words = []
        else:
            if not words:
                start = m.start()
            if token[:1] in ('"', "'"):
                ensure(token[-1:] == token[:1], 'Unsupported compound nginx token')
                token = token[1:-1]
            words.append(token)
    ensure(cursor == len(source) and len(stack) == 1 and not words, 'Incomplete nginx file ' + str(path))
    return stack[0]


def inside(path, root):
    return path == root or root in path.parents


def trusted_file(path, base):
    # The sites-enabled entry may be a relative or absolute symlink to sites-available.
    ensure(path.is_absolute() and '..' not in path.parts and inside(path, base), 'Unexpected nginx config path')
    actual = path.resolve(strict=True)
    ensure(inside(actual, base), 'Nginx configuration links outside ' + str(base))
    for side in (path, actual):
        for p in reversed(side.parents):
            if base == BASE or inside(p, base):
                st = p.lstat()
                ensure(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022,
                       'Untrusted nginx directory: ' + str(p))
    if path.is_symlink():
        ensure(path.lstat().st_uid == 0 and path.parent.name == 'sites-enabled' and actual.parent == base/'sites-available',
               'Unsupported nginx location symlink: ' + str(path))
        # No further symlink chains, including intermediate symlink directories.
        next_path = Path(os.path.normpath(path.parent/os.readlink(path)))
        ensure(next_path == actual, 'Indirect nginx configuration symlink: ' + str(path))
    st = actual.lstat()
    ensure(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_uid == 0 and not st.st_mode & 0o022,
           'Untrusted nginx config file: ' + str(actual))
    return actual


class Dump:
    def __init__(self, raw, base):
        self.base = base
        markers = list(re.finditer(rb'^# configuration file (/[^\r\n]+):\r?\n', raw, re.M))
        self.files = {}
        self.parse_cache = {}
        self.original = {}
        self.fallback_headers = []
        ensure(markers and len(markers) < 2048, 'Unsupported or oversized nginx configuration dump')
        for i, match in enumerate(markers):
            path = Path(os.fsdecode(match[1]))
            ensure(path not in self.files, 'Duplicate nginx configuration dump path')
            self.files[path] = raw[match.end():markers[i + 1].start() if i + 1 < len(markers) else None]

    def nodes(self, path):
        if path not in self.parse_cache:
            # The dump can mention distro modules outside /etc/nginx. Only open configuration
            # files traversed while establishing the HTTP server or checking its effective locations.
            certbot = self.base == BASE and path == Path('/etc/letsencrypt/options-ssl-nginx.conf')
            actual = trusted_file(path, path.parent if certbot else self.base)
            if certbot:
                for parent in path.parents:
                    st = parent.lstat()
                    ensure(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022,
                           'Unsafe Certbot nginx options directory')
            source = actual.read_bytes()
            self.original[actual] = source
            ensure(path in self.files and self.files[path] in (source, source + b'\n', source + b'\n\n'),
                   'Nginx dump differs from disk: ' + str(path))
            parsed = directives(path, source.decode('utf-8'))
            if certbot:
                ensure(all(n.words[0].startswith('ssl_') and n.insert == -1 for n in parsed), 'Unrecognized Certbot options')
            self.parse_cache[path] = parsed
        return self.parse_cache[path]

    def expand(self, nodes, seen=()):
        for node in nodes:
            if node.words[0] != 'include':
                yield node
                continue
            ensure(len(node.words) == 2 and '$' not in node.words[1], 'Unsupported dynamic nginx include')
            pattern = Path(node.words[1])
            if not pattern.is_absolute():
                pattern = self.base/pattern
            # Resolve from the loaded dump, never assume a missing include is harmless.
            included = [Path(x) for x in sorted(glob.glob(str(pattern)))]
            for path in included:
                ensure(path in self.files and path not in seen and len(seen) < 20,
                       'Cannot verify active nginx include: ' + str(path))
                yield from self.expand(self.nodes(path), seen + (path,))

    def select(self):
        # Only nginx/http can own a TLS website. Ignore stream, mail and unrelated main-context includes.
        main = self.nodes(self.base/'nginx.conf')
        ensure(all(n.words[0] != 'include' or n.words[1].startswith(('/etc/nginx/modules-enabled/', 'modules-enabled/'))
                   for n in main), 'Unrecognized main-context include; review the active nginx layout')
        http = [n for n in main if n.words == ['http']]
        ensure(len(http) == 1, 'Cannot identify one active HTTP configuration')
        matches = []
        for server in self.expand(http[0].children):
            if server.words != ['server']:
                continue
            # Expand direct includes only for candidate vhosts. Unrelated sibling vhosts can use
            # externally managed certificate/SSL snippets outside our configuration boundary.
            direct_names = [a for n in server.children if n.words[0]=='server_name' for a in n.words[1:]]
            if direct_names and 'kapukai.org' not in direct_names:
                continue
            children = list(self.expand(server.children))
            names = [a for n in children if n.words[0]=='server_name' for a in n.words[1:]]
            if 'kapukai.org' not in names:
                continue
            listeners = [n.words[1:] for n in children if n.words[0]=='listen']
            tls = [x for x in listeners if x and 'ssl' in x[1:] and (x[0]=='443' or x[0].endswith(':443'))]
            if not tls:
                continue
            ensure(set(names) <= {'kapukai.org','www.kapukai.org'}, 'TLS vhost serves additional named domains; review the route manually')
            ensure(all(x in tls for x in listeners), 'TLS vhost also handles other ports; review the route manually')
            matches.append((server, children))
        ensure(len(matches) == 1, 'Expected one dedicated kapukai.org HTTPS vhost on port 443')
        server, children = matches[0]
        for node in children:
            if node.words[0] in ('if','return','rewrite'):
                raise ValueError('Server-wide rewrite precedes route locations; review before changing nginx')
            if node.words == ['location', '/']:
                for fallback in self.expand(node.children):
                    ensure(fallback.words[0] in ('root','index','try_files','add_header','access_log','log_not_found',
                           'expires','autoindex') and fallback.insert == -1,
                           'Fallback location has its own access or request handling; manual route review required')
                    if fallback.words[0] in ('add_header','expires'):
                        self.fallback_headers.append(fallback.raw)
            elif node.words[0] == 'location':
                check_location(node)
        return trusted_file(server.path, self.base), server.insert


def check_location(node):
    args = node.words[1:]
    ensure(len(args) in (1,2), 'Unsupported nginx location')
    kind, pattern = ('', args[0]) if len(args) == 1 else args
    if kind in ('=', '', '^~'):
        ensure(re.fullmatch(r'[/@a-zA-Z0-9_.:-]+', pattern), 'Unrecognized literal nginx location')
    if pattern.startswith('@'):
        return
    if kind == '=':
        if pattern not in EXACT and not re.fullmatch(ISSUE[:-1]+'|'+ISSUE+'(?:index[.]html|'+IMAGE+')?|'+ASSET, pattern):
            return
    elif kind in ('', '^~'):
        if pattern == '/' and kind == '' and not any(n.words[0] in ('include','location') for n in node.children):
            return
        # Safely distinguish entire path components. Prefixes shorter than a root
        # (e.g. /new) and arbitrary existing children of archive/assets could overlap.
        families = ('/join/', '/newsletter/')
        if not any(p.startswith(pattern) for p in families):
            if not any(pattern.startswith(p) or p.startswith(pattern)
                       for p in ('/newsletter/archive/', '/newsletter/_community-assets/')):
                return
        # A sibling such as /newsletter/policy/ is outside the owned families.
    elif kind in ('~', '~*'):
        # Only accept cases whose literal anchored prefix proves disjointness, or
        # widely used generic hidden/PHP denial expressions that cannot match our files.
        match = re.match(r'^\^(/[A-Za-z0-9_-]+/)', pattern)
        if match and not re.search(r'(?<!\\)\|', pattern):
            prefix = match[1].lower()
            if not any(prefix.startswith(s) or s.startswith(prefix) for s in ('/join/','/newsletter/')):
                return
        if pattern in (r'/\.ht', r'/\.', r'/\.(?!well-known)', r'\.php$', r'\.php(?:$|/)', r'\.php(/|$)'):
            return
    raise ValueError('Existing nginx location could overlap branded pages: ' + pattern)


def command(args, capture=False):
    run = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45, check=False)
    if args[0].endswith('/nginx') and re.search(rb'conflicting server name "(?:www[.])?kapukai[.]org"', run.stderr):
        raise RuntimeError('Conflicting nginx server names for the branded domain; review before changing routes.')
    if run.returncode:
        # A raw nginx -T/log may contain private configuration or keys. Surface only an actionable location.
        match = re.search(rb'(?:in |open\(\) ")(/etc/nginx/[^\s":]+)(?::([0-9]+))?', run.stderr)
        where = (' (' + os.fsdecode(match[1]) + (':' + os.fsdecode(match[2]) if match[2] else '') + ')') if match else ''
        raise RuntimeError(' '.join(args[:2]) + ' failed' + where + '. Inspect nginx -t on the host before continuing.')
    return run.stdout if capture else b''


def atomic(path, data, mode=0o600, gid=None):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.kapukai-route-')
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(data)
            if gid is not None:
                os.fchown(out.fileno(), 0, gid)
            os.fchmod(out.fileno(), mode)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
        fsync_dir(path.parent)
    finally:
        Path(name).unlink(missing_ok=True)


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class Routes:
    def __init__(self, state, base=BASE):
        self.state = Path(state)/'nginx-route'
        self.base = Path(base)
        self.receipt = self.state/'current.json'

    def _test(self):
        command(['/usr/sbin/nginx', '-t'])

    def _dump(self):
        command(['/usr/bin/systemctl', 'is-active', '--quiet', 'nginx.service'])
        # Refuse a custom executable or non-default production configuration prefix.
        pid = command(['/usr/bin/systemctl','show','nginx.service','-p','MainPID','--value'], True).decode().strip()
        ensure(pid.isdigit() and int(pid) > 1, 'No running nginx master')
        proc = Path('/proc')/pid
        title = (proc/'cmdline').read_bytes().replace(b'\x00',b' ').decode(errors='replace')
        ensure((proc/'exe').resolve()==Path('/usr/sbin/nginx').resolve() and 'nginx: master process' in title
               and not re.search(r'(?:^|\s)-[cp]', title),
               'Nonstandard nginx executable, config or prefix; review the service before cutover')
        raw = command(['/usr/sbin/nginx', '-T'], True)
        ensure(len(raw) < 12*1024*1024, 'Nginx configuration exceeds review limit')
        return Dump(raw, self.base)

    def _reload(self):
        command(['/usr/bin/systemctl','reload','nginx.service'])

    def _save(self, r):
        atomic(self.receipt, json.dumps(r, indent=2).encode() + b'\n')

    def _record(self):
        if not self.receipt.exists():
            return None
        return json.loads(self.receipt.read_text())

    def _files(self, r):
        dest = trusted_file(Path(r['path']), self.base)
        backup = self.state/r['backup']
        ensure(re.fullmatch(r'nginx-[0-9]+[.]bak', r['backup']) and digest(backup.read_bytes()) == r['before'],
               'Nginx backup checksum mismatch')
        ensure(digest(dest.read_bytes()) in (r['before'], r['after']), 'Nginx site changed outside the installer; review before continuing')
        return dest, backup

    @contextlib.contextmanager
    def _lock(self):
        self.state.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.state.lstat()
        ensure(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not info.st_mode & 0o077, 'Untrusted route state directory')
        with (self.state/'lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def active(self):
        r = self._record()
        if not r:
            return False
        dest, _ = self._files(r)
        if r['phase'] != 'active':
            return False
        ensure(digest(dest.read_bytes()) == r['after'], 'Managed nginx configuration is no longer installed')
        return True

    def baseline(self):
        self._test()
        r = self._record()
        if r:
            self._files(r)
            if r['phase'] == 'active':
                ensure(self.active(), 'Managed routes no longer match the installed release')
            return
        dump = self._dump()
        path, _ = dump.select()
        ensure(MARKER not in path.read_text(), 'A managed marker exists without its rollback record')

    @staticmethod
    def _replace(dest, data, expected):
        st = dest.lstat()
        ensure(digest(dest.read_bytes()) == expected, 'Nginx vhost changed during cutover')
        atomic(dest, data, stat.S_IMODE(st.st_mode), st.st_gid)

    def _restore(self, r):
        dest, backup = self._files(r)
        # If initial candidate validation failed, nginx never received a reload signal.
        # An interruption around the signal is recorded beforehand and requires a verified rollback reload.
        reload_needed = r.get('rollback_reload', r['phase'] != 'installing')
        r.update(phase='restoring', rollback_reload=reload_needed)
        self._save(r)
        if digest(dest.read_bytes()) == r['after']:
            self._replace(dest, backup.read_bytes(), r['after'])
        self._test()
        if reload_needed:
            self._reload()
        self.receipt.unlink()
        fsync_dir(self.state)

    def deactivate(self):
        with self._lock():
            r = self._record()
            if r:
                self._restore(r)

    def activate(self):
        with self._lock():
            r = self._record()
            if r:
                if self.active():
                    self._test()
                    return
                self._restore(r)
            self._test()
            dump = self._dump()
            dest, index = dump.select()
            before = dest.read_bytes()
            source = before.decode('utf-8')
            ensure(before == dump.original[dest], 'Nginx vhost changed during inspection')
            ensure(MARKER not in source, 'Nginx route already exists without its rollback record')
            snippet = SNIPPET
            if dump.fallback_headers:
                headers = ''.join('        ' + text + '\n' for text in dump.fallback_headers)
                snippet = snippet.replace('        try_files ', headers + '        try_files ').replace('        return 308 ', headers + '        return 308 ')
            after = (source[:index] + snippet + source[index:]).encode()
            name = 'nginx-' + str(time.time_ns()) + '.bak'
            atomic(self.state/name, before)
            r = {'path':str(dest), 'before':digest(before), 'after':digest(after), 'backup':name, 'phase':'installing'}
            self._save(r)
            try:
                self._replace(dest, after, r['before'])
                self._test()
                second = self._dump()
                ensure(second.files.keys() == dump.files.keys(), 'Active nginx includes changed during cutover')
                for path, data in dump.files.items():
                    if path.resolve() == dest:
                        ensure(second.files[path] in (after, after+b'\n', after+b'\n\n'), 'Unexpected candidate nginx dump')
                    else:
                        ensure(second.files[path] == data, 'Unrelated nginx configuration changed; stopping before reload')
                r['phase'] = 'reloading'
                self._save(r)
                self._reload()
            except BaseException:
                self._restore(r)
                raise
            r['phase'] = 'active'
            self._save(r)
