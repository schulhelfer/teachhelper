#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / 'vendor-manifest.json'


def npm_latest_version(package_name):
  quoted = urllib.parse.quote(package_name, safe='')
  url = f'https://registry.npmjs.org/{quoted}/latest'
  with urllib.request.urlopen(url, timeout=15) as response:
    payload = json.loads(response.read().decode('utf-8'))
  return payload.get('version')


def main():
  try:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
  except OSError as error:
    print(f'could not read vendor manifest: {error}', file=sys.stderr)
    return 2
  except json.JSONDecodeError as error:
    print(f'could not parse vendor manifest: {error}', file=sys.stderr)
    return 2

  outdated = []
  checked = 0
  for package in manifest.get('packages', []):
    if package.get('registry') != 'npm':
      continue
    package_name = package.get('package') or package.get('name')
    current_version = str(package.get('version') or '')
    if not package_name or not current_version:
      print(f'skipping incomplete npm entry: {package.get("name", "<unnamed>")}')
      continue
    try:
      latest_version = npm_latest_version(package_name)
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
      print(f'could not check {package_name}: {error}', file=sys.stderr)
      return 2
    checked += 1
    status = 'ok' if latest_version == current_version else 'outdated'
    print(f'{package_name}: current {current_version}, latest {latest_version} [{status}]')
    if latest_version != current_version:
      outdated.append((package_name, current_version, latest_version))

  if not checked:
    print('no npm vendored packages found')
    return 0
  if outdated:
    return 1
  return 0


if __name__ == '__main__':
  sys.exit(main())
