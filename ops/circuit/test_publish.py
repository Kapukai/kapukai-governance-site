"""Offline release-safety tests. No SSH, HTTP or real server writes."""

import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).parent
ROOT = HERE.parents[1]
spec = importlib.util.spec_from_file_location("circuit_publish", HERE / "publish.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class InstallerSafetyTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name).resolve()
        self.webroot = self.root / "public_html"
        self.webroot.mkdir()
        self.destination = self.webroot / "circuit"
        self.backups = self.root / "private-backups"
        manifest = json.loads((HERE / "assets.sha256.json").read_text())
        self.payload = {"action": "install", "commit": "a" * 40,
                        "transaction": "20261120T000000Z-123456abcdef", "manifest": manifest,
                        "assets": {name: base64.b64encode((ROOT / "circuit" / name).read_bytes()).decode()
                                   for name in release.FILES}}
        # Any accidental transport call makes the fixture test fail.
        self.transport = patch.object(release, "ssh_worker", side_effect=AssertionError("Unexpected SSH"))
        self.transport.start()
        self.addCleanup(self.transport.stop)

    def install(self, payload=None):
        return release.install(payload or self.payload, self.destination, self.backups)

    def existing(self):
        self.destination.mkdir(mode=0o750)
        for name in release.FILES:
            path = self.destination / name
            path.write_bytes(("Previous " + name).encode())
            path.chmod(0o600)
        (self.destination / "unrelated.txt").write_text("Preserve me")

    def finish(self, action):
        return release.finish({"action": action, "transaction": self.payload["transaction"],
                               "verification": {"fixture": True}}, self.destination, self.backups)

    def assert_previous(self):
        for name in release.FILES:
            self.assertEqual((self.destination / name).read_bytes(), ("Previous " + name).encode())
            self.assertEqual(stat.S_IMODE((self.destination / name).stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.destination.stat().st_mode), 0o750)
        self.assertEqual((self.destination / "unrelated.txt").read_text(), "Preserve me")

    def test_first_install_has_exact_bytes_and_readable_permissions(self):
        result = self.install()
        self.assertEqual(result["status"], "installed-awaiting-public-verification")
        self.assertEqual(stat.S_IMODE(self.destination.stat().st_mode), 0o755)
        for name in release.FILES:
            data = (self.destination / name).read_bytes()
            self.assertEqual(data, (ROOT / "circuit" / name).read_bytes())
            self.assertEqual(stat.S_IMODE((self.destination / name).stat().st_mode), 0o644)
        self.assertNotIn(self.webroot, Path(result["backup_dir"]).parents)
        self.assertEqual(stat.S_IMODE(Path(result["backup_dir"]).stat().st_mode), 0o700)

    def test_existing_files_back_up_and_rollback_exactly(self):
        self.existing()
        result = self.install()
        for name in release.FILES:
            self.assertEqual((Path(result["backup_dir"]) / (name + ".before")).read_bytes(), ("Previous " + name).encode())
        self.assertEqual(self.finish("rollback")["status"], "rolled-back")
        self.assert_previous()

    def test_first_install_rollback_removes_only_created_files_and_directory(self):
        self.install()
        self.finish("rollback")
        self.assertFalse(self.destination.exists())
        self.assertTrue(self.webroot.is_dir())

    def test_destination_symlink_is_refused(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.destination.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink refused"):
            self.install()
        self.assertEqual(list(outside.iterdir()), [])

    def test_ancestor_symlink_is_refused(self):
        linked = self.root / "linked-webroot"
        linked.symlink_to(self.webroot, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink refused"):
            release.install(self.payload, linked / "circuit", self.backups)
        self.assertFalse(self.destination.exists())

    def test_managed_file_symlink_is_refused(self):
        self.destination.mkdir()
        outside = self.root / "outside.css"
        outside.write_text("Untouched")
        (self.destination / "styles.css").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "Symlink refused"):
            self.install()
        self.assertEqual(outside.read_text(), "Untouched")

    def test_backups_inside_public_root_are_refused(self):
        with self.assertRaisesRegex(ValueError, "outside the public web root"):
            release.install(self.payload, self.destination, self.webroot / "backups")
        self.assertFalse(self.destination.exists())
        self.assertFalse((self.webroot / "backups").exists())

    def test_backup_symlink_is_refused(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.backups.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink refused"):
            self.install()
        self.assertEqual(list(outside.iterdir()), [])
        self.assertFalse(self.destination.exists())

    def test_wrong_asset_hash_fails_before_any_install(self):
        bad = copy.deepcopy(self.payload)
        bad["manifest"]["files"]["index.html"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.install(bad)
        self.assertFalse(self.destination.exists())
        self.assertFalse(self.backups.exists())

    def test_manifest_cannot_add_unmanaged_path(self):
        bad = copy.deepcopy(self.payload)
        bad["manifest"]["files"]["../index.html"] = bad["manifest"]["files"]["index.html"]
        with self.assertRaisesRegex(ValueError, "exactly the three"):
            self.install(bad)
        self.assertFalse(self.destination.exists())

    def test_partial_failure_restores_previous_files(self):
        self.existing()
        original_replace = os.replace
        failed = False

        def fail_once(source, target):
            nonlocal failed
            if Path(target) == self.destination / "circuit.js" and not failed:
                failed = True
                raise OSError("Simulated interrupted asset replacement")
            return original_replace(source, target)

        with patch.object(release.os, "replace", side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, "previous files restored"):
                self.install()
        self.assert_previous()
        record = json.loads((self.backups / self.payload["transaction"] / "transaction.json").read_text())
        self.assertEqual(record["status"], "rolled-back")
        self.assertFalse(list(self.destination.glob(".circuit-stage-*")))

    def test_partial_first_install_leaves_no_public_files(self):
        original_replace = os.replace
        failed = False

        def fail_once(source, target):
            nonlocal failed
            if Path(target) == self.destination / "circuit.js" and not failed:
                failed = True
                raise OSError("Simulated replacement failure")
            return original_replace(source, target)

        with patch.object(release.os, "replace", side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, "previous files restored"):
                self.install()
        self.assertFalse(self.destination.exists())

    def test_rollback_refuses_to_overwrite_a_newer_edit(self):
        self.install()
        (self.destination / "circuit.js").write_text("Later operator change")
        with self.assertRaisesRegex(ValueError, "mismatch"):
            self.finish("rollback")
        self.assertEqual((self.destination / "circuit.js").read_text(), "Later operator change")

    def test_confirm_records_verification_only_for_matching_files(self):
        self.install()
        result = self.finish("confirm")
        self.assertEqual(result["status"], "verified")
        record = json.loads((Path(result["backup_dir"]) / "transaction.json").read_text())
        self.assertEqual(record["public_verification"], {"fixture": True})
        self.assertIn("verified_at", record)


if __name__ == "__main__":
    unittest.main(verbosity=2)
