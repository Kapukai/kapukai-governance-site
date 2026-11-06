"""Publication coordinator tests with a simulated public web server and independent release tree."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sync
import source


def result(data, headers=None):
    return {'sha': source.sha256(data) if data else None, 'headers':headers or {}}


class StaticOverlay:
    def __init__(self):
        self.selected = None
        self.releases = {}

    def stage(self, meta, data):
        self.releases[meta['commit']] = dict(data)
        return meta['commit']

    def current(self):
        return self.selected

    def select(self, key):
        self.selected = key

    def files(self, key):
        return {n:source.sha256(b) for n,b in self.releases[key].items()}


class Routes:
    def __init__(self):
        self.enabled = False
        self.invalid = False

    def active(self):
        return self.enabled

    def baseline(self):
        if self.invalid:
            raise ValueError('nginx -t failed')

    def activate(self):
        self.baseline()
        self.enabled = True

    def deactivate(self):
        self.enabled = False


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)/'state'
        (self.state/'overlay').mkdir(parents=True)
        self.o = StaticOverlay()
        self.r = Routes()
        self.headers = {'X-Content-Type-Options':['nosniff'], 'Referrer-Policy':['no-referrer']}
        self.old = {sync.MAIN:b'legacy-join', sync.LETTER:b'legacy-news'}
        self.files = {sync.MAIN:b'join', sync.LETTER:b'letter', 'newsletter/archive/index.html':b'archive'}
        self.commit = 'A'
        self.fail = None
        self.p = sync.Publication(self.state, self.o, self.r, self.read, self.prepare, lambda _:None)
        p = patch.dict(sync.LEGACY, {name:{source.sha256(value)} for name, value in self.old.items()})
        p.start()
        self.addCleanup(p.stop)

    def read(self, name):
        if not self.r.enabled:
            return result(self.old.get(name), self.headers)
        current = self.o.releases[self.o.selected]
        if self.fail == self.o.selected:
            return result(current.get(name), {'X-Content-Type-Options':['nosniff']})
        return result(current.get(name), self.headers)

    def prepare(self):
        return {'commit':self.commit, 'source_sha256':{n:source.sha256(b) for n,b in self.files.items()}}, self.files

    def test_release_update_withdraw_and_restore(self):
        self.p.check()
        self.assertIsNone(self.o.selected)
        self.p.install()
        first_issue = 'newsletter/archive/2026-11/index.html'
        self.files[first_issue] = b'report'
        self.commit = 'B'
        self.p.update()
        self.assertEqual(self.read(first_issue)['sha'], source.sha256(b'report'))
        self.commit = 'C'
        del self.files[first_issue]
        self.p.update()
        self.assertIsNone(self.read(first_issue)['sha'])
        self.p.rollback()
        self.assertEqual(self.read(sync.MAIN)['sha'], source.sha256(b'legacy-join'))

    def test_invalid_initial_nginx_makes_no_change(self):
        self.r.invalid = True
        with self.assertRaisesRegex(ValueError, 'nginx -t'):
            self.p.install()
        self.assertFalse(self.r.active())
        self.assertEqual(self.o.releases, {})
        self.assertFalse(self.p.control.exists())

    def test_unknown_baseline_and_changed_public_headers(self):
        self.old[sync.MAIN] = b'unexpected'
        with self.assertRaisesRegex(ValueError, 'needs review'):
            self.p.install()
        self.old[sync.MAIN] = b'legacy-join'
        self.fail = 'A'
        with self.assertRaisesRegex(ValueError, 'security policy'):
            self.p.install()
        self.assertFalse(self.r.active())
        self.assertIsNone(self.o.selected)

    def test_bad_update_keeps_last_verified_release(self):
        self.p.install()
        self.commit = self.fail = 'B'
        self.files[sync.MAIN] = b'new join'
        # Recurring process has no route control interface.
        self.p.routes = None
        with self.assertRaisesRegex(ValueError, 'security policy'):
            self.p.update()
        self.assertEqual(self.o.selected, 'A')
        self.assertTrue(self.r.active())

    def test_interrupted_update_recovers_before_reading_new_source(self):
        self.p.install()
        self.commit = 'B'
        meta, data = self.prepare()
        self.o.stage(meta, data)
        sync.durable(self.p.pending, {'previous':'A', 'next':'B'})
        self.o.select('B')
        def blocked():
            raise ValueError('GitHub offline')
        self.p.prepare = blocked
        with self.assertRaisesRegex(ValueError, 'GitHub offline'):
            self.p.update()
        self.assertEqual(self.o.selected, 'A')
        self.assertIsNone(json.loads(self.p.pending.read_bytes()))

    def test_rollback_retains_retry_when_external_baseline_moved(self):
        self.p.install()
        self.old[sync.MAIN] = b'outside editing legacy'
        for _ in range(2):
            with self.assertRaisesRegex(ValueError, 'differs'):
                self.p.rollback()
        self.assertFalse(self.r.active())
        self.assertEqual(json.loads(self.p.control.read_bytes())['status'], 'restoring')
        self.old[sync.MAIN] = b'legacy-join'
        self.p.rollback()
        self.assertIsNone(json.loads(self.p.control.read_bytes()))


class RealOverlayTest(unittest.TestCase):
    @unittest.skipUnless(os.geteuid() == 0 and os.path.isdir('/root'), 'requires trusted root-owned fixture parent')
    def test_same_layout_install_second_worker_invocation_and_rollback(self):
        import overlay
        import test_overlay
        with tempfile.TemporaryDirectory(dir='/root') as folder:
            root = Path(folder)
            state = root/'state'
            runtime = state/'overlay'
            runtime.mkdir(parents=True, mode=0o700)
            engine = overlay.Overlay(root/'srv', runtime/'releases')
            routes = Routes()
            meta, data = test_overlay.fixture()
            meta.update(commit='A', source_sha256={})
            legacy = {sync.MAIN:b'first', sync.LETTER:b'second'}
            def response(n):
                if not routes.enabled:
                    return result(legacy.get(n))
                if sync.ASSET.fullmatch(n):
                    target = engine.immutable/n
                else:
                    target = engine.base/'current'/n
                return result(target.read_bytes() if target.is_file() else None)
            p = sync.Publication(state, engine, routes, response, lambda:(meta,data), lambda _:None)
            with patch.dict(sync.LEGACY, {n:{source.sha256(b)} for n,b in legacy.items()}):
                with sync.lock(runtime):
                    p.install()
                with sync.lock(runtime):
                    p.check()
                    p.update()
                    meta['commit'] = 'B'
                    p.update()
                with sync.lock(runtime):
                    p.rollback()
                self.assertEqual(response(sync.MAIN)['sha'], source.sha256(b'first'))
                engine.validate()


if __name__ == '__main__':
    unittest.main()
