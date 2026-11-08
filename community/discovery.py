"""Build public HTML/XML discovery from shared navigation and generated pages."""
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(); self.canonical = None; self.excluded = False; self.in_title = False; self.title = ''
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and a.get('rel') == 'canonical': self.canonical = a.get('href')
        if tag == 'meta' and (a.get('http-equiv', '').lower() == 'refresh' or (a.get('name') == 'robots' and 'noindex' in a.get('content', ''))): self.excluded = True
        if tag == 'title': self.in_title = True
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
    def handle_data(self, data):
        if self.in_title: self.title += data

def build_discovery(page, output, origin):
    from navigation import NAV_GROUPS
    # Membership sign-in can be linked in menus without indexing private workflows.
    private = ('/confirm/', '/community/apply/', '/community/operate/', '/community/members/')
    def inventory():
        found = {}
        for f in sorted(output.rglob('index.html')):
            meta = Metadata(); meta.feed(f.read_text())
            url = meta.canonical
            if meta.excluded or not url or not url.startswith(origin + '/') or urlsplit(url).path.startswith(private): continue
            route = '/' + f.relative_to(output).as_posix().removesuffix('index.html')
            if urlsplit(url).path != route: continue
            found[route] = meta.title.removesuffix(' | Kapukai')
        return found
    pages = inventory()
    body = '<p class="eyebrow">Explore Kapukai</p><h1>Find your next step.</h1><p class="lede">Browse tools, research, learning and ways to take part. Public resources are separate from member access and private application links.</p><div class="cards">'
    listed = set()
    for group in NAV_GROUPS:
        body += '<section class="panel"><h2>' + escape(group['label']) + '</h2><ul class="simple-list">'
        for link in group['links']:
            # Links are intentionally curated; do not infer readiness from membership.
            href, label = link['href'], link['label']
            listed.add(href)
            body += '<li><a href="' + escape(href, quote=True) + '">' + escape(label) + '</a></li>'
        body += '</ul></section>'
    body += '</div><section class="section-block"><h2>More public pages</h2><ul class="simple-list">'
    for route, title in pages.items():
        if route not in listed and route != '/community/sitemap/':
            body += '<li><a href="' + escape(route, quote=True) + '">' + escape(title) + '</a></li>'
    body += '</ul></section><p class="small">Looking for something missing? <a href="/community/contact/">Contact the lab</a>. <a href="/community/sitemap.xml">Public-page XML sitemap</a>.</p>'
    page('community/sitemap', 'Explore Kapukai — site directory', 'Find Kapukai tools, research, bills and companions, learning, community opportunities and contact information.', body, False)
    pages = inventory()
    ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    root = ET.Element(ns + 'urlset')
    for route in pages:
        item = ET.SubElement(root, ns + 'url'); ET.SubElement(item, ns + 'loc').text = origin + route
    ET.ElementTree(root).write(output/'community/sitemap.xml', encoding='utf-8', xml_declaration=True)
    return len(pages)
