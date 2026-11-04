import base64
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

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

class ErrorReportingTest(unittest.TestCase):
    def run_main(self):
        with mock.patch.object(sys, 'argv', ['install.py']), self.assertRaises(SystemExit) as error:
            installer.main()
        return str(error.exception)

    def test_ssh_failure_does_not_dump_remote_command(self):
        command = ['ssh', 'host', installer.REMOTE]
        failure = subprocess.CalledProcessError(255, command)
        with mock.patch.object(installer, 'payload', return_value={'files': {}}), mock.patch.object(installer.subprocess, 'run', side_effect=failure):
            message = self.run_main()
        self.assertIn('exit 255', message)
        self.assertIn('may be incomplete', message)
        self.assertNotIn(installer.REMOTE, message)
        self.assertNotIn(str(command), message)
        self.assertLess(len(message), 300)

    def test_download_network_failure_does_not_attempt_ssh(self):
        for failure in (installer.urllib.error.URLError('offline'), TimeoutError('timeout')):
            with self.subTest(failure=type(failure).__name__), mock.patch.object(installer, 'payload', side_effect=failure), mock.patch.object(installer.subprocess, 'run') as ssh:
                message = self.run_main()
                ssh.assert_not_called()
            self.assertIn('No SSH connection was attempted', message)

    def test_hash_failure_keeps_specific_message(self):
        with mock.patch.object(installer, 'payload', side_effect=SystemExit('STOP: downloaded content differs from reviewed release: example')), mock.patch.object(installer.subprocess, 'run') as ssh:
            message = self.run_main()
            ssh.assert_not_called()
        self.assertIn('downloaded content differs', message)

    def test_public_verification_network_failure_keeps_install_status(self):
        with mock.patch.object(installer, 'payload', return_value={'files': {}}), mock.patch.object(installer.subprocess, 'run'), mock.patch.object(installer.urllib.request, 'urlopen', side_effect=installer.urllib.error.URLError('offline')):
            message = self.run_main()
        self.assertIn('Installation finished', message)
        self.assertIn('Publication is not verified', message)

if __name__=='__main__': unittest.main()
