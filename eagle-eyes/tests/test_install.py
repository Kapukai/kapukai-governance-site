import base64
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'install.py'
spec = importlib.util.spec_from_file_location('installer', SOURCE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name) / 'public_html'
        self.root.mkdir()
        (self.root / 'index.html').write_text('Kapukai existing home')
        (self.root / 'other.txt').write_text('preserve')
        self.files = {'eagle-eyes/index.html': b'public home', 'eagle-eyes/reference/index.html': b'public records'}

    def run_install(self, files=None):
        values = self.files if files is None else files
        payload = {'root':str(self.root),'source':'https://immutable.vercel.app','source_commit':'abc','deployment_id':'dpl_test','files':{name:{'data':base64.b64encode(data).decode(),'sha256':hashlib.sha256(data).hexdigest()} for name,data in values.items()}}
        return subprocess.run([sys.executable,'-c',installer.REMOTE],input=json.dumps(payload),text=True,capture_output=True)

    def unchanged(self):
        self.assertEqual((self.root/'index.html').read_text(),'Kapukai existing home')
        self.assertEqual((self.root/'other.txt').read_text(),'preserve')

    def test_install_and_exact_repeat(self):
        self.assertEqual(self.run_install().returncode,0)
        receipt=list(self.root.parent.glob('eagle-eyes-install-receipts/release-*.json'))
        self.assertEqual(len(receipt),1)
        self.assertTrue(json.loads(receipt[0].read_text())['hashes_verified'])
        self.assertEqual(self.run_install().returncode,0)
        self.assertEqual(len(list(self.root.parent.glob('eagle-eyes-install-receipts/release-*.json'))),1)
        self.unchanged()

    def test_conflict_is_preserved(self):
        (self.root/'eagle-eyes').mkdir()
        (self.root/'eagle-eyes/index.html').write_text('existing')
        self.assertNotEqual(self.run_install().returncode,0)
        self.assertEqual((self.root/'eagle-eyes/index.html').read_text(),'existing')
        self.unchanged()

    def test_extra_file_and_directory_rejected(self):
        self.assertEqual(self.run_install().returncode,0)
        (self.root/'eagle-eyes/extra').mkdir()
        self.assertNotEqual(self.run_install().returncode,0)
        (self.root/'eagle-eyes/extra').rmdir()
        (self.root/'eagle-eyes/extra').write_text('keep')
        self.assertNotEqual(self.run_install().returncode,0)
        self.unchanged()

    def test_traversal_and_wrong_prefix_rejected(self):
        for name in ['eagle-eyes/../outside.txt','other/index.html','/eagle-eyes/index.html','eagle-eyes//index.html','eagle-eyes/./index.html','eagle-eyes/a\\b']:
            with self.subTest(name=name):
                self.assertNotEqual(self.run_install({name:b'bad'}).returncode,0)
        self.assertFalse((self.root/'eagle-eyes').exists())
        self.unchanged()

    def test_symlink_rejected(self):
        target=pathlib.Path(self.temp.name)/'private'
        target.mkdir()
        (self.root/'eagle-eyes').symlink_to(target,target_is_directory=True)
        self.assertNotEqual(self.run_install().returncode,0)
        self.assertEqual(list(target.iterdir()),[])
        self.unchanged()

    def test_home_identity_required(self):
        (self.root/'index.html').write_text('unrelated site')
        self.assertNotEqual(self.run_install().returncode,0)
        self.assertFalse((self.root/'eagle-eyes').exists())

    def test_collision_rejected(self):
        values={**self.files,'eagle-eyes/reference':b'file conflicts with directory'}
        self.assertNotEqual(self.run_install(values).returncode,0)
        self.assertFalse((self.root/'eagle-eyes').exists())

if __name__=='__main__': unittest.main()
