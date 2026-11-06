"""Exercise the shipped launcher and setup script in an isolated simulated Linux host."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SOURCE = Path(__file__).resolve().parent
UNIT = 'kapukai-branded-sync'
LAUNCHER = 'Install-Kapukai-Branded-Sync.command'


@unittest.skipUnless(sys.platform.startswith('linux') and os.getuid() == 0, 'Linux root fixture')
class HostSetupTest(unittest.TestCase):
    def setUp(self):
        # Use a private, root-owned fixture to exercise the same ancestor checks as production.
        self.sandbox = tempfile.TemporaryDirectory(prefix='kapukai-host-test-', dir='/root')
        self.addCleanup(self.sandbox.cleanup)
        self.root = Path(self.sandbox.name)
        self.stage = self.root/'stage'
        self.stage.mkdir(mode=0o700)
        for path in ('run/systemd/system', 'var/lib', 'usr/local/lib', 'etc/systemd/system', 'bin'):
            (self.root/path).mkdir(parents=True, exist_ok=True)
        for name in (LAUNCHER, 'host-setup.sh', UNIT+'.service', UNIT+'.timer'):
            shutil.copy2(SOURCE/name, self.stage/name)
        self.setup = self.stage/'host-setup.sh'
        script = self.setup.read_text()
        for absolute in ('/run', '/var/lib', '/usr/local/lib', '/etc/systemd/system'):
            script = script.replace(absolute, str(self.root)+absolute)
        script = script.replace('export PATH=/usr/sbin:', 'export PATH='+str(self.root/'bin')+':/usr/sbin:')
        self.setup.write_text(script)
        for name in ('source.py', 'overlay.py'):
            (self.stage/name).write_text('')
        (self.stage/'nginx_route.py').write_text(f'''from pathlib import Path
class Routes:
    def __init__(self, state):
        self.active_marker = Path({str(self.root)!r})/'routes-active'
    def active(self):
        return self.active_marker.exists()
''')
        (self.stage/'sync.py').write_text(f'''import sys
from pathlib import Path
root = Path({str(self.root)!r})
with (root/'calls').open('a') as handle:
    print(sys.argv[1], file=handle)
if (root/('fail-'+sys.argv[1])).exists():
    sys.exit(1)
if sys.argv[1] == 'install':
    (root/'routes-active').touch()
if sys.argv[1] == 'rollback':
    (root/'routes-active').unlink(missing_ok=True)
''')
        self.unit = self.root/('etc/systemd/system/'+UNIT+'.service')
        self.enabled = self.root/'enabled'
        self.executable('systemd-run', '''[[ " $* " == *" --property=PrivateUsers=yes "* ]]
[[ " $* " == *" --property=ProcSubset=pid "* ]]
[[ " $* " == *" --property=CapabilityBoundingSet= "* ]]
[[ "$*" == *"/proc/self/mountinfo"* ]]
test ! -f "$base/no-userns"''')
        self.executable('systemctl', '''case "$1" in
  show)
    if [[ "$2" == --property=Version ]]; then
      if [[ -f "$base/manager-version" ]]; then cat "$base/manager-version"; else echo 252; fi
      exit 0
    fi
    property=${3#--property=}
    case "$property" in
      FragmentPath) if [[ -f "$base/etc/systemd/system/$2" ]]; then echo "$base/etc/systemd/system/$2"; else exit 4; fi;;
      DropInPaths) exit 0;;
      ActiveState) echo inactive;;
      Result) echo success;; esac;;
  daemon-reload) exit 0;;
  start) /usr/bin/python3 -E -s -B "$base/usr/local/lib/kapukai-branded-sync/sync.py" sync;;
  enable) touch "$base/enabled";;
  disable) rm -f "$base/enabled";;
  is-active|is-enabled) test -e "$base/enabled";;
  --no-pager) echo "fixture timer status";;
  *) echo "Unexpected systemctl action" >&2; exit 1;;
esac''')

    def executable(self, name, shell):
        target = self.root/'bin'/name
        target.write_text('#!/bin/bash\nset -eu\nbase='+str(self.root)+'\n'+shell+'\n')
        target.chmod(0o755)

    def action(self, mode, *, success=True):
        result = subprocess.run(['bash', str(self.setup), mode], cwd=self.stage, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, (result.stdout, result.stderr))
        return result

    def test_requires_manager_with_proc_isolation_before_install(self):
        (self.root/'manager-version').write_text('245.4-4ubuntu3.24')
        self.assertIn('247 or later', self.action('install', success=False).stderr)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.enabled.exists())

    def test_requires_working_user_namespace_before_install(self):
        (self.root/'no-userns').touch()
        self.assertIn('private user namespaces', self.action('install', success=False).stderr)
        self.assertFalse(self.unit.exists())
        self.assertFalse((self.root/'routes-active').exists())
        self.assertFalse(self.enabled.exists())

    def test_no_cutover_on_failed_check_or_conflict(self):
        (self.root/'fail-check').touch()
        self.action('install', success=False)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.enabled.exists())
        (self.root/'fail-check').unlink()
        self.unit.write_text('Existing local unit')
        self.action('install', success=False)
        self.assertEqual(self.unit.read_text(), 'Existing local unit')
        self.assertFalse(self.enabled.exists())

    def test_resume_and_rollback(self):
        self.action('check')
        self.assertFalse((self.root/'var/lib'/UNIT).exists())
        block = self.root/'fail-install'
        block.touch()
        self.action('install', success=False)
        self.assertFalse(self.enabled.exists())
        self.assertNotIn('sync', (self.root/'calls').read_text().splitlines())
        block.unlink()
        block = self.root/'fail-sync'
        block.touch()
        self.action('install', success=False)
        self.assertFalse(self.enabled.exists())
        self.assertFalse((self.root/'routes-active').exists())
        self.assertEqual((self.root/'calls').read_text().splitlines()[-3:], ['install', 'sync', 'rollback'])
        block.unlink()
        self.action('install')
        self.assertTrue(self.enabled.exists())
        calls = (self.root/'calls').read_text().splitlines()
        self.assertEqual(calls[-2:], ['install', 'sync'])
        self.action('install')
        block.touch()
        self.action('install', success=False)
        self.assertTrue(self.enabled.exists())
        self.assertTrue((self.root/'routes-active').exists())
        self.assertEqual((self.root/'calls').read_text().splitlines()[-2:], ['install', 'sync'])
        block.unlink()
        self.action('status')
        original = self.unit.read_bytes()
        self.unit.write_text('outside edit')
        self.action('install', success=False)
        self.assertEqual(self.unit.read_text(), 'outside edit')
        self.unit.write_bytes(original)
        block = self.root/'fail-rollback'
        block.touch()
        self.action('rollback', success=False)
        self.assertTrue(self.unit.exists())
        self.assertFalse(self.enabled.exists())
        block.unlink()
        self.action('rollback')
        self.assertFalse(self.unit.exists())
        self.assertFalse((self.root/'usr/local/lib'/UNIT).exists())
        self.action('rollback')

    def test_previous_version_requires_its_original_installer(self):
        receipt = self.root/'var/lib'/UNIT/'host-setup'
        receipt.mkdir(parents=True)
        receipt.chmod(0o700)
        receipt.parent.chmod(0o700)
        (receipt/'package.sha256').write_text('manifest from first implementation')
        out = self.action('install', success=False)
        self.assertIn('original package', out.stderr)
        self.assertFalse(self.unit.exists())

    def test_mac_ustar_does_not_restore_uid_501_or_metadata(self):
        self.executable('tar', '''if [[ "$1" == --format=ustar ]]; then
  exec /usr/bin/tar --owner=501 --group=20 "$@"
fi
if [[ "$1" == --no-same-owner ]]; then exec /usr/bin/tar "$@"; fi
exit 2''')
        self.executable('ssh', '''[[ "${*: -2:1}" == root@195.246.230.42 ]]
/bin/sh -c "${*: -1}"''')
        self.setup.write_text('''set -eu
test "$1" = check
test "$(stat -c %u source.py)" = 0
test "$(stat -c %a source.py)" = 600
test -f overlay.py && test -f nginx_route.py
echo "unpacked"
''')
        result = subprocess.run([str(self.stage/LAUNCHER), 'check'], cwd=self.stage,
                                env={**os.environ, 'PATH':str(self.root/'bin')+':'+os.environ['PATH']},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'unpacked')


if __name__ == '__main__':
    unittest.main()
