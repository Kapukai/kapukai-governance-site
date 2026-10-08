import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]

class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='deploy-case-')
        self.base = Path(self.temp.name)
        self.module = self.base / 'module'
        self.module.mkdir()
        for name in ('deploy.py','release-manifest.json'):
            shutil.copy2(SOURCE/name, self.module/name)
        shutil.copytree(SOURCE/'public', self.module/'public')
        self.root = self.base/'web'
        self.root.mkdir()
        (self.root/'index.html').write_text('EXISTING HOMEPAGE')
        (self.root/'unrelated').mkdir()
        (self.root/'unrelated/app.js').write_text('EXISTING UNRELATED APP')
        self.manifest = json.loads((self.module/'release-manifest.json').read_text())
        self.assertEqual(len(self.manifest['files']),26)
    def tearDown(self):
        self.temp.cleanup()
    def run_deploy(self,*args):
        return subprocess.run(['python3',str(self.module/'deploy.py'),*args,'--web-root',str(self.root)],capture_output=True,text=True)
    def save_manifest(self):
        (self.module/'release-manifest.json').write_text(json.dumps(self.manifest))
    def unchanged(self):
        self.assertEqual((self.root/'index.html').read_text(),'EXISTING HOMEPAGE')
        self.assertEqual((self.root/'unrelated/app.js').read_text(),'EXISTING UNRELATED APP')
    def assert_rejected(self,result):
        self.assertNotEqual(result.returncode,0,result.stdout)
        self.unchanged()
        self.assertEqual(list(self.base.glob('kapukai-community-backup-*')),[])
    def test_fresh_plan_is_read_only_and_install_preserves_unrelated_content(self):
        plan=self.run_deploy('plan');self.assertEqual(plan.returncode,0,plan.stderr)
        self.assertEqual(sorted(p.relative_to(self.root).as_posix() for p in self.root.rglob('*') if p.is_file()),['index.html','unrelated/app.js'])
        result=self.run_deploy('install');self.assertEqual(result.returncode,0,result.stderr)
        self.unchanged()
        for name,digest in self.manifest['files'].items():
            self.assertEqual(hashlib.sha256((self.root/name).read_bytes()).hexdigest(),digest)
        backup=next(self.base.glob('kapukai-community-backup-*'))
        record=json.loads((backup/'install-record.json').read_text())
        self.assertEqual(set(record['created']),set(self.manifest['files']))
        self.assertEqual(record['replaced'],[])
    def test_conflict_blocks_entire_install_before_writes(self):
        target=self.root/'community/index.html';target.parent.mkdir();target.write_text('UNREVIEWED OLD COMMUNITY')
        self.assert_rejected(self.run_deploy('install'))
        self.assertEqual(target.read_text(),'UNREVIEWED OLD COMMUNITY')
        self.assertFalse((self.root/'assets').exists())
    def test_explicit_reviewed_replacement_backs_up_exact_previous_bytes(self):
        target=self.root/'community/index.html';target.parent.mkdir();old=b'REVIEWED OLD COMMUNITY\n';target.write_bytes(old)
        result=self.run_deploy('install','--replace-existing');self.assertEqual(result.returncode,0,result.stderr)
        backup=next(self.base.glob('kapukai-community-backup-*'))
        self.assertEqual((backup/'community/index.html').read_bytes(),old)
        self.assertEqual(json.loads((backup/'install-record.json').read_text())['replaced'],['community/index.html'])
        self.assertEqual(target.read_bytes(),(self.module/'public/community/index.html').read_bytes());self.unchanged()
    def test_source_hash_mismatch_blocks_install(self):
        (self.module/'public/community/index.html').write_text('ALTERED RELEASE')
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Release hash mismatch',result.stderr)
    def test_parent_traversal_rejected(self):
        self.manifest['files']['community/../../outside.txt']='0'*64;self.save_manifest()
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Unexpected release path',result.stderr)
    def test_absolute_path_rejected(self):
        self.manifest['files'][str(self.base/'outside.txt')]='0'*64;self.save_manifest()
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Unexpected release path',result.stderr)
    def test_unowned_module_path_rejected(self):
        self.manifest['files']['private/index.html']='0'*64;self.save_manifest()
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Unexpected release path',result.stderr)
    def test_destination_symlink_escape_rejected(self):
        outside=self.base/'outside';outside.mkdir();(self.root/'community').symlink_to(outside,target_is_directory=True)
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Destination escapes',result.stderr)
        self.assertEqual(list(outside.iterdir()),[])
    def test_direct_source_symlink_rejected(self):
        target=self.module/'public/community/index.html';outside=self.base/'external-source.html';outside.write_bytes(target.read_bytes());target.unlink();target.symlink_to(outside)
        result=self.run_deploy('install');self.assert_rejected(result);self.assertIn('Release hash mismatch',result.stderr)
    def test_preexisting_temporary_symlink_cannot_overwrite_outside_file(self):
        target=self.root/'community/index.html';target.parent.mkdir()
        outside=self.base/'outside-sensitive.txt';outside.write_text('DO NOT OVERWRITE')
        target.with_name(target.name+'.kapukai-new').symlink_to(outside)
        result=self.run_deploy('install')
        self.assertEqual(outside.read_text(),'DO NOT OVERWRITE','Predictable temporary symlink redirected installer write outside web root')

if __name__=='__main__':unittest.main(verbosity=2)
