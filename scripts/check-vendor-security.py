#!/usr/bin/env python3
"""Check the exact vendored npm package versions against OSV advisories."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / 'vendor-manifest.json'
OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch'
OSV_VULNERABILITY_URL = 'https://api.osv.dev/v1/vulns/'
REQUEST_TIMEOUT_SECONDS = 15


class SecurityCheckError(RuntimeError):
  """The advisory check could not produce a complete, trustworthy result."""


def load_npm_packages(manifest_path=MANIFEST_PATH):
  """Return exact npm package coordinates declared in the vendor manifest."""
  try:
    manifest = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
  except OSError as error:
    raise SecurityCheckError(f'could not read vendor manifest: {error}') from error
  except json.JSONDecodeError as error:
    raise SecurityCheckError(f'could not parse vendor manifest: {error}') from error

  packages = manifest.get('packages')
  if not isinstance(packages, list):
    raise SecurityCheckError('vendor manifest must contain a packages array')

  npm_packages = []
  for index, package in enumerate(packages, start=1):
    if not isinstance(package, dict):
      raise SecurityCheckError(f'vendor manifest package entry {index} must be an object')
    if package.get('registry') != 'npm':
      continue
    package_name = package.get('package') or package.get('name')
    version = package.get('version')
    if not isinstance(package_name, str) or not package_name.strip():
      raise SecurityCheckError(f'incomplete npm entry {index}: package name is missing')
    if not isinstance(version, str) or not version.strip():
      raise SecurityCheckError(f'incomplete npm entry {package_name}: version is missing')
    npm_packages.append({'name': package_name, 'version': version})
  return npm_packages


def request_json(url, payload=None):
  """Make one OSV request and return an object response."""
  data = None
  headers = {
    'Accept': 'application/json',
    'User-Agent': 'TeachHelper-vendor-security-check/1.0',
  }
  if payload is not None:
    data = json.dumps(payload).encode('utf-8')
    headers['Content-Type'] = 'application/json'
  request = urllib.request.Request(url, data=data, headers=headers)
  try:
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
      status = response.status if hasattr(response, 'status') else response.getcode()
      if status != 200:
        raise SecurityCheckError(f'OSV returned HTTP {status} for {url}')
      body = response.read().decode('utf-8')
  except urllib.error.HTTPError as error:
    raise SecurityCheckError(f'OSV returned HTTP {error.code} for {url}') from error
  except (urllib.error.URLError, TimeoutError, OSError) as error:
    raise SecurityCheckError(f'could not reach OSV for {url}: {error}') from error

  try:
    decoded = json.loads(body)
  except json.JSONDecodeError as error:
    raise SecurityCheckError(f'OSV returned invalid JSON for {url}: {error}') from error
  if not isinstance(decoded, dict):
    raise SecurityCheckError(f'OSV returned an invalid JSON response for {url}')
  return decoded


def query_advisories(packages, fetch=request_json):
  """Return (package, advisory ID) pairs, following every OSV page token."""
  pending_queries = [(package, None) for package in packages]
  seen_page_tokens = set()
  advisories = []

  while pending_queries:
    request_entries = []
    for package, page_token in pending_queries:
      entry = {
        'package': {'name': package['name'], 'ecosystem': 'npm'},
        'version': package['version'],
      }
      if page_token is not None:
        entry['page_token'] = page_token
      request_entries.append(entry)

    response = fetch(OSV_QUERY_BATCH_URL, {'queries': request_entries})
    if not isinstance(response, dict):
      raise SecurityCheckError('OSV returned an invalid batch response')
    results = response.get('results')
    if not isinstance(results, list) or len(results) != len(pending_queries):
      raise SecurityCheckError('OSV returned results that do not match the submitted package queries')

    next_queries = []
    for (package, _page_token), result in zip(pending_queries, results):
      if not isinstance(result, dict):
        raise SecurityCheckError('OSV returned an invalid query result')
      vulnerabilities = result.get('vulns', [])
      if not isinstance(vulnerabilities, list):
        raise SecurityCheckError('OSV returned an invalid vulnerability list')
      for vulnerability in vulnerabilities:
        advisory_id = vulnerability.get('id') if isinstance(vulnerability, dict) else None
        if not isinstance(advisory_id, str) or not advisory_id:
          raise SecurityCheckError('OSV returned a vulnerability without an advisory ID')
        advisories.append((package, advisory_id))

      next_page_token = result.get('next_page_token')
      if next_page_token is not None:
        if not isinstance(next_page_token, str) or not next_page_token:
          raise SecurityCheckError('OSV returned an invalid pagination token')
        token_key = (package['name'], package['version'], next_page_token)
        if token_key in seen_page_tokens:
          raise SecurityCheckError('OSV returned a repeated pagination token')
        seen_page_tokens.add(token_key)
        next_queries.append((package, next_page_token))
    pending_queries = next_queries

  return sorted(set((package['name'], package['version'], advisory_id) for package, advisory_id in advisories))


def describe_risk(vulnerability, package_name):
  """Extract severity and other concise risk information from an OSV record."""
  risk_items = []

  affected_entries = vulnerability.get('affected', [])
  if not isinstance(affected_entries, list):
    raise SecurityCheckError('OSV returned invalid affected-package data')
  for affected in affected_entries:
    if not isinstance(affected, dict):
      continue
    affected_package = affected.get('package')
    if not isinstance(affected_package, dict):
      continue
    if affected_package.get('name') != package_name or affected_package.get('ecosystem') != 'npm':
      continue
    for source_name in ('ecosystem_specific', 'database_specific'):
      source = affected.get(source_name)
      severity = source.get('severity') if isinstance(source, dict) else None
      if isinstance(severity, str) and severity:
        risk_items.append(f'{source_name} severity: {severity}')

  severity_entries = vulnerability.get('severity', [])
  if not isinstance(severity_entries, list):
    raise SecurityCheckError('OSV returned invalid severity data')
  for severity in severity_entries:
    if not isinstance(severity, dict):
      continue
    severity_type = severity.get('type')
    score = severity.get('score')
    if isinstance(severity_type, str) and isinstance(score, str) and score:
      risk_items.append(f'{severity_type}: {score}')

  unique_risk_items = list(dict.fromkeys(risk_items))
  if unique_risk_items:
    return '; '.join(unique_risk_items)

  summary = vulnerability.get('summary')
  if isinstance(summary, str) and summary:
    return f'summary: {summary}'
  return 'risk information: not provided by OSV'


def collect_findings(advisories, fetch=request_json):
  """Load OSV records for advisory IDs and format deterministic finding data."""
  details_by_id = {}
  findings = []
  for package_name, version, advisory_id in advisories:
    if advisory_id not in details_by_id:
      details = fetch(f'{OSV_VULNERABILITY_URL}{advisory_id}')
      if not isinstance(details, dict):
        raise SecurityCheckError(f'OSV returned an invalid advisory response for {advisory_id}')
      returned_id = details.get('id')
      if returned_id != advisory_id:
        raise SecurityCheckError(f'OSV returned an unexpected advisory for {advisory_id}')
      details_by_id[advisory_id] = details
    findings.append({
      'name': package_name,
      'version': version,
      'advisory_id': advisory_id,
      'risk': describe_risk(details_by_id[advisory_id], package_name),
    })
  return findings


def run(manifest_path=MANIFEST_PATH, fetch=request_json, stdout=None, stderr=None):
  """Run the check and return its documented process exit code."""
  stdout = stdout or sys.stdout
  stderr = stderr or sys.stderr
  try:
    packages = load_npm_packages(manifest_path)
    if not packages:
      print('no npm vendored packages found', file=stdout)
      return 0
    advisories = query_advisories(packages, fetch)
    findings = collect_findings(advisories, fetch)
  except SecurityCheckError as error:
    print(f'Security advisory check could not be completed: {error}', file=stderr)
    return 2
  except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, json.JSONDecodeError, ValueError) as error:
    print(f'Security advisory check could not be completed: {error}', file=stderr)
    return 2

  if not findings:
    print(f'no known OSV security advisories for {len(packages)} vendored npm package(s)', file=stdout)
    return 0

  for finding in findings:
    print(
      f"VULNERABLE: {finding['name']}@{finding['version']} | {finding['advisory_id']} | {finding['risk']}",
      file=stdout,
    )
  return 1


if __name__ == '__main__':
  sys.exit(run())
