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


def extract_tutorial_case(body, start_case, end_case):
  start_marker = f'case {start_case}:'
  end_marker = f'case {end_case}:' if end_case != 'default' else 'default:'
  start = body.find(start_marker)
  end = body.find(end_marker, start + len(start_marker))
  if start < 0 or end < 0:
    errors.append(f'missing tutorial case boundary: {start_case} -> {end_case}')
    return ''
  return body[start:end]


main_path = ROOT / 'src' / 'main.js'
dom_path = ROOT / 'src' / 'app' / 'dom.js'
if main_path.exists() and dom_path.exists():
  main_body = main_path.read_text(encoding='utf-8', errors='ignore')
  dom_body = dom_path.read_text(encoding='utf-8', errors='ignore')
  tutorial_start = main_body.find('const getCurrentModuleTutorialSteps')
  tutorial_end = main_body.find('const FIRST_RUN_TUTORIAL_STEPS', tutorial_start)
  tutorial_body = main_body[tutorial_start:tutorial_end]

  tutorial_node_refs = set(re.findall(r'\bnodes\.([A-Za-z_$][\w$]*)', tutorial_body))
  dom_keys = set(re.findall(r'^\s{4}([A-Za-z_$][\w$]*):', dom_body, flags=re.MULTILINE))
  for ref in sorted(tutorial_node_refs - dom_keys):
    errors.append(f'missing tutorial DOM mapping in src/app/dom.js: {ref}')

  declared_anchors = set()
  for path in ROOT.rglob('*'):
    if path.suffix not in {'.html', '.js'}:
      continue
    body = path.read_text(encoding='utf-8', errors='ignore')
    declared_anchors.update(re.findall(r'data-tutorial-anchor=["\']([^"\']+)["\']', body))
    declared_anchors.update(re.findall(r'\.dataset\.tutorialAnchor\s*=\s*["\']([^"\']+)["\']', body))
  referenced_anchors = set(re.findall(r'data-tutorial-anchor=[\\"\']([^\\"\']+)', tutorial_body))
  for anchor in sorted(referenced_anchors - declared_anchors):
    errors.append(f'missing data-tutorial-anchor target: {anchor}')

  tutorial_modules = [
    ('TAB_GRADES', 'TAB_PLANNING', ROOT / 'src' / 'modules' / 'planning'),
    ('TAB_PLANNING', 'TAB_MERGER', ROOT / 'src' / 'modules' / 'planning'),
    ('TAB_MERGER', 'TAB_SEATPLAN', ROOT / 'src' / 'modules' / 'merger'),
    ('TAB_SEATPLAN', 'TAB_GROUPS', ROOT / 'src' / 'modules' / 'seatplan'),
    ('TAB_DUPLICATE_CHECK', 'TAB_WORK_PHASE', ROOT / 'src' / 'modules' / 'duplicate-check'),
    ('TAB_QR', 'default', ROOT / 'src' / 'modules' / 'qr'),
  ]
  for start_case, end_case, module_dir in tutorial_modules:
    case_body = extract_tutorial_case(main_body, start_case, end_case)
    selector_ids = set(re.findall(r'#([A-Za-z][\w-]*)', case_body))
    module_body = '\n'.join(
      path.read_text(encoding='utf-8', errors='ignore')
      for path in module_dir.iterdir()
      if path.suffix in {'.html', '.js'}
    )
    declared_ids = set(re.findall(r'\bid=["\'`]([^"\'`$<> ]+)', module_body))
    declared_ids.update(re.findall(r'\.id\s*=\s*["\']([^"\']+)', module_body))
    for selector_id in sorted(selector_ids - declared_ids):
      errors.append(
        f'missing tutorial selector in {module_dir.relative_to(ROOT)}: #{selector_id}'
      )

if errors:
  print('\n'.join(errors))
  sys.exit(1)

print('audit ok')
