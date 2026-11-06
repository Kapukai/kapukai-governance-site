from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('monitor',Path(__file__).resolve().parents[1]/'ops/check-production-routes.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class ProductionRoutes(unittest.TestCase):
    def setUp(self):
        self.f=tempfile.TemporaryDirectory();self.addCleanup(self.f.cleanup);self.root=Path(self.f.name)
        self.config={'managed':['/join/','/newsletter/archive/'],'monthly_archive':'/newsletter/archive/',
                     'branded':'https://brand.example','reference':'https://ref.example'}
        self.pages={};self.asset=b'body{color:navy}';self.digest=hashlib.sha256(self.asset).hexdigest()
        for path,title in [('/join/','Join'),('/newsletter/archive/','Editions'),('/newsletter/archive/2027-01/','January')]:
            html=('<title>'+title+'</title><link rel="canonical" href="https://brand.example'+path+'">'
                  '<link rel="stylesheet" href="/assets/community/style.css"><main><h1>'+title+'</h1>'
                  '<a href="/newsletter/archive/2027-01/">January</a><form><input name="topic"></form></main>')
            out=self.root/path.strip('/')/'index.html';out.parent.mkdir(parents=True);out.write_text(html)
            for base in ['https://ref.example','https://brand.example']: self.pages[base+path]=html.encode()
        out=self.root/'assets/community/style.css';out.parent.mkdir(parents=True);out.write_bytes(self.asset)
        for base in ['https://ref.example','https://brand.example']:self.pages[base+'/assets/community/style.css']=self.asset

    def check(self):
        def get(url,expected,html):
            if url not in self.pages: raise ValueError('404')
            return self.pages[url]
        with redirect_stdout(io.StringIO()): return m.run(self.config,self.root,get)

    def test_ok_and_discovery(self):
        self.assertEqual(self.check(),[]);self.assertIn('/newsletter/archive/2027-01/',m.published_routes(self.config,self.root))
    def test_soft_404(self):
        self.pages['https://brand.example/join/']=b'<main><h1>Not found</h1></main>';self.assertTrue(self.check())
    def test_cta_drift(self):
        k='https://brand.example/join/'
        self.pages[k]=self.pages[k].replace(b'href="/newsletter/archive/2027-01/"',b'href="/unknown"')
        self.assertTrue(self.check())
    def test_html_instead_of_asset(self):
        self.pages['https://brand.example/assets/community/style.css']=b'<html>OK</html>';self.assertTrue(self.check())
    def test_scoped_files_verified_by_bytes_and_url(self):
        key='https://brand.example/join/';alias='/newsletter/_community-assets/'+self.digest+'/style.css'
        self.pages[key]=self.pages[key].replace(b'/assets/community/style.css',alias.encode())
        self.pages['https://brand.example'+alias]=self.asset;self.assertEqual(self.check(),[])
        self.pages['https://brand.example'+alias]=b'wrong';self.assertTrue(self.check())
        self.pages[key]=self.pages[key].replace(self.digest.encode(),b'0'*64);self.assertTrue(self.check())
    def test_months_require_archive_index_links(self):
        p=self.root/'newsletter/archive/index.html';p.write_text(p.read_text().replace('href="/newsletter/archive/2027-01/"','href="/"'))
        self.assertTrue(any('missing issue' in e for e in self.check()))
    def test_observe_only_missing(self):
        self.config['observe_only']=['/evidence/decision-failures/']
        self.assertTrue(any('monitor only' in e for e in self.check()))
    def test_redirects(self):
        base='https://kapukai.org/join/'
        for bad in ['https://kapukai-community.vercel.app/join/', 'https://kapukai.org/', 'http://kapukai.org/join/', 'https://kapukai.org/join/?next=elsewhere']:
            self.assertFalse(m.same_destination(bad,base))
        self.assertTrue(m.same_destination('https://kapukai.org/join',base))

    def test_inventory_exposes_uncovered_and_external(self):
        self.config['outside_this_mirror']={'/bills/':'external'}
        r=m.inventory(self.config,self.root,{'files':{'other/index.html':'sha','join/index.html':'sha'}})
        self.assertIn('/other/',r['release manifest entries outside checks']);self.assertIn('/bills/',r['separate publisher'])
