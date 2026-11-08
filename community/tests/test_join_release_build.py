"""Check the documented rebuild against the authored files that Vercel serves."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

COMMUNITY = Path(__file__).resolve().parents[1]


class JoinReleaseBuildTest(unittest.TestCase):
    def test_rebuild_preserves_authored_signup(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary) / 'community'
            shutil.copytree(COMMUNITY, work, ignore=shutil.ignore_patterns(
                'backend', 'node_modules', '__pycache__', '.vercel',
            ))
            authored = [work / 'public/join/index.html', work / 'public/assets/community/app.js']
            expected = {file: file.read_bytes() for file in authored}
            # Start without a generated page to ensure the build actually runs.
            generated = work / 'public/confirm/index.html'
            generated.unlink()
            subprocess.run([sys.executable, 'build_community.py'], cwd=work,
                           capture_output=True, check=True)
            self.assertTrue(generated.is_file())
            for file, content in expected.items():
                with self.subTest(file=file.name):
                    self.assertEqual(file.read_bytes(), content)


if __name__ == '__main__':
    unittest.main()
