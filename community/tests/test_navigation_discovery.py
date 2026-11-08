import unittest
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self.scripts=[]; self.robots=[]; self.ids=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='a' and 'href' in a:self.links.append(a['href'])
        if tag=='script' and 'src' in a:self.scripts.append(a['src'])
        if tag=='meta' and a.get('name')=='robots':self.robots.append(a.get('content',''))
        if 'id' in a:self.ids.append(a['id'])

class NavigationDiscovery(unittest.TestCase):
    def test_member_privacy_and_menu(self):
        text=(PUBLIC/'community/members/index.html').read_text(); p=Links();p.feed(text)
        self.assertTrue(any('noindex' in r for r in p.robots))
        self.assertIn('/community/sitemap/',p.links)
        self.assertIn('https://kapukai.org/bills/michigan/',p.links)
        self.assertIn('/assets/community/navigation.js',p.scripts)
        self.assertEqual(len(p.ids),len(set(p.ids)))
        self.assertNotIn('class="community-bar"',text)
        self.assertNotIn('class="learning-navigation"',text)
    def test_sitemap_excludes_private_and_resolves(self):
        root=ET.parse(PUBLIC/'community/sitemap.xml').getroot()
        urls=[el.text for el in root.findall('.//{*}loc')]
        self.assertEqual(len(urls),len(set(urls)))
        for url in urls:
            self.assertTrue(url.startswith('https://kapukai.org/'))
            path=urlsplit(url).path
            self.assertFalse(path.startswith(('/confirm/','/community/apply/','/community/members/','/community/operate/')))
            self.assertTrue((PUBLIC/path.lstrip('/')/'index.html').is_file(),url)
        self.assertIn('https://kapukai.org/community/sitemap/',urls)
        self.assertIn('https://kapukai.org/newsletter/archive/',urls)
    def test_directory_links_and_nav_assets(self):
        p=Links();p.feed((PUBLIC/'community/sitemap/index.html').read_text())
        for href in p.links:
            if not href.startswith('/'):continue
            path=urlsplit(href).path;target=PUBLIC/path.lstrip('/')
            if path.endswith('/'):target=target/'index.html'
            self.assertTrue(target.is_file(),href)
        for filename in ['navigation.js','navigation.css']:
            self.assertTrue((PUBLIC/'assets/community'/filename).is_file())

if __name__=='__main__':unittest.main()
