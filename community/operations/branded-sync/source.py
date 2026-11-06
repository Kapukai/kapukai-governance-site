"""Prove a small public release against GitHub's commit and Vercel production."""
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

API = 'https://api.github.com/repos/Kapukai/kapukai-governance-site'
ALIAS = 'https://kapukai-community.vercel.app'
BRAND = 'https://kapukai.org'
PINNED = re.compile(r'https://kapukai-community-[a-z0-9]+-kapukais-projects\.vercel\.app')
ROUTES = {'join/index.html', 'newsletter/index.html', 'newsletter/archive/index.html'}
ARCHIVE = re.compile(r'newsletter/archive/[0-9]{4}-(?:0[1-9]|1[0-2])/(?:index\.html|[a-z0-9][a-z0-9-]{0,80}\.(?:png|jpg|webp))')
SCOPED = {'assets/community/app.js', 'assets/community/style.css'}
SHARED = re.compile(r'assets/community/favicon\.svg|share-cards/v1/(?:gold-k\.png|[a-z0-9-]+-[0-9a-f]{6}\.jpg)')
TYPES = {
    'html': {'text/html'}, 'css': {'text/css'}, 'js': {'application/javascript', 'text/javascript'},
    'png': {'image/png'}, 'jpg': {'image/jpeg'}, 'webp': {'image/webp'}, 'svg': {'image/svg+xml'},
}
MAX_FILE = 6 * 1024 * 1024
MAX_RELEASE = 64 * 1024 * 1024
CSS_DEP = re.compile(r'url\s*\(|@import\b|image-set\s*\(', re.I)


def require(ok, message):
    if not ok:
        raise ValueError(message)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected redirect from ' + req.full_url)


def download(url, allowed_types, limit=MAX_FILE):
    request = Request(url, headers={'User-Agent': 'Kapukai-branded-sync/1', 'Accept-Encoding': 'identity'})
    with build_opener(NoRedirect()).open(request, timeout=15) as response:
        require(response.status == 200 and response.headers.get_content_type() in allowed_types,
                'Unexpected response at ' + url)
        data = response.read(limit + 1)
        require(0 < len(data) <= limit, 'Unexpected file size at ' + url)
        return data


def api(path):
    return json.loads(download(API + path, {'application/json'}, 8 * 1024 * 1024))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def path_url(name):
    return '/' + (name[:-10] if name.endswith('/index.html') else name)


def release():
    ref = api('/git/ref/heads/main')['object']
    commit = ref['sha']
    require(ref['type'] == 'commit' and re.fullmatch('[0-9a-f]{40}', commit), 'Unexpected main ref')
    query = '/deployments?sha=' + commit + '&environment=Production&per_page=10'
    for deployment in api(query):
        if (deployment['environment'] != 'Production' or deployment['sha'] != commit
                or deployment['creator']['login'] != 'vercel[bot]'):
            continue
        number = deployment['id']
        require(isinstance(number, int), 'Invalid GitHub deployment ID')
        statuses = api('/deployments/%d/statuses?per_page=1' % number)
        if statuses:
            status = statuses[0]
            origin = (status.get('environment_url') or '').rstrip('/')
            if (status['state'] == 'success' and status['creator']['login'] == 'vercel[bot]'
                    and PINNED.fullmatch(origin)):
                return commit, number, origin
    raise ValueError('Waiting for a successful kapukai-community production deployment of main')


def public_tree(commit):
    listing = api('/git/trees/' + commit + '?recursive=1')
    require(listing.get('truncated') is False, 'Incomplete GitHub release tree')
    files = {}
    for item in listing['tree']:
        if item['path'].startswith('community/public/') and item['type'] != 'tree':
            files[item['path'][len('community/public/'):]] = item
    return files


def read_verified(name, tree, origin=ALIAS):
    item = tree.get(name, {})
    size = item.get('size', 0)
    require(item.get('type') == 'blob' and item.get('mode') == '100644'
            and 0 < size <= MAX_FILE, 'Unexpected Git file type or size: ' + name)
    data = download(origin + path_url(name), TYPES[name.rsplit('.', 1)[-1]], size)
    git_sha = hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()
    require(git_sha == item['sha'], 'Public bytes differ from the Git release: ' + origin + path_url(name))
    return data


class Assets(HTMLParser):
    """Collect browser-loaded resources; preserve every other byte of the page."""
    def __init__(self, name, data, selected, aliases):
        super().__init__(convert_charrefs=True)
        self.url = BRAND + path_url(name)
        self.source = data.decode('utf-8')
        self.lines = [0] + [m.end() for m in re.finditer('\n', self.source)]
        self.selected = selected
        self.aliases = aliases
        self.shared = set()
        self.edits = []
        self.canonicals = []
        self.style = False
        self.feed(self.source)
        self.close()
        require(self.canonicals == [self.url], 'Missing or conflicting branded canonical at ' + self.url)

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        require(len(attrs) == len(attr), 'Duplicate HTML attribute at ' + self.url)
        require(tag not in {'base', 'object', 'embed', 'iframe', 'frame', 'video', 'audio', 'source', 'track'},
                'Unsupported embedded resource at ' + self.url)
        require(not set(attr) & {'srcset', 'imagesrcset', 'background', 'poster', 'manifest', 'srcdoc'},
                'Unsupported resource attribute at ' + self.url)
        require(not CSS_DEP.search(attr.get('style') or ''), 'Unsupported inline CSS dependency at ' + self.url)
        self.style = tag == 'style'
        if tag == 'meta':
            require((attr.get('http-equiv') or '').lower() != 'refresh', 'Unexpected redirect at ' + self.url)
            if (attr.get('property') or attr.get('name')) in {'og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'}:
                self.asset(tag, 'content', attr.get('content'))
        elif tag == 'a' and attr.get('href'):
            target = urlsplit(urljoin(self.url, attr['href']))
            if (target.scheme == 'https' and target.netloc in {urlsplit(BRAND).netloc, urlsplit(ALIAS).netloc}
                    and target.path.startswith('/newsletter/archive/')):
                name = target.path.lstrip('/')
                if target.path.endswith('/'):
                    name += 'index.html'
                require(name in self.selected, 'Broken archive link at ' + self.url + ': ' + target.path)
        elif tag == 'link':
            if attr.get('rel') == 'canonical':
                self.canonicals.append(attr.get('href'))
            else:
                require(attr.get('rel') in {'stylesheet', 'icon', 'apple-touch-icon'}, 'Unverified link resource at ' + self.url)
                self.asset(tag, 'href', attr.get('href'))
        elif tag == 'script':
            require(attr.get('type') in {None, 'text/javascript', 'application/javascript'}
                    and attr.get('src') == '/assets/community/app.js', 'Unexpected executable script at ' + self.url)
            self.asset(tag, 'src', attr['src'])
        elif 'src' in attr:
            require(tag in {'img', 'input'}, 'Unverified src resource at ' + self.url)
            self.asset(tag, 'src', attr['src'])
        elif tag in {'use', 'image'}:
            raise ValueError('Unsupported embedded SVG reference at ' + self.url)

    def handle_endtag(self, tag):
        if tag == 'style':
            self.style = False

    def handle_data(self, data):
        if self.style:
            require(not CSS_DEP.search(data), 'Unsupported inline CSS dependency at ' + self.url)

    def asset(self, tag, key, raw):
        require(isinstance(raw, str) and raw and not re.search(r'[\x00-\x20\\%]', raw),
                'Unsupported asset URL at ' + self.url)
        parsed = urlsplit(urljoin(self.url, raw))
        require(parsed.scheme == 'https' and parsed.netloc in {urlsplit(ALIAS).netloc, urlsplit(BRAND).netloc}
                and not parsed.fragment and not parsed.query, 'External or variable asset at ' + self.url)
        name = parsed.path.lstrip('/')
        if name in self.aliases:
            require((tag, key, raw) in {('script', 'src', '/assets/community/app.js'),
                                       ('link', 'href', '/assets/community/style.css')},
                    'Unexpected shared asset binding at ' + self.url)
            # Replace the literal attribute only within this start tag, keeping the original HTML intact.
            original_tag = self.get_starttag_text()
            pattern = r'''(?i)\s''' + key + r'''\s*=\s*(["'])(''' + re.escape(raw) + r''')\1'''
            matches = list(re.finditer(pattern, original_tag))
            require(len(matches) == 1 and original_tag.count(raw) == 1, 'Ambiguous asset attribute at ' + self.url)
            line, column = self.getpos()
            start = self.lines[line - 1] + column + matches[0].start(2)
            self.edits.append((start, start + len(raw), '/' + self.aliases[name]))
        elif SHARED.fullmatch(name):
            self.shared.add(name)
        else:
            require(name in self.selected and ARCHIVE.fullmatch(name) and not name.endswith('html'),
                    'Unverified asset at ' + self.url + ': ' + name)

    def rewritten(self):
        result = self.source
        for start, end, dest in reversed(self.edits):
            result = result[:start] + dest + result[end:]
        return result.encode('utf-8')


def prepare():
    commit, number, deployment = release()
    tree = public_tree(commit)
    selected = ROUTES | {name for name in tree if name.startswith('newsletter/archive/')}
    require(all(name in ROUTES or ARCHIVE.fullmatch(name) for name in selected),
            'An archive file has a type or path that needs operator review')
    items = sorted(selected | SCOPED)
    require(len(items) <= 250 and sum(tree.get(name, {}).get('size', 0) for name in items) <= MAX_RELEASE,
            'Release exceeds the supported size; review before installing')
    with ThreadPoolExecutor(max_workers=6) as pool:
        data = dict(zip(items, pool.map(lambda name: read_verified(name, tree), items)))
        require(not CSS_DEP.search(data['assets/community/style.css'].decode()), 'Shared stylesheet gained dependencies')
        require(not re.search(r'\b(?:import\b\s*(?:\(|\{|\*|\w|["\'])|import\.meta|document\.currentScript|new\s+(?:Shared)?Worker\s*\()',
                              data['assets/community/app.js'].decode()),
                'Shared script gained a dependency relative to its own URL')
        aliases = {name: 'newsletter/_community-assets/' + sha256(data[name]) + '/' + PurePosixPath(name).name
                   for name in SCOPED}
        files = {aliases[name]: data[name] for name in SCOPED}
        shared = set()
        for name in sorted(selected):
            if name.endswith('.html'):
                page = Assets(name, data[name], selected, aliases)
                files[name] = page.rewritten()
                shared.update(page.shared)
            else:
                files[name] = data[name]
        require(len(shared) <= 40, 'Too many shared site assets')
        # Both original hosts must already serve the matching shared resources.
        names = sorted(shared)
        verified = list(pool.map(lambda name: read_verified(name, tree, ALIAS), names))
        list(pool.map(lambda name: read_verified(name, tree, BRAND), names))
    metadata = {'commit': commit, 'deployment': deployment, 'github_deployment_id': number, 'alias': ALIAS,
                'source_sha256': {name: sha256(contents) for name, contents in data.items()},
                'shared_sha256': dict(zip(names, map(sha256, verified)))}
    return metadata, files
