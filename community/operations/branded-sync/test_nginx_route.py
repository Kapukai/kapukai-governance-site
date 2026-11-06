import errno
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import nginx_route as route


class LocalRoutes(route.Routes):
    def __init__(self, tmp):
        self.conf = Path(tmp)/'nginx'
        self.conf.mkdir()
        super().__init__(Path(tmp)/'state', self.conf)
        self.reloaded = 0
        self.fail_reload = False
        self.reject_marker = False
        self.bad_legacy = False
        self.main = self.conf/'nginx.conf'
        self.main.write_text('events {} http { include sites-enabled/*; }\n')
        self.available = self.conf/'sites-available'
        self.enabled = self.conf/'sites-enabled'
        self.available.mkdir()
        self.enabled.mkdir()
        self.site = self.available/'kapukai'
        self.link = self.enabled/'kapukai'
        self.link.symlink_to('../sites-available/kapukai')
        self.original = '''server {
            listen 443 ssl http2;
            listen [::]:443 ssl http2;
            server_name kapukai.org www.kapukai.org;
            location / {
                try_files $uri $uri/ =404;
                add_header X-Content-Type-Options "nosniff" always;
                add_header Content-Security-Policy "default-src 'self';" always;
            }
            location ^~ /bills/ { try_files $uri =404; }
        }
'''
        self.site.write_text(self.original)
        self.site.chmod(0o640)

    def _dump(self):
        raw = b''
        for path in (self.main,self.link):
            raw += b'# configuration file '+bytes(path)+b':\n' + path.read_bytes()+b'\n'
        return route.Dump(raw, self.base)

    def _test(self):
        if self.bad_legacy or (self.reject_marker and route.MARKER in self.site.read_text()):
            raise RuntimeError('nginx -t failed: missing include')

    def _reload(self):
        if self.fail_reload:
            self.fail_reload = False
            raise RuntimeError('reload signal failed')
        self.reloaded += 1


@unittest.skipUnless(os.geteuid() == 0, 'privileged fixture verifies production root ownership')
class RouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.r = LocalRoutes(self.tmp.name)

    def test_baseline_cutover_and_recovery_preserve_bytes_and_mode(self):
        r = self.r
        r.baseline()
        self.assertFalse(r.receipt.exists())
        r.activate()
        mounted = r.site.read_text()
        self.assertIn('location = /join {', mounted)
        self.assertIn('location = /join/index.html {', mounted)
        self.assertGreater(mounted.count('add_header X-Content-Type-Options "nosniff" always;'), 2)
        self.assertEqual(r.site.stat().st_mode & 0o777, 0o640)
        self.assertTrue(r.link.is_symlink())
        self.assertTrue(r.active())
        r.activate()
        self.assertEqual(r.reloaded, 1)
        r.deactivate()
        self.assertEqual(r.site.read_text(), r.original)
        self.assertEqual(r.reloaded, 2)
        self.assertFalse(r.active())
        self.assertTrue(any(r.state.glob('*.bak')))

    def test_cce_baseline_or_candidate_failure_never_reloads(self):
        r = self.r
        r.bad_legacy = True
        with self.assertRaisesRegex(RuntimeError, 'include'):
            r.activate()
        self.assertFalse(r.receipt.exists())
        r.bad_legacy = False
        r.reject_marker = True
        with self.assertRaisesRegex(RuntimeError, 'include'):
            r.activate()
        self.assertEqual(r.reloaded, 0)
        self.assertEqual(r.site.read_text(), r.original)
        self.assertFalse(r.receipt.exists())

    def test_reload_or_interruption_recovery(self):
        r = self.r
        r.fail_reload = True
        with self.assertRaisesRegex(RuntimeError, 'signal'):
            r.activate()
        self.assertEqual(r.reloaded, 1)
        self.assertEqual(r.site.read_text(), r.original)
        r.activate()
        receipt = json.loads(r.receipt.read_text())
        receipt['phase'] = 'reloading'
        r._save(receipt)
        self.assertFalse(r.active())
        r.deactivate()
        self.assertEqual(r.site.read_text(), r.original)

    def test_drift_rollback_refuses_outside_config_change(self):
        r = self.r
        r.activate()
        r.site.write_text(r.site.read_text()+'# external config\n')
        with self.assertRaisesRegex(ValueError, 'outside'):
            r.deactivate()
        self.assertTrue(r.site.read_text().endswith('# external config\n'))

    def test_refuses_overlaps_nonstandard_hosts_and_conflicting_access(self):
        r = self.r
        for text in ('location = /join {}', 'location = /join/index.html {}','location ^~ /newsletter/ {}',
                     'location ~* "[.](js|css)$" {}', 'location ~ "^/joins?/private" {}',
                     'location ~ "^/other|/join" {}','rewrite ^ /other permanent;'):
            with self.subTest(text=text):
                r.site.write_text(r.original.replace('location / {', text+'\n location / {'))
                with self.assertRaises(ValueError):
                    r.baseline()
        for text in (r.original.replace('www.kapukai.org', 'unrelated.example'),
                     r.original.replace('location / {','location / { deny all;')):
            r.site.write_text(text)
            with self.assertRaises(ValueError):
                r.baseline()
        self.assertFalse(r.receipt.exists())
        self.assertEqual(r.reloaded, 0)

    def test_untrusted_nginx_file_and_external_link_refused(self):
        r = self.r
        try:
            r.site.chmod(0o666)
        except OSError as exc:
            if exc.errno not in (errno.EINVAL, errno.EPERM):
                raise
            real_lstat = Path.lstat
            def writable_file(path):
                info = real_lstat(path)
                if path == r.site:
                    return SimpleNamespace(st_mode=info.st_mode | 0o022, st_nlink=info.st_nlink, st_uid=info.st_uid)
                return info
            with patch.object(Path, 'lstat', writable_file):
                with self.assertRaisesRegex(ValueError, 'Untrusted'):
                    r.baseline()
        else:
            with self.assertRaisesRegex(ValueError,'Untrusted'):
                r.baseline()
            r.site.chmod(0o640)
        r.link.unlink()
        target = Path(self.tmp.name)/'unrelated'
        target.write_text(r.original)
        r.link.symlink_to(target)
        with self.assertRaisesRegex(ValueError,'outside'):
            r.baseline()
        self.assertEqual(target.read_text(),r.original)


if __name__ == '__main__':
    unittest.main()
