"""Regression tests for the local OSV check of vendored npm dependencies."""
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / 'scripts' / 'check-vendor-security.py'
SPEC = importlib.util.spec_from_file_location('check_vendor_security', SCRIPT_PATH)
security = importlib.util.module_from_spec(SPEC)
_PREVIOUS_DONT_WRITE_BYTECODE = sys.dont_write_bytecode
sys.dont_write_bytecode = True
try:
  SPEC.loader.exec_module(security)
finally:
  sys.dont_write_bytecode = _PREVIOUS_DONT_WRITE_BYTECODE


def manifest(packages):
  directory = tempfile.TemporaryDirectory()
  path = Path(directory.name) / 'vendor-manifest.json'
  path.write_text(json.dumps({'packages': packages}), encoding='utf-8')
  return directory, path


def npm_package(name='example', version='1.2.3'):
  return {'registry': 'npm', 'package': name, 'version': version}


class VendorSecurityManifestTests(unittest.TestCase):
  def test_reads_only_npm_names_and_versions_from_manifest(self):
    directory, path = manifest([
      npm_package('@scope/example', '1.2.3'),
      {'registry': 'npm', 'name': 'name-fallback', 'version': '4.5.6'},
      {'registry': 'pypi', 'package': 'ignored', 'version': '7.8.9'},
    ])
    with directory:
      self.assertEqual(security.load_npm_packages(path), [
        {'name': '@scope/example', 'version': '1.2.3'},
        {'name': 'name-fallback', 'version': '4.5.6'},
      ])

  def test_rejects_invalid_or_incomplete_npm_manifest_entries(self):
    cases = [
      {'packages': {}},
      {'packages': [npm_package(version='')]},
      {'packages': [{'registry': 'npm', 'package': 'example'}]},
      {'packages': ['not-an-object']},
    ]
    for body in cases:
      with self.subTest(body=body):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / 'vendor-manifest.json'
        path.write_text(json.dumps(body), encoding='utf-8')
        with directory:
          with self.assertRaises(security.SecurityCheckError):
            security.load_npm_packages(path)


class VendorSecurityRunTests(unittest.TestCase):
  def run_check(self, packages, fetch):
    directory, path = manifest(packages)
    stdout = io.StringIO()
    stderr = io.StringIO()
    with directory:
      status = security.run(path, fetch=fetch, stdout=stdout, stderr=stderr)
    return status, stdout.getvalue(), stderr.getvalue()

  def test_clean_response_returns_zero(self):
    calls = []

    def fetch(url, payload=None):
      calls.append((url, payload))
      return {'results': [{}]}

    status, stdout, stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 0)
    self.assertIn('no known OSV security advisories', stdout)
    self.assertEqual(stderr, '')
    self.assertEqual(calls[0][1], {'queries': [{
      'package': {'name': 'example', 'ecosystem': 'npm'}, 'version': '1.2.3',
    }]})

  def test_advisory_output_includes_id_version_and_risk_information(self):
    def fetch(url, payload=None):
      if url == security.OSV_QUERY_BATCH_URL:
        return {'results': [{'vulns': [{'id': 'GHSA-test-0000'}]}]}
      self.assertEqual(url, f'{security.OSV_VULNERABILITY_URL}GHSA-test-0000')
      return {
        'id': 'GHSA-test-0000',
        'summary': 'example issue',
        'affected': [{
          'package': {'name': 'example', 'ecosystem': 'npm'},
          'ecosystem_specific': {'severity': 'HIGH'},
          'database_specific': {'severity': 'CRITICAL'},
        }],
        'severity': [{'type': 'CVSS_V3', 'score': 'CVSS:3.1/AV:N/AC:L'}],
      }

    status, stdout, stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 1)
    self.assertIn('VULNERABLE: example@1.2.3 | GHSA-test-0000', stdout)
    self.assertIn('ecosystem_specific severity: HIGH', stdout)
    self.assertIn('database_specific severity: CRITICAL', stdout)
    self.assertIn('CVSS_V3: CVSS:3.1/AV:N/AC:L', stdout)
    self.assertEqual(stderr, '')

  def test_summary_is_used_when_osv_omits_severity(self):
    def fetch(url, payload=None):
      if url == security.OSV_QUERY_BATCH_URL:
        return {'results': [{'vulns': [{'id': 'OSV-1'}]}]}
      return {'id': 'OSV-1', 'summary': 'No severity available'}

    status, stdout, _stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 1)
    self.assertIn('summary: No severity available', stdout)

  def test_pagination_is_fully_checked(self):
    batch_payloads = []

    def fetch(url, payload=None):
      if url == security.OSV_QUERY_BATCH_URL:
        batch_payloads.append(payload)
        if len(batch_payloads) == 1:
          return {'results': [{'vulns': [{'id': 'OSV-1'}], 'next_page_token': 'next'}]}
        return {'results': [{'vulns': [{'id': 'OSV-2'}]}]}
      advisory_id = url.rsplit('/', 1)[1]
      return {'id': advisory_id, 'summary': advisory_id}

    status, stdout, _stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 1)
    self.assertEqual(len(batch_payloads), 2)
    self.assertEqual(batch_payloads[1]['queries'][0]['page_token'], 'next')
    self.assertIn('OSV-1', stdout)
    self.assertIn('OSV-2', stdout)

  def test_network_errors_are_distinguished_from_advisories(self):
    def fetch(_url, _payload=None):
      raise urllib.error.URLError('offline')

    status, stdout, stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 2)
    self.assertEqual(stdout, '')
    self.assertIn('Security advisory check could not be completed', stderr)
    self.assertNotIn('VULNERABLE', stderr)

  def test_invalid_osv_results_and_advisory_detail_errors_return_two(self):
    invalid_result_cases = [
      lambda _url, _payload=None: [],
      lambda _url, _payload=None: {'results': []},
      lambda _url, _payload=None: {'results': [{'vulns': 'invalid'}]},
      lambda _url, _payload=None: {'results': [{'vulns': [{'id': 'OSV-1'}]}]},
    ]
    for index, fetch in enumerate(invalid_result_cases):
      with self.subTest(case=index):
        status, _stdout, stderr = self.run_check([npm_package()], fetch)
        self.assertEqual(status, 2)
        self.assertIn('Security advisory check could not be completed', stderr)

  def test_malformed_advisory_risk_data_returns_two(self):
    def fetch(url, payload=None):
      if url == security.OSV_QUERY_BATCH_URL:
        return {'results': [{'vulns': [{'id': 'OSV-1'}]}]}
      return {'id': 'OSV-1', 'affected': 'invalid'}

    status, _stdout, stderr = self.run_check([npm_package()], fetch)
    self.assertEqual(status, 2)
    self.assertIn('invalid affected-package data', stderr)

  def test_manifest_errors_return_two(self):
    directory = tempfile.TemporaryDirectory()
    path = Path(directory.name) / 'vendor-manifest.json'
    path.write_text('{broken', encoding='utf-8')
    stdout = io.StringIO()
    stderr = io.StringIO()
    with directory:
      status = security.run(path, fetch=lambda *_args: {}, stdout=stdout, stderr=stderr)
    self.assertEqual(status, 2)
    self.assertIn('could not parse vendor manifest', stderr.getvalue())

  def test_pre_commit_runs_security_check_before_update_check(self):
    hook = (ROOT / 'scripts' / 'pre-commit-checks.sh').read_text(encoding='utf-8')
    self.assertIn('scripts/check-vendor-security.py', hook)
    self.assertLess(
      hook.index('scripts/check-vendor-security.py'),
      hook.index('scripts/check-vendor-updates.py'),
    )


if __name__ == '__main__':
  unittest.main()
