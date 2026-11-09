import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('marketplace_install', BASE / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
CONTENT = (BASE.parent / 'community/public/marketplace/index.html').read_bytes()


class InstallationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = Path(self.temp.name)
        self.root = self.parent / 'public_html'
        self.root.mkdir()
        (self.root / 'index.html').write_text('Existing Kapukai homepage')
        (self.root / 'bills').mkdir()
        (self.root / 'bills/index.html').write_text('Existing Bills page')
        self.payload = {
            'root': str(self.root), 'source': 'https://reviewed.vercel.app',
            'source_commit': 'a' * 40, 'deployment_id': 'dpl_fixture',
            'files': {'marketplace/index.html': {
                'data': base64.b64encode(CONTENT).decode(),
                'sha256': hashlib.sha256(CONTENT).hexdigest(),
            }},
        }

    def tearDown(self):
        self.temp.cleanup()

    def run_remote(self, expected=0):
        result = subprocess.run([sys.executable, '-c', installer.REMOTE],
                                input=json.dumps(self.payload), text=True,
                                capture_output=True)
        if expected == 0:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.root / 'index.html').read_text(), 'Existing Kapukai homepage')
        self.assertEqual((self.root / 'bills/index.html').read_text(), 'Existing Bills page')
        return result

    def test_install_records_absence_and_preserves_other_routes(self):
        self.run_remote()
        self.assertEqual((self.root / 'marketplace/index.html').read_bytes(), CONTENT)
        self.assertEqual({p.name for p in self.root.iterdir()}, {'index.html', 'bills', 'marketplace'})
        receipts = list((self.parent / 'marketplace-install-receipts').glob('release-*.json'))
        self.assertEqual(len(receipts), 1)
        receipt = json.loads(receipts[0].read_text())
        self.assertEqual(receipt['previous_state'], 'absent')
        self.assertEqual(receipt['status'], 'installed')
        self.assertEqual(receipt['homepage_sha256_before'], receipt['homepage_sha256_after'])

    def test_exact_rerun_is_idempotent(self):
        self.run_remote()
        entry = self.root / 'marketplace/index.html'
        before = entry.stat().st_mtime_ns
        result = self.run_remote()
        self.assertIn('already installed', result.stdout)
        self.assertEqual(entry.stat().st_mtime_ns, before)
        self.assertEqual(len(list((self.parent / 'marketplace-install-receipts').glob('release-*.json'))), 1)

    def test_refuses_different_existing_entry(self):
        target = self.root / 'marketplace'
        target.mkdir()
        (target / 'index.html').write_text('Prior marketplace')
        self.run_remote(expected=1)
        self.assertEqual((target / 'index.html').read_text(), 'Prior marketplace')

    def test_refuses_extra_files(self):
        target = self.root / 'marketplace'
        target.mkdir()
        (target / 'index.html').write_bytes(CONTENT)
        (target / 'keep.txt').write_text('Keep this file')
        self.run_remote(expected=1)
        self.assertEqual((target / 'keep.txt').read_text(), 'Keep this file')

    def test_refuses_destination_symlink(self):
        outside = self.parent / 'outside'
        outside.mkdir()
        (self.root / 'marketplace').symlink_to(outside, target_is_directory=True)
        self.run_remote(expected=1)
        self.assertEqual(list(outside.iterdir()), [])

    def test_refuses_entry_symlink(self):
        outside = self.parent / 'external.html'
        outside.write_bytes(CONTENT)
        target = self.root / 'marketplace'
        target.mkdir()
        (target / 'index.html').symlink_to(outside)
        self.run_remote(expected=1)
        self.assertEqual(outside.read_bytes(), CONTENT)

    def test_refuses_path_escape(self):
        self.payload['files']['../index.html'] = self.payload['files'].pop('marketplace/index.html')
        self.run_remote(expected=1)
        self.assertFalse((self.root / 'marketplace').exists())

    def test_refuses_damaged_payload(self):
        self.payload['files']['marketplace/index.html']['data'] = base64.b64encode(b'changed').decode()
        self.run_remote(expected=1)
        self.assertFalse((self.root / 'marketplace').exists())

    def test_bundle_carries_exact_entry_bytes(self):
        bundle = (BASE.parent / 'community/public/marketplace/release.json').read_bytes()
        payload = installer.decode_bundle(bundle, str(self.root))
        self.assertEqual(base64.b64decode(payload['files']['marketplace/index.html']['data']), CONTENT)
        with self.assertRaises(SystemExit):
            installer.decode_bundle(bundle + b' ', str(self.root))


if __name__ == '__main__':
    unittest.main()
