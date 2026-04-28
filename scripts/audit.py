#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

errors = []
HTML_FILES = sorted(ROOT.rglob('*.html'))


def collect_ids(body):
  return set(re.findall(r'<[^>]+\bid="([^"]+)"', body))


def is_local_asset_ref(ref):
  if not ref:
    return False
  if ref.startswith(('http://', 'https://', '//', 'data:', 'blob:', 'mailto:', 'tel:', '#')):
    return False
  return ref.startswith('./') or ref.startswith('../') or ref.startswith('/')


def check_local_asset_ref(base_path, ref):
  if not is_local_asset_ref(ref):
    return
  ref_path = ref.split('?', 1)[0].split('#', 1)[0]
  if ref.startswith('/'):
    target = ROOT / ref_path.lstrip('/')
  else:
    target = (base_path.parent / ref_path).resolve()
  try:
    target.relative_to(ROOT)
  except ValueError:
    errors.append(f'asset escapes repo root: {base_path.relative_to(ROOT)} -> {ref}')
    return
  if not target.exists():
    errors.append(f'missing asset ref: {base_path.relative_to(ROOT)} -> {ref}')


html_ids = {}
for path in HTML_FILES:
  body = path.read_text(encoding='utf-8', errors='ignore')
  html_ids[path] = collect_ids(body)
  for ref in sorted(set(re.findall(r'getElementById\([\'"]([^\'"]+)[\'"]\)', body))):
    if ref not in html_ids[path]:
      errors.append(f'missing id target in {path.relative_to(ROOT)}: {ref}')
  for ref in re.findall(r'\b(?:src|href)\s*=\s*["\']([^"\']+)["\']', body):
    check_local_asset_ref(path, ref)

index_ids = html_ids.get(ROOT / 'index.html', set())
for path in [ROOT / 'src' / 'main.js', ROOT / 'sw.js']:
  if not path.exists():
    continue
  body = path.read_text(encoding='utf-8', errors='ignore')
  for ref in sorted(set(re.findall(r'getElementById\([\'"]([^\'"]+)[\'"]\)', body))):
    if ref not in index_ids:
      errors.append(f'missing shell id target: {ref}')

for path in ROOT.rglob('*'):
  if path.suffix not in {'.html', '.js'}:
    continue
  body = path.read_text(encoding='utf-8', errors='ignore')
  if '-source-template' in body:
    errors.append(f'legacy source template marker still present in {path.relative_to(ROOT)}')

manifest_path = ROOT / 'manifest.webmanifest'
if manifest_path.exists():
  manifest_body = manifest_path.read_text(encoding='utf-8', errors='ignore')
  for ref in re.findall(r'"src"\s*:\s*"([^"]+)"', manifest_body):
    check_local_asset_ref(manifest_path, ref)

expected = [
  ROOT / 'manifest.webmanifest',
  ROOT / 'icon-192.png',
  ROOT / 'icon-512.png',
  ROOT / 'src' / 'main.js',
  ROOT / 'src' / 'modules' / 'planning' / 'app.html',
  ROOT / 'src' / 'modules' / 'merger' / 'app.html',
  ROOT / 'src' / 'modules' / 'duplicate-check' / 'app.html',
  ROOT / 'src' / 'modules' / 'seatplan' / 'app.html',
]

for path in expected:
  if not path.exists():
    errors.append(f'missing asset: {path.relative_to(ROOT)}')

if errors:
  print('\n'.join(errors))
  sys.exit(1)

print('audit ok')
