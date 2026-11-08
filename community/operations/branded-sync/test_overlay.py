import errno
import hashlib
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import overlay


def digest(b):
    return hashlib.sha256(b).hexdigest()


def fixture(n=1):
    js = ('function signup%d() {}' % n).encode()
    css = b'body{color:black}'
    return {'commit': str(n)}, {
        'join/index.html': ('Join %d' % n).encode(),
        'newsletter/index.html': b'Newsletter',
        'newsletter/archive/index.html': b'Archive',
        'newsletter/archive/2026-11/index.html': b'Issue',
        'newsletter/archive/2026-11/diagram.png': b'PNG',
        'newsletter/_community-assets/' + digest(js) + '/app.js': js,
        'newsletter/_community-assets/' + digest(css) + '/style.css': css,
    }


class OverlayTest(unittest.TestCase):
    def setUp(self):
        # The repository's CI may run unprivileged. The production boundary still
        # requires UID 0 and checks ancestors all the way up to /. The fixture models
        # that administrator with the test-process UID and a private temporary root.
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.anchor = Path(self.tmp.name)
        self.addCleanup(mock.patch.stopall)
        mock.patch.object(overlay, 'ROOT_UID', os.geteuid()).start()

        def trust_fixture(path):
            self.assertTrue(path.is_relative_to(self.anchor))
            for part in [*reversed(path.parents), path]:
                if part.is_relative_to(self.anchor) and overlay.exists(part):
                    overlay.inspect(part, stat.S_ISDIR)
        mock.patch.object(overlay, 'trusted', trust_fixture).start()
        self.site = overlay.Overlay(self.anchor / 'served', self.anchor / 'receipts')

    def test_pristine_check_and_idempotent_stage(self):
        self.site.validate()
        self.assertFalse(self.site.base.exists())
        meta, files = fixture()
        old_umask = os.umask(0o077)
        try:
            key = self.site.stage(meta, files)
            self.assertIsNone(self.site.current())
            self.assertEqual(key, self.site.stage(meta, files))
            self.site.select(key)
        finally:
            os.umask(old_umask)
        self.assertEqual(self.site.current(), key)
        self.assertEqual(self.site.files(key), {n: digest(b) for n, b in files.items()})
        self.assertEqual((self.site.base / 'current/join/index.html').read_bytes(), files['join/index.html'])
        self.assertEqual((self.site.base / 'current/join/index.html').stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.site.base / 'current/join').stat().st_mode & 0o777, 0o755)

    def test_mixed_legacy_site_is_untouched_across_install_and_rollback(self):
        legacy = self.anchor / 'legacy-public_html'
        (legacy / 'join').mkdir(parents=True)
        (legacy / 'newsletter').mkdir()
        page = legacy / 'join/index.html'
        page.write_bytes(b'original on-site content')
        if os.getuid() == 0:
            try:
                os.chown(legacy, 33, 33)
                os.chown(legacy / 'join', 33, 33)
            except OSError as exc:
                # One-UID sandbox: no mapped www-data ID. Also enforce an
                # inaccessible legacy site below, independent of actual ownership.
                if exc.errno not in (errno.EPERM, errno.EINVAL):
                    raise
        identity = {p: (p.stat().st_ino, p.stat().st_uid, p.stat().st_gid, p.stat().st_mode)
                    for p in (legacy, legacy / 'join', legacy / 'newsletter', page)}
        real_stat = Path.stat
        def forbid_legacy_read(path, *args, **kwargs):
            if path == legacy or legacy in path.parents:
                raise AssertionError('The publisher tried to read the legacy site: ' + str(path))
            return real_stat(path, *args, **kwargs)
        guard = mock.patch.object(Path, 'stat', forbid_legacy_read)
        guard.start()
        self.addCleanup(guard.stop)
        keys = []
        first_assets = [n for n in fixture()[1] if overlay.ASSET.fullmatch(n)]
        for n in range(1, 7):
            key = self.site.stage(*fixture(n))
            keys.append(key)
            self.site.select(key)
        self.assertEqual(len(list(self.site.releases.iterdir())), 3)
        self.assertFalse((self.site.releases / keys[0]).exists())
        for name in first_assets:
            self.assertEqual((self.site.immutable / name).read_bytes(), fixture()[1][name])
        self.site.select(keys[-2])
        self.assertEqual((self.site.base / 'current/join/index.html').read_bytes(), b'Join 5')
        self.site.select(None)
        self.assertIsNone(self.site.current())
        guard.stop()
        self.assertEqual(page.read_bytes(), b'original on-site content')
        self.assertEqual(identity, {p: (p.stat().st_ino, p.stat().st_uid, p.stat().st_gid, p.stat().st_mode)
                                    for p in identity})

    def test_refuses_unknown_directory_and_untrusted_ancestor(self):
        self.site.base.mkdir()
        (self.site.base / 'someone-elses-file').touch()
        with self.assertRaisesRegex(ValueError, 'adopt'):
            self.site.stage(*fixture())
        (self.site.base / 'someone-elses-file').unlink()
        self.site.base.chmod(0o777)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            self.site.stage(*fixture())

    def test_symlinked_base_and_pointer_cannot_redirect_writes(self):
        victim = self.anchor / 'unrelated'
        victim.mkdir()
        (victim / 'keep').write_bytes(b'keep')
        self.site.base.symlink_to(victim, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.site.stage(*fixture())
        self.site.base.unlink()
        key = self.site.stage(*fixture())
        (self.site.base / 'current').symlink_to(victim, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'selector'):
            self.site.select(key)
        self.assertEqual(list(victim.iterdir()), [victim / 'keep'])
        self.assertEqual((victim / 'keep').read_bytes(), b'keep')

    def test_tampered_immutable_leaf_and_release_file_are_refused(self):
        meta, files = fixture()
        key = self.site.stage(meta, files)
        js = next(n for n in files if n.endswith('/app.js'))
        leaf = self.site.immutable / js
        victim = self.anchor / 'outside'
        victim.write_bytes(b'outside')
        leaf.unlink()
        leaf.symlink_to(victim)
        with self.assertRaises(ValueError):
            self.site.select(key)
        self.assertIsNone(self.site.current())
        self.assertEqual(victim.read_bytes(), b'outside')
        leaf.unlink()
        leaf.write_bytes(files[js])
        page = self.site.releases / key / 'join/index.html'
        page.unlink()
        os.link(victim, page)
        with self.assertRaisesRegex(ValueError, 'links'):
            self.site.stage(meta, files)
        self.assertEqual(victim.read_bytes(), b'outside')

    def test_crash_during_staging_or_switch_keeps_selected_release(self):
        key = self.site.stage(*fixture())
        self.site.select(key)
        with mock.patch.object(overlay.os, 'replace', side_effect=OSError('simulated loss')):
            with self.assertRaises(OSError):
                self.site.stage(*fixture(2))
        # Abandoned staging is private and recovered on the next serialized attempt.
        orphan = self.site.base / 'work/.stage-crash'
        orphan.mkdir()
        (orphan / 'partial').write_bytes(b'partial')
        self.assertEqual(self.site.current(), key)
        key2 = self.site.stage(*fixture(2))
        self.assertFalse(orphan.exists())
        with mock.patch.object(overlay.os, 'replace', side_effect=OSError('simulated loss')):
            with self.assertRaises(OSError):
                self.site.select(key2)
        self.assertEqual(self.site.current(), key)
        self.site.select(key2)
        self.assertEqual(self.site.current(), key2)

    def test_disallowed_asset_hash_and_path_fail_before_changes(self):
        for name in ('newsletter/../../x', 'newsletter/archive/2026-13/index.html',
                     'newsletter/_community-assets/' + '0' * 64 + '/app.js'):
            meta, files = fixture()
            files[name] = b'bad'
            with self.assertRaises(ValueError):
                self.site.stage(meta, files)
        self.assertFalse(self.site.base.exists())

    def test_corrupt_receipt_blocks_selection(self):
        key = self.site.stage(*fixture())
        (self.site.state / (key + '.json')).write_text('{"files":{}}')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.site.select(key)
        self.assertIsNone(self.site.current())


if __name__ == '__main__':
    unittest.main()
