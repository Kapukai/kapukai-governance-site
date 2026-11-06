"""Offline fixture tests for source changes, conflict handling, interrupted writes and rollback."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import source
import sync


class MirrorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.web = Path(self.tmp.name)/'www'
        self.state = Path(self.tmp.name)/'state'
        for folder in ('join', 'newsletter', 'bills'):
            (self.web/folder).mkdir(parents=True)
        (self.web/'bills/index.html').write_bytes(b'bills-owned-elsewhere')
        self.join = 'join/index.html'
        self.letter = 'newsletter/index.html'
        self.archive = 'newsletter/archive/index.html'
        self.issue = 'newsletter/archive/2026-11/index.html'
        self.image = 'newsletter/archive/2026-11/test.png'
        self.asset = 'newsletter/_community-assets/' + sync.sha(b'js1') + '/app.js'
        self.contents = {self.join:b'join release 1', self.letter:b'newsletter release 1', self.archive:b'archive',
                         self.issue:b'november', self.image:b'png', self.asset:b'js1'}
        (self.web/self.join).write_bytes(b'original join')
        (self.web/self.letter).write_bytes(b'original newsletter')
        bases = patch.dict(sync.ROLLBACK_BASES, {
            self.join:{sync.sha(b'original join')}, self.letter:{sync.sha(b'original newsletter')}
        })
        bases.start()
        self.addCleanup(bases.stop)

    def read(self, name):
        p = self.web/name
        return p.read_bytes() if p.is_file() else None

    def run_action(self, action, reader=None):
        sync.run(self.web, self.state, action, lambda: ({'commit':'test', 'deployment':'fixture'}, self.contents), reader or self.read)

    def record(self):
        return json.loads((self.state/'state.json').read_text())

    def test_two_releases_and_full_rollback(self):
        self.run_action('check')
        self.assertFalse(self.state.exists())
        self.run_action('sync')
        self.run_action('sync')
        self.assertEqual(len(self.record()['history']), 1)
        second = 'newsletter/archive/2027-01/index.html'
        self.contents[second] = b'january'
        del self.contents[self.issue]
        del self.contents[self.image]
        self.contents[self.join] = b'join release 2'
        self.run_action('sync')
        self.assertFalse((self.web/self.issue).parent.exists())
        self.assertEqual(self.read(second), b'january')
        self.run_action('rollback')
        self.assertEqual(self.read(self.join), b'original join')
        self.assertEqual(self.read(self.letter), b'original newsletter')
        self.assertEqual(self.read('bills/index.html'), b'bills-owned-elsewhere')
        self.assertFalse((self.web/'newsletter/archive').exists())
        self.assertFalse((self.web/'newsletter/_community-assets').exists())
        self.assertEqual(self.record()['history'], [])

    def test_stale_public_route_after_write_restores_original(self):
        def stale(name):
            data = self.read(name)
            if name == self.join and data == self.contents[name]:
                return b'old cached response'
            return data
        with self.assertRaisesRegex(ValueError, 'Public content differs'):
            self.run_action('sync', stale)
        self.assertEqual(self.read(self.join), b'original join')
        self.assertFalse((self.web/'newsletter/archive').exists())
        self.assertIsNone(self.record()['pending'])

    def test_refuses_conflicting_public_route_before_install(self):
        with self.assertRaisesRegex(ValueError, 'Public content differs'):
            self.run_action('sync', lambda name: b'proxied elsewhere' if name == self.join else self.read(name))
        self.assertEqual(self.read(self.join), b'original join')

    def test_unknown_file_and_symlink(self):
        (self.web/self.join).write_bytes(b'local editor')
        with self.assertRaisesRegex(ValueError, 'Unrecognized existing'):
            self.run_action('check')
        (self.web/self.join).unlink()
        (self.web/self.join).symlink_to(self.web/'bills/index.html')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.run_action('sync')
        self.assertEqual(self.read('bills/index.html'), b'bills-owned-elsewhere')

    def test_outside_write_blocks_republish_and_rollback(self):
        self.run_action('sync')
        (self.web/self.issue).write_bytes(b'editor')
        for action in ('sync', 'rollback'):
            with self.assertRaisesRegex(ValueError, '[Oo]utside'):
                self.run_action(action)
        self.assertEqual(self.read(self.issue), b'editor')

    def test_rollback_verification_must_succeed_on_retry(self):
        self.run_action('sync')
        def stale(name):
            return b'edge old release' if name == self.join else self.read(name)
        for attempt in range(2):
            with self.assertRaisesRegex(ValueError, 'Public content differs'):
                self.run_action('rollback', stale)
            self.assertIn('rollback_verify', self.record())
        with self.assertRaisesRegex(ValueError, 'rollback is in progress'):
            self.run_action('sync')
        self.run_action('rollback')
        self.assertNotIn('rollback_verify', self.record())

    def test_recovery_from_power_loss_mid_transaction(self):
        self.run_action('sync')
        record = self.record()
        txn = record['history'].pop()
        receipt = sync.log(self.state, txn)
        # Recreate the exact durable journal and partially applied site after an interruption.
        entry = next(x for x in receipt['changes'] if x['name'] == self.join)
        sync.write_public(self.web, self.join, b'original join', entry)
        record['pending'] = {'direction':'publish', 'txn':txn}
        sync.journal(self.state, record)
        self.run_action('rollback')
        self.assertEqual(self.read(self.letter), b'original newsletter')
        self.assertFalse((self.web/'newsletter/archive').exists())


class SourceTests(unittest.TestCase):
    def test_rewrites_only_scoped_attributes_and_refuses_unknown_resources(self):
        name = 'join/index.html'
        alias = {'assets/community/app.js':'newsletter/_community-assets/%s/app.js' % ('0'*64)}
        html = b'<head><link rel="canonical" href="https://kapukai.org/join/"></head><p>/assets/community/app.js</p>'
        script = b'<script src="/assets/community/app.js"></script>'
        doc = source.Assets(name, html + script, set(), alias)
        self.assertEqual(doc.rewritten(), html + script.replace(b'assets/community/app.js', next(iter(alias.values())).encode()))
        with self.assertRaises(ValueError):
            source.Assets(name, html + b'<script src="/unknown.js"></script>', set(), alias)


if __name__ == '__main__':
    unittest.main()
