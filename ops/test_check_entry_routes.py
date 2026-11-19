import unittest
from check_entry_routes import inspect

class Headers:
    def __init__(self, content_type): self.content_type = content_type
    def get_content_type(self): return self.content_type
class Response:
    def __init__(self, status, url, content_type='text/html'):
        self.status=status; self.url=url; self.headers=Headers(content_type)
    def geturl(self): return self.url
    def read(self, n): return b'x'
    def __enter__(self): return self
    def __exit__(self,*args): return False
class Tests(unittest.TestCase):
    route=[{'id':'test','url':'https://kapukai.org/darpa/'}]
    def test_ok(self): self.assertEqual(inspect(self.route,lambda req,timeout:Response(200,req.full_url)),[])
    def test_404(self): self.assertEqual(len(inspect(self.route,lambda req,timeout:Response(404,req.full_url))),1)
    def test_wrong_host(self): self.assertEqual(len(inspect(self.route,lambda req,timeout:Response(200,'https://elsewhere.test/'))),1)
    def test_wrong_mime(self): self.assertEqual(len(inspect(self.route,lambda req,timeout:Response(200,req.full_url,'application/json'))),1)
    def test_network_error(self):
        def fail(req,timeout): raise OSError('offline')
        self.assertEqual(len(inspect(self.route,fail)),1)
if __name__=='__main__': unittest.main()
