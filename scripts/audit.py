#!/usr/bin/env python3
import hashlib
import json
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


def iter_source_files():
  for path in ROOT.rglob('*'):
    if path.suffix in {'.html', '.js'}:
      yield path


def rel(path):
  return path.relative_to(ROOT).as_posix()


def sha256_file(path):
  digest = hashlib.sha256()
  with path.open('rb') as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b''):
      digest.update(chunk)
  return digest.hexdigest()


def check_vendor_manifest():
  manifest_path = ROOT / 'vendor-manifest.json'
  if not manifest_path.exists():
    errors.append('missing vendor manifest: vendor-manifest.json')
    return

  try:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
  except json.JSONDecodeError as error:
    errors.append(f'invalid vendor manifest JSON: {error}')
    return

  packages = manifest.get('packages')
  if not isinstance(packages, list):
    errors.append('vendor manifest must contain a packages array')
    return

  manifest_files = set()
  manifest_js_files = set()
  for package in packages:
    package_name = package.get('name', '<unnamed>') if isinstance(package, dict) else '<invalid>'
    if not isinstance(package, dict):
      errors.append('vendor manifest package entries must be objects')
      continue
    files = package.get('files')
    if not isinstance(files, list) or not files:
      errors.append(f'vendor manifest package has no files: {package_name}')
      continue
    for file_entry in files:
      if not isinstance(file_entry, dict):
        errors.append(f'vendor manifest file entry must be an object: {package_name}')
        continue
      file_path = file_entry.get('path')
      expected_hash = file_entry.get('sha256')
      if not isinstance(file_path, str) or not file_path:
        errors.append(f'vendor manifest file path missing: {package_name}')
        continue
      if file_path.startswith('/') or '..' in Path(file_path).parts:
        errors.append(f'vendor manifest file path escapes repo root: {file_path}')
        continue
      if file_path in manifest_files:
        errors.append(f'duplicate vendor manifest file: {file_path}')
        continue
      manifest_files.add(file_path)
      if file_path.endswith('.js'):
        manifest_js_files.add(file_path)
      if not isinstance(expected_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
        errors.append(f'invalid vendor manifest sha256 for {file_path}')
        continue
      absolute_path = ROOT / file_path
      if not absolute_path.exists():
        errors.append(f'missing vendored file: {file_path}')
        continue
      actual_hash = sha256_file(absolute_path)
      if actual_hash != expected_hash:
        errors.append(
          f'vendored file hash mismatch: {file_path} '
          f'(expected {expected_hash}, got {actual_hash})'
        )

  discovered_vendor_js = set()
  vendor_root = ROOT / 'src' / 'vendor'
  if vendor_root.exists():
    discovered_vendor_js.update(rel(path) for path in vendor_root.rglob('*.js'))
  modules_root = ROOT / 'src' / 'modules'
  if modules_root.exists():
    discovered_vendor_js.update(rel(path) for path in modules_root.glob('*/vendor/**/*.js'))
  for file_path in sorted(discovered_vendor_js - manifest_js_files):
    errors.append(f'unmanifested vendored JavaScript file: {file_path}')


check_vendor_manifest()


bridge_path = ROOT / 'src' / 'shared' / 'module-frame-bridge.js'
main_path = ROOT / 'src' / 'main.js'
planning_index_path = ROOT / 'src' / 'modules' / 'planning' / 'index.js'
qr_index_path = ROOT / 'src' / 'modules' / 'qr' / 'index.js'
seatplan_index_path = ROOT / 'src' / 'modules' / 'seatplan' / 'index.js'
isolated_tool_module_indexes = [
  ROOT / 'src' / 'modules' / 'qr' / 'index.js',
  ROOT / 'src' / 'modules' / 'merger' / 'index.js',
  ROOT / 'src' / 'modules' / 'duplicate-check' / 'index.js',
]

for path in iter_source_files():
  body = path.read_text(encoding='utf-8', errors='ignore')
  if path != bridge_path and re.search(r'document\.createElement\(\s*[\'"]iframe[\'"]\s*\)', body):
    errors.append(f'direct iframe creation outside module-frame-bridge: {rel(path)}')
  if re.search(r'<\s*iframe\b', body, flags=re.IGNORECASE):
    errors.append(f'direct iframe markup outside module-frame-bridge: {rel(path)}')

if bridge_path.exists():
  bridge_body = bridge_path.read_text(encoding='utf-8', errors='ignore')
  sandbox_match = re.search(
    r'ISOLATED_MODULE_SANDBOX\s*=\s*([\'"])(?P<tokens>.*?)\1',
    bridge_body,
    flags=re.DOTALL,
  )
  if not sandbox_match:
    errors.append('missing ISOLATED_MODULE_SANDBOX in src/shared/module-frame-bridge.js')
  elif 'allow-same-origin' in sandbox_match.group('tokens').split():
    errors.append('ISOLATED_MODULE_SANDBOX must not include allow-same-origin')

for path in isolated_tool_module_indexes:
  if not path.exists():
    continue
  body = path.read_text(encoding='utf-8', errors='ignore')
  if 'ISOLATED_MODULE_SANDBOX' not in body:
    errors.append(f'missing ISOLATED_MODULE_SANDBOX import/use in {rel(path)}')
  if not re.search(r'\bsandbox\s*:\s*ISOLATED_MODULE_SANDBOX\b', body):
    errors.append(f'missing isolated sandbox option in {rel(path)}')
  if 'allow-same-origin' in body:
    errors.append(f'isolated tool module must not request allow-same-origin: {rel(path)}')

unsandboxed_module_frame_allowed_paths = {
  bridge_path,
  main_path,
  planning_index_path,
  seatplan_index_path,
}
for path in iter_source_files():
  body = path.read_text(encoding='utf-8', errors='ignore')
  if 'createModuleFrame' not in body or path in unsandboxed_module_frame_allowed_paths:
    continue
  if not re.search(r'\bsandbox\s*:\s*ISOLATED_MODULE_SANDBOX\b', body):
    errors.append(f'new module frames must use ISOLATED_MODULE_SANDBOX or be explicitly allowlisted: {rel(path)}')

camera_allow_allowed_paths = {bridge_path, qr_index_path}
for path in iter_source_files():
  body = path.read_text(encoding='utf-8', errors='ignore')
  if 'CAMERA_MODULE_ALLOW' in body and path not in camera_allow_allowed_paths:
    errors.append(f'CAMERA_MODULE_ALLOW is only allowed for QR module frames: {rel(path)}')
  if path != qr_index_path:
    if re.search(r'\ballow\s*:\s*CAMERA_MODULE_ALLOW\b', body):
      errors.append(f'camera/clipboard iframe permissions are only allowed for QR: {rel(path)}')
    for allow_value in re.findall(r'\ballow\s*=\s*["\']([^"\']+)["\']', body):
      if re.search(r'\b(?:camera|clipboard-read|clipboard-write)\b(?!\s+[\'"]none[\'"])', allow_value):
        errors.append(f'camera/clipboard iframe allow attribute outside QR: {rel(path)}')


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
