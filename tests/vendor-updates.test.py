"""Offline checks for npm latest tags that lag behind stable vendored releases."""
import runpy
import unittest
from pathlib import Path

version_status = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / 'scripts/check-vendor-updates.py')
)['version_status']


class VendorVersionTests(unittest.TestCase):
    def test_equal_stable_release(self):
        self.assertEqual(version_status('7.0.0', '7.0.0'), 'ok')

    def test_newer_vendored_release_is_not_outdated(self):
        self.assertEqual(version_status('7.0.0', '6.1.2'), 'newer-than-latest')
        self.assertEqual(version_status('6.10.0', '6.9.0'), 'newer-than-latest')

    def test_older_release_requires_update(self):
        self.assertEqual(version_status('6.9.0', '6.10.0'), 'outdated')

    def test_prerelease_and_invalid_versions_require_review(self):
        for current, latest in [('7.0.0-beta.1', '6.1.2'), ('7.0.0', ''), ('dev', '7.0.0')]:
            self.assertEqual(version_status(current, latest), 'outdated')


if __name__ == '__main__':
    unittest.main()
