#!/usr/bin/env python3
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

errors = []
HTML_FILES = sorted(ROOT.rglob('*.html'))
EXPECTED_CSP_POLICY = (
  "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; "
  "script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; "
  "img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self'; "
  "worker-src 'self' blob:; child-src 'self'; frame-src 'self'; media-src 'self' blob:; "
  "manifest-src 'self'; form-action 'self'"
)


def collect_ids(body):
  return set(re.findall(r'<[^>]+\bid="([^"]+)"', body))


def rel(path):
  return path.relative_to(ROOT).as_posix()


VENDOR_DIRECTORY_NAME = 'vendor'


def is_vendor_path(path):
  return VENDOR_DIRECTORY_NAME in path.relative_to(ROOT).parts


def iter_vendor_js_files():
  vendor_root = ROOT / 'src' / VENDOR_DIRECTORY_NAME
  if vendor_root.exists():
    yield from (path for path in vendor_root.rglob('*.js') if path.is_file())
  modules_root = ROOT / 'src' / 'modules'
  if modules_root.exists():
    yield from modules_root.glob(f'*/{VENDOR_DIRECTORY_NAME}/**/*.js')


def parse_html_attrs(tag):
  attrs = {}
  for match in re.finditer(
    r'([^\s/<>=]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+))',
    tag,
    flags=re.IGNORECASE,
  ):
    value = next(group for group in match.groups()[1:] if group is not None)
    attrs[match.group(1).lower()] = value
  return attrs


def parse_csp_policy(policy):
  directives = {}
  for directive in policy.split(';'):
    parts = directive.strip().split()
    if parts:
      directives[parts[0].lower()] = parts[1:]
  return directives


def check_csp_meta(path, body):
  relative_path = rel(path)
  csp_meta_tags = []
  for match in re.finditer(r'<meta\b[^>]*>', body, flags=re.IGNORECASE):
    attrs = parse_html_attrs(match.group(0))
    if attrs.get('http-equiv', '').lower() == 'content-security-policy':
      csp_meta_tags.append((match, attrs))

  if len(csp_meta_tags) != 1:
    errors.append(f'{relative_path} must contain exactly one Content-Security-Policy meta tag')
    return

  csp_match, csp_attrs = csp_meta_tags[0]
  policy = csp_attrs.get('content')
  if policy != EXPECTED_CSP_POLICY:
    errors.append(f'weak CSP in {relative_path}: policy must match EXPECTED_CSP_POLICY')

  head_open = re.search(r'<head\b[^>]*>', body, flags=re.IGNORECASE)
  head_close = re.search(r'</head\s*>', body, flags=re.IGNORECASE)
  if not head_open or not head_close or csp_match.start() < head_open.end() or csp_match.end() > head_close.start():
    errors.append(f'weak CSP in {relative_path}: CSP meta must be inside head')

  first_script = re.search(r'<script\b', body, flags=re.IGNORECASE)
  if first_script and csp_match.start() > first_script.start():
    errors.append(f'weak CSP in {relative_path}: CSP meta must appear before the first script')

  if not policy:
    errors.append(f'weak CSP in {relative_path}: CSP meta content is missing')
    return

  directives = parse_csp_policy(policy)
  required_directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'script-src-attr': ["'none'"],
  }
  for directive, expected_tokens in required_directives.items():
    if directives.get(directive) != expected_tokens:
      errors.append(
        f'weak CSP in {relative_path}: {directive} must be {" ".join(expected_tokens)} only'
      )

  all_tokens = [token for tokens in directives.values() for token in tokens]
  if "'unsafe-inline'" in all_tokens:
    errors.append(f"weak CSP in {relative_path}: 'unsafe-inline' is not allowed")
  if "'unsafe-eval'" in all_tokens:
    errors.append(f"weak CSP in {relative_path}: 'unsafe-eval' is not allowed")

  for directive in ['script-src', 'connect-src']:
    for token in directives.get(directive, []):
      if token.startswith(('http:', 'https:')):
        errors.append(f'weak CSP in {relative_path}: {directive} must not allow external HTTP(S) sources')


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
  check_csp_meta(path, body)
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
  if not path.is_file() or path.suffix not in {'.html', '.js'}:
    continue
  body = path.read_text(encoding='utf-8', errors='ignore')
  if '-source-template' in body:
    errors.append(f'legacy source template marker still present in {path.relative_to(ROOT)}')

manifest_path = ROOT / 'manifest.webmanifest'
if manifest_path.exists():
  manifest_body = manifest_path.read_text(encoding='utf-8', errors='ignore')
  for ref in re.findall(r'"src"\s*:\s*"([^"]+)"', manifest_body):
    check_local_asset_ref(manifest_path, ref)

required_precache_assets = [
  ROOT / 'src' / 'shared' / 'app-version.js',
  ROOT / 'src' / 'shared' / 'file-guards.js',
  ROOT / 'src' / 'shared' / 'roster-store.js',
  ROOT / 'src' / 'modules' / 'grades' / 'index.js',
  ROOT / 'src' / 'modules' / 'grades' / 'app.html',
  ROOT / 'src' / 'modules' / 'grades' / 'app.css',
  ROOT / 'src' / 'modules' / 'grades' / 'app.js',
  ROOT / 'src' / 'modules' / 'grades' / 'bridge.js',
  ROOT / 'src' / 'modules' / 'grades' / 'percentile-rank.js',
  ROOT / 'src' / 'modules' / 'grades' / 'expectation-horizon-template.docx',
  ROOT / 'src' / 'modules' / 'grades' / 'competence-expectations-template.docx',
  ROOT / 'src' / 'modules' / 'name-learning' / 'index.js',
  ROOT / 'src' / 'modules' / 'name-learning' / 'app.html',
  ROOT / 'src' / 'modules' / 'name-learning' / 'app.css',
  ROOT / 'src' / 'modules' / 'name-learning' / 'app.js',
  ROOT / 'src' / 'modules' / 'name-learning' / 'session.js',
  ROOT / 'src' / 'modules' / 'workspace' / 'index.js',
  ROOT / 'src' / 'modules' / 'workspace' / 'client.js',
  ROOT / 'src' / 'modules' / 'workspace' / 'components.js',
  ROOT / 'src' / 'modules' / 'workspace' / 'crypto.js',
  ROOT / 'src' / 'modules' / 'workspace' / 'store.js',
  ROOT / 'src' / 'shared' / 'docx-template.js',
  ROOT / 'src' / 'shared' / 'workspace-client.css',
  ROOT / 'src' / 'shared' / 'school-data' / 'messages.js',
  ROOT / 'src' / 'shared' / 'school-data' / 'index.js',
  ROOT / 'src' / 'shared' / 'school-data' / 'grades.js',
  ROOT / 'src' / 'shared' / 'school-data' / 'thdb.js',
]

expected = [
  ROOT / 'manifest.webmanifest',
  ROOT / 'icon-192.png',
  ROOT / 'icon-512.png',
  ROOT / 'src' / 'main.js',
  ROOT / 'src' / 'modules' / 'planning' / 'app.html',
  ROOT / 'src' / 'modules' / 'merger' / 'app.html',
  ROOT / 'src' / 'modules' / 'duplicate-check' / 'app.html',
  ROOT / 'src' / 'modules' / 'seatplan' / 'app.html',
] + required_precache_assets

for path in expected:
  if not path.exists():
    errors.append(f'missing asset: {path.relative_to(ROOT)}')


def check_service_worker_app_version():
  app_version_path = ROOT / 'src' / 'shared' / 'app-version.js'
  sw_path = ROOT / 'sw.js'
  if not app_version_path.exists() or not sw_path.exists():
    return

  app_version_source = app_version_path.read_text(encoding='utf-8', errors='ignore')
  service_worker_source = sw_path.read_text(encoding='utf-8', errors='ignore')
  app_version_match = re.search(r"\bglobalThis\.TEACHHELPER_APP_VERSION\s*=\s*'(\d+)'\s*;", app_version_source)
  if not app_version_match:
    errors.append('app version must declare a numeric TEACHHELPER_APP_VERSION in src/shared/app-version.js')
  if not re.search(
    r"^importScripts\(['\"]\./src/shared/app-version\.js['\"]\);",
    service_worker_source,
    flags=re.MULTILINE,
  ):
    errors.append('service worker must import src/shared/app-version.js before configuring caches')
  if 'self.TEACHHELPER_APP_VERSION' not in service_worker_source:
    errors.append('service worker cache version must derive from TEACHHELPER_APP_VERSION')
  marker_match = re.match(r"const TEACHHELPER_APP_VERSION_STAMP = '(\d+)';\n", service_worker_source)
  if not marker_match:
    errors.append("service worker must start with the TEACHHELPER_APP_VERSION_STAMP constant so its own bytes change per release")
  elif app_version_match and marker_match.group(1) != app_version_match.group(1):
    errors.append(
      f'service worker stamp {marker_match.group(1)} does not match app version {app_version_match.group(1)}'
    )


check_service_worker_app_version()


def iter_source_files():
  for path in ROOT.rglob('*'):
    if not path.is_file():
      continue
    if path.suffix in {'.html', '.js'}:
      yield path


FIRST_PARTY_SOURCE_SUFFIXES = {'.html', '.js', '.css'}


def iter_first_party_files():
  for path in sorted(ROOT.rglob('*')):
    if not path.is_file():
      continue
    if path.suffix not in FIRST_PARTY_SOURCE_SUFFIXES:
      continue
    if is_vendor_path(path):
      continue
    yield path


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

  discovered_vendor_js = {rel(path) for path in iter_vendor_js_files()}
  for file_path in sorted(discovered_vendor_js - manifest_js_files):
    errors.append(f'unmanifested vendored JavaScript file: {file_path}')


check_vendor_manifest()


def check_vendor_directory_locations():
  for path in ROOT.rglob(VENDOR_DIRECTORY_NAME):
    if not path.is_dir():
      continue
    relative_path = rel(path)
    if relative_path == 'src/vendor':
      continue
    if re.fullmatch(r'src/modules/[^/]+/vendor', relative_path):
      continue
    errors.append(
      f'vendor directory outside src/vendor and src/modules/*/vendor: {relative_path} '
      f'(move it, or extend check_vendor_directory_locations in scripts/audit.py)'
    )


check_vendor_directory_locations()


def check_service_worker_update_activation():
  sw_path = ROOT / 'sw.js'
  if not sw_path.exists():
    errors.append('missing service worker: sw.js')
    return

  body = sw_path.read_text(encoding='utf-8', errors='ignore')
  required_tokens = [
    'SET_UPDATE_TOKEN',
    'SKIP_WAITING',
    'updateActivationToken',
    'self.skipWaiting()',
  ]
  for token in required_tokens:
    if token not in body:
      errors.append(f'service worker update activation missing {token}')

  skip_waiting_index = body.find('self.skipWaiting()')
  if skip_waiting_index < 0:
    return

  guard = body[max(0, skip_waiting_index - 800):skip_waiting_index]
  if not re.search(r'data\.type\s*===\s*[\'"]SKIP_WAITING[\'"]', guard):
    errors.append('service worker skipWaiting must be guarded by SKIP_WAITING message type')
  if not re.search(
    r'(?:data\.token\s*={2,3}\s*updateActivationToken|updateActivationToken\s*={2,3}\s*data\.token)',
    guard,
  ):
    errors.append('service worker SKIP_WAITING must require updateActivationToken')


check_service_worker_update_activation()


def check_required_precache_assets():
  sw_path = ROOT / 'sw.js'
  if not sw_path.exists():
    return

  body = sw_path.read_text(encoding='utf-8', errors='ignore')
  app_shell_match = re.search(
    r'\bconst\s+APP_SHELL\s*=\s*\[(?P<assets>.*?)\]\s*;',
    body,
    flags=re.DOTALL,
  )
  if not app_shell_match:
    errors.append('service worker must declare an APP_SHELL asset list')
    return

  app_shell_body = app_shell_match.group('assets')
  for path in required_precache_assets:
    asset_ref = f'./{rel(path)}'
    if not re.search(rf'[\'\"]{re.escape(asset_ref)}[\'\"]', app_shell_body):
      errors.append(f'missing required service worker precache asset: {asset_ref}')


check_required_precache_assets()


FORBIDDEN_FIRST_PARTY_IDENTIFIERS = {
  'eval': r'(?<![.\w$])eval\s*\(',
  'new Function': r'\bnew\s+Function\s*\(',
  'Function constructor': r'(?<![.\w$])(?<!new\s)Function\s*\(\s*[\'"`]',
  'WebSocket': r'\bWebSocket\b',
  'EventSource': r'\bEventSource\b',
  'sendBeacon': r'\bsendBeacon\b',
  'XMLHttpRequest': r'\bXMLHttpRequest\b',
  'importScripts': r'\bimportScripts\s*\(',
}

FORBIDDEN_IDENTIFIER_ALLOWLIST = {
  ('src/shared/ocr-worker.js', 'importScripts'),
  ('sw.js', 'importScripts'),
}

ALLOWED_EXTERNAL_HOSTS = {
  'www.w3.org',
  'schemas.openxmlformats.org',
  'www.mk.niedersachsen.de',
  'www.tagesschau.de',
  'www.schure.de',
}

EXTERNAL_URL_PATTERN = re.compile(r'https?://([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)')
HOSTNAME_PATTERN = re.compile(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}')

SAFE_URL_CONSTANT_PATTERN = re.compile(
  r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+URL\(\s*[\'"`](?!https?:|//)'
)
SAFE_URL_FACTORY_PATTERN = re.compile(
  r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*new\s+URL\(\s*[\'"`](?!https?:|//)'
)
SCRIPT_ELEMENT_PATTERN = re.compile(
  r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*[\'"`]script[\'"`]'
)
RELATIVE_LITERAL_PATTERN = re.compile(r'[\'"](?!https?:|//|data:)[^\'"]*[\'"]')

DYNAMIC_SCRIPT_URL_ALLOWLIST = {
  ('src/shared/pdf-vendor.js', 'url.href'),
}


def line_number_at(body, index):
  return body.count('\n', 0, index) + 1


def find_forbidden_identifier_issues(relative_path, body):
  issues = []
  for label, pattern in sorted(FORBIDDEN_FIRST_PARTY_IDENTIFIERS.items()):
    if (relative_path, label) in FORBIDDEN_IDENTIFIER_ALLOWLIST:
      continue
    match = re.search(pattern, body)
    if not match:
      continue
    issues.append(
      f'forbidden first-party API {label} in {relative_path}:{line_number_at(body, match.start())} '
      f'(remove it, or add ("{relative_path}", "{label}") to '
      f'FORBIDDEN_IDENTIFIER_ALLOWLIST in scripts/audit.py)'
    )
  return issues


def find_external_host_issues(relative_path, body):
  issues = []
  seen_hosts = set()
  for match in EXTERNAL_URL_PATTERN.finditer(body):
    host = match.group(1).lower()
    if not HOSTNAME_PATTERN.fullmatch(host):
      continue
    if host in ALLOWED_EXTERNAL_HOSTS or host in seen_hosts:
      continue
    seen_hosts.add(host)
    issues.append(
      f'external host not allowlisted: {relative_path}:{line_number_at(body, match.start())} -> {host} '
      f'(add it to ALLOWED_EXTERNAL_HOSTS in scripts/audit.py if it is an inert '
      f'namespace or a user-visible link)'
    )
  return issues


def collect_safe_url_expressions(body):
  safe = set()
  for name in SAFE_URL_CONSTANT_PATTERN.findall(body):
    safe.add(name)
    safe.add(f'{name}.href')
    safe.add(f'{name}.pathname')
  return safe


def collect_safe_url_factories(body):
  return set(SAFE_URL_FACTORY_PATTERN.findall(body))


def read_call_argument(body, open_paren_index):
  depth = 0
  index = open_paren_index
  while index < len(body):
    character = body[index]
    if character in '([{':
      depth += 1
    elif character in ')]}':
      depth -= 1
      if depth == 0:
        return body[open_paren_index + 1:index], index
    index += 1
  return None, open_paren_index


def read_assignment_expression(body, equals_index):
  depth = 0
  index = equals_index + 1
  while index < len(body):
    character = body[index]
    if character in '([{':
      depth += 1
    elif character in ')]}':
      if depth == 0:
        break
      depth -= 1
    elif character == ';' and depth == 0:
      break
    elif character == '\n' and depth == 0:
      break
    index += 1
  return body[equals_index + 1:index]


def is_relative_url_literal(expression):
  expression = expression.strip()
  if RELATIVE_LITERAL_PATTERN.fullmatch(expression):
    return True
  if expression.startswith('`') and expression.endswith('`'):
    return not re.match(r'`\s*(?:https?:|//)', expression)
  return False


def is_safe_script_url_expression(expression, safe_expressions, safe_factories):
  expression = expression.strip().rstrip(';').strip()
  if is_relative_url_literal(expression):
    return True
  factory_call = re.fullmatch(
    r'([A-Za-z_$][\w$]*)\((.*)\)(?:\.[\w$]+)?', expression, flags=re.DOTALL
  )
  if factory_call and factory_call.group(1) in safe_factories:
    return is_relative_url_literal(factory_call.group(2))
  return expression in safe_expressions


def find_dynamic_script_url_issues(relative_path, body):
  issues = []
  safe_expressions = collect_safe_url_expressions(body)
  safe_factories = collect_safe_url_factories(body)
  script_names = set(SCRIPT_ELEMENT_PATTERN.findall(body)) | {'script'}
  names_pattern = '|'.join(sorted(re.escape(name) for name in script_names))
  candidates = []
  for match in re.finditer(rf'\b(?:{names_pattern})\.src\s*(=)\s*', body):
    candidates.append((match.start(), read_assignment_expression(body, match.start(1))))
  for match in re.finditer(r'(?<![.\w$])(?:import|importScripts)\s*(\()', body):
    argument, _ = read_call_argument(body, match.start(1))
    if argument is not None:
      candidates.append((match.start(), argument))
  for start_index, expression in sorted(candidates):
    expression = expression.strip()
    if is_safe_script_url_expression(expression, safe_expressions, safe_factories):
      continue
    if (relative_path, expression) in DYNAMIC_SCRIPT_URL_ALLOWLIST:
      continue
    issues.append(
      f'dynamic script URL is not a relative literal or a local new URL(...) constant: '
      f'{relative_path}:{line_number_at(body, start_index)} -> {expression} '
      f"(bind it to a const NAME = new URL('../relative/path', import.meta.url) "
      f'in the same file, or add ("{relative_path}", "{expression}") to '
      f'DYNAMIC_SCRIPT_URL_ALLOWLIST in scripts/audit.py)'
    )
  return issues


def check_first_party_code():
  for path in iter_first_party_files():
    relative_path = rel(path)
    body = path.read_text(encoding='utf-8', errors='ignore')
    errors.extend(find_external_host_issues(relative_path, body))
    if path.suffix == '.css':
      continue
    errors.extend(find_forbidden_identifier_issues(relative_path, body))
    errors.extend(find_dynamic_script_url_issues(relative_path, body))


check_first_party_code()


bridge_path = ROOT / 'src' / 'shared' / 'module-frame-bridge.js'
main_path = ROOT / 'src' / 'main.js'
planning_index_path = ROOT / 'src' / 'modules' / 'planning' / 'index.js'
grades_index_path = ROOT / 'src' / 'modules' / 'grades' / 'index.js'
qr_index_path = ROOT / 'src' / 'modules' / 'qr' / 'index.js'
seatplan_index_path = ROOT / 'src' / 'modules' / 'seatplan' / 'index.js'
name_learning_index_path = ROOT / 'src' / 'modules' / 'name-learning' / 'index.js'
merger_index_path = ROOT / 'src' / 'modules' / 'merger' / 'index.js'
duplicate_check_index_path = ROOT / 'src' / 'modules' / 'duplicate-check' / 'index.js'
help_visuals_path = ROOT / 'src' / 'app' / 'help-visuals.js'
bootstrap_path = ROOT / 'src' / 'app' / 'bootstrap.js'
isolated_tool_module_sandbox_profiles = {
  name_learning_index_path: 'ISOLATED_MODULE_SANDBOX',
  qr_index_path: 'QR_MODULE_SANDBOX',
  merger_index_path: 'MERGER_MODULE_SANDBOX',
  duplicate_check_index_path: 'DUPLICATE_CHECK_MODULE_SANDBOX',
}
isolated_sandbox_profile_tokens = {
  'ISOLATED_MODULE_SANDBOX': {'allow-scripts'},
  'MERGER_MODULE_SANDBOX': {'allow-scripts', 'allow-downloads'},
  'DUPLICATE_CHECK_MODULE_SANDBOX': {'allow-scripts', 'allow-downloads'},
  'QR_MODULE_SANDBOX': {'allow-scripts', 'allow-downloads'},
}
isolated_sandbox_profile_names = set(isolated_sandbox_profile_tokens)
privileged_sandbox_tokens = {
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
}

for path in iter_source_files():
  body = path.read_text(encoding='utf-8', errors='ignore')
  if path != bridge_path and re.search(r'document\.createElement\(\s*[\'"]iframe[\'"]\s*\)', body):
    errors.append(f'direct iframe creation outside module-frame-bridge: {rel(path)}')
  if re.search(r'<\s*iframe\b', body, flags=re.IGNORECASE):
    errors.append(f'direct iframe markup outside module-frame-bridge: {rel(path)}')

if bridge_path.exists():
  bridge_body = bridge_path.read_text(encoding='utf-8', errors='ignore')
  sandbox_profiles = {
    match.group('name'): match.group('tokens').split()
    for match in re.finditer(
      r'export\s+const\s+(?P<name>[A-Z_]+_MODULE_SANDBOX)\s*=\s*([\'"])(?P<tokens>.*?)\2',
      bridge_body,
      flags=re.DOTALL,
    )
  }
  for profile_name, tokens in sorted(sandbox_profiles.items()):
    if 'allow-same-origin' in tokens:
      errors.append(f'{profile_name} must not include allow-same-origin')
    privileged_tokens = sorted(set(tokens) & privileged_sandbox_tokens)
    if profile_name not in isolated_sandbox_profile_names and privileged_tokens:
      errors.append(
        f'{profile_name} grants privileged sandbox tokens without an explicit audit allowlist: {", ".join(privileged_tokens)}'
      )
  for profile_name in sorted(isolated_sandbox_profile_names):
    if profile_name not in sandbox_profiles:
      errors.append(f'missing {profile_name} in src/shared/module-frame-bridge.js')
      continue
    expected_tokens = isolated_sandbox_profile_tokens[profile_name]
    actual_tokens = set(sandbox_profiles[profile_name])
    if actual_tokens != expected_tokens:
      errors.append(
        f'{profile_name} tokens must be {", ".join(sorted(expected_tokens))}; got {", ".join(sorted(actual_tokens))}'
      )
  for profile_name, tokens in sorted(sandbox_profiles.items()):
    if profile_name not in isolated_sandbox_profile_names:
      continue
    if (
      'allow-popups-to-escape-sandbox' in tokens
      and 'allow-popups' not in tokens
    ):
      errors.append(f'{profile_name} must include allow-popups with allow-popups-to-escape-sandbox')

for path, expected_sandbox_profile in isolated_tool_module_sandbox_profiles.items():
  if not path.exists():
    continue
  body = path.read_text(encoding='utf-8', errors='ignore')
  if expected_sandbox_profile not in body:
    errors.append(f'missing {expected_sandbox_profile} import/use in {rel(path)}')
  if not re.search(rf'\bsandbox\s*:\s*{expected_sandbox_profile}\b', body):
    errors.append(f'missing {expected_sandbox_profile} sandbox option in {rel(path)}')
  if 'allow-same-origin' in body:
    errors.append(f'isolated tool module must not request allow-same-origin: {rel(path)}')

unsandboxed_module_frame_allowed_paths = {
  bridge_path,
  main_path,
  planning_index_path,
  grades_index_path,
  seatplan_index_path,
}
same_origin_frame_profiles = {
  help_visuals_path: 'HELP_PREVIEW_FRAME_SANDBOX',
}
help_preview_frame_sandbox_tokens = {'allow-scripts', 'allow-same-origin'}
if bridge_path.exists():
  help_preview_sandbox_match = re.search(
    r'export\s+const\s+HELP_PREVIEW_FRAME_SANDBOX\s*=\s*([\'"])(?P<tokens>.*?)\1',
    bridge_path.read_text(encoding='utf-8', errors='ignore'),
  )
  if not help_preview_sandbox_match:
    errors.append('missing HELP_PREVIEW_FRAME_SANDBOX in src/shared/module-frame-bridge.js')
  elif set(help_preview_sandbox_match.group('tokens').split()) != help_preview_frame_sandbox_tokens:
    errors.append(
      'HELP_PREVIEW_FRAME_SANDBOX tokens must be '
      f'{", ".join(sorted(help_preview_frame_sandbox_tokens))}; '
      f'got {help_preview_sandbox_match.group("tokens")}'
    )

for path in iter_source_files():
  body = path.read_text(encoding='utf-8', errors='ignore')
  if 'createModuleFrame' not in body or path in unsandboxed_module_frame_allowed_paths:
    continue
  allowed_same_origin_profile = same_origin_frame_profiles.get(path)
  if allowed_same_origin_profile:
    if not re.search(rf'\bsandbox\s*:\s*{allowed_same_origin_profile}\b', body):
      errors.append(f'{rel(path)} must request its frame with {allowed_same_origin_profile}')
    bootstrap_body = bootstrap_path.read_text(encoding='utf-8', errors='ignore') if bootstrap_path.exists() else ''
    if not re.search(r'ephemeral\s*:[^,]*helpPreviewRequest', bootstrap_body):
      errors.append('help preview frames require the ephemeral workspace guard in src/app/bootstrap.js')
    continue
  sandbox_profile_pattern = '|'.join(sorted(isolated_sandbox_profile_names))
  if not re.search(rf'\bsandbox\s*:\s*(?:{sandbox_profile_pattern})\b', body):
    errors.append(f'new module frames must use a known module sandbox profile or be explicitly allowlisted: {rel(path)}')

standalone_guard_path = ROOT / 'src' / 'shared' / 'module-standalone-guard.js'
standalone_guard_deep_link_tabs = {'merger', 'duplicate-check', 'qr'}
module_page_tabs = {
  'grades': 'grades',
  'planning': 'planning',
  'seatplan': 'seatplan',
  'name-learning': 'name-learning',
  'merger': 'merger',
  'duplicate-check': 'duplicate-check',
  'qr': 'qr',
}

if not standalone_guard_path.exists():
  errors.append('missing src/shared/module-standalone-guard.js')
else:
  guard_body = standalone_guard_path.read_text(encoding='utf-8', errors='ignore')
  if not re.search(r'window\.top\s*&&\s*window\.top\s*!==\s*window', guard_body):
    errors.append('module standalone guard must detect top-level documents via window.top')
  if 'document.documentElement.remove()' not in guard_body:
    errors.append('module standalone guard must stop the page build via documentElement.remove()')
  guard_tabs = re.search(r'const DEEP_LINK_TABS = new Set\(\[([^\]]*)\]\)', guard_body)
  if not guard_tabs:
    errors.append('module standalone guard must declare DEEP_LINK_TABS')
  elif set(re.findall(r"'([^']+)'", guard_tabs.group(1))) != standalone_guard_deep_link_tabs:
    errors.append('module standalone guard deep link tabs must match the tear-off tool modules')

for module_name, expected_tab in sorted(module_page_tabs.items()):
  page_path = ROOT / 'src' / 'modules' / module_name / 'app.html'
  if not page_path.exists():
    errors.append(f'missing module page: {rel(page_path)}')
    continue
  page_body = page_path.read_text(encoding='utf-8', errors='ignore')
  first_script = re.search(r'<script\b[^>]*>', page_body, flags=re.IGNORECASE)
  if not first_script:
    errors.append(f'{rel(page_path)} must load the module standalone guard')
    continue
  if 'module-standalone-guard.js' not in first_script.group(0):
    errors.append(f'the module standalone guard must be the first script in {rel(page_path)}')
  if f'data-module-tab="{expected_tab}"' not in first_script.group(0):
    errors.append(f'{rel(page_path)} must declare data-module-tab="{expected_tab}"')

for module_name in ('grades', 'planning'):
  app_path = ROOT / 'src' / 'modules' / module_name / 'app.js'
  if not app_path.exists():
    continue
  app_body = app_path.read_text(encoding='utf-8', errors='ignore')
  fallback = re.search(
    r'getParentWorkspaceController\(\)\s*\|\|\s*createWorkspaceController\(\{.*?\}\)',
    app_body,
    flags=re.DOTALL,
  )
  if not fallback:
    errors.append(f'missing workspace controller fallback in {rel(app_path)}')
  elif not re.search(r'ephemeral:\s*true', fallback.group(0)):
    errors.append(f'standalone workspace fallback must stay ephemeral in {rel(app_path)}')

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
  tutorial_start = main_body.find('const getModuleTutorialDefinition')
  tutorial_end = main_body.find('function bindTabNavigation', tutorial_start)
  tutorial_body = main_body[tutorial_start:tutorial_end]

  tutorial_node_refs = set(re.findall(r'\bnodes\.([A-Za-z_$][\w$]*)', tutorial_body))
  dom_keys = set(re.findall(r'^\s{4}([A-Za-z_$][\w$]*):', dom_body, flags=re.MULTILINE))
  for ref in sorted(tutorial_node_refs - dom_keys):
    errors.append(f'missing tutorial DOM mapping in src/app/dom.js: {ref}')

  declared_anchors = set()
  for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix not in {'.html', '.js'}:
      continue
    if path == main_path:
      continue
    body = path.read_text(encoding='utf-8', errors='ignore')
    declared_anchors.update(re.findall(r'data-tutorial-anchor=["\']([^"\']+)["\']', body))
    declared_anchors.update(re.findall(r'\.dataset\.tutorialAnchor\s*=\s*["\']([^"\']+)["\']', body))
  referenced_anchors = set(re.findall(r'data-tutorial-anchor=[\\"\']([^\\"\']+)', tutorial_body))
  for anchor in sorted(referenced_anchors - declared_anchors):
    errors.append(f'missing data-tutorial-anchor target: {anchor}')

  tutorial_modules = [
    ('TAB_GRADES', 'TAB_PLANNING', ROOT / 'src' / 'modules' / 'grades'),
    ('TAB_PLANNING', 'TAB_MERGER', ROOT / 'src' / 'modules' / 'planning'),
    ('TAB_MERGER', 'TAB_SEATPLAN', ROOT / 'src' / 'modules' / 'merger'),
    ('TAB_SEATPLAN', 'TAB_GROUPS', ROOT / 'src' / 'modules' / 'seatplan'),
    ('TAB_DUPLICATE_CHECK', 'TAB_WORK_PHASE', ROOT / 'src' / 'modules' / 'duplicate-check'),
    ('TAB_QR', 'TAB_NAME_LEARNING', ROOT / 'src' / 'modules' / 'qr'),
    ('TAB_NAME_LEARNING', 'default', ROOT / 'src' / 'modules' / 'name-learning'),
  ]
  for start_case, end_case, module_dir in tutorial_modules:
    case_body = extract_tutorial_case(main_body, start_case, end_case)
    selector_ids = set(re.findall(r'#([A-Za-z][\w-]*)', case_body))
    module_body = '\n'.join(
      path.read_text(encoding='utf-8', errors='ignore')
      for path in module_dir.iterdir()
      if path.suffix in {'.html', '.js'}
    )
    if module_dir.name in {'grades', 'planning'}:
      module_body += '\n' + (ROOT / 'src' / 'modules' / 'workspace' / 'components.js').read_text(
        encoding='utf-8', errors='ignore'
      )
    declared_ids = set(re.findall(r'\bid=["\'`]([^"\'`$<> ]+)', module_body))
    declared_ids.update(re.findall(r'\.id\s*=\s*["\']([^"\']+)', module_body))
    for selector_id in sorted(selector_ids - declared_ids):
      errors.append(
        f'missing tutorial selector in {module_dir.relative_to(ROOT)}: #{selector_id}'
      )

if __name__ == '__main__':
  if errors:
    print('\n'.join(errors))
    sys.exit(1)

  print('audit ok')
