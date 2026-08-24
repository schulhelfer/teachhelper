#!/bin/sh
set -e

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js not found. Install Node.js to run the regression tests." >&2
  exit 1
fi

echo "Running Node.js regression tests..."
node --test tests/*.test.mjs

echo "Running PWA audit..."
run_python_checks() {
  if "$@" scripts/audit.py; then
    :
  else
    status=$?
    echo "Pre-Commit abgebrochen: Der PWA-Audit ist fehlgeschlagen." >&2
    echo "Details erneut anzeigen: $* scripts/audit.py" >&2
    return "$status"
  fi

  echo "Checking vendored package updates..."
  if "$@" scripts/check-vendor-updates.py; then
    :
  else
    status=$?
    echo "Pre-Commit abgebrochen: Die Paket-Aktualitätsprüfung ist fehlgeschlagen." >&2
    echo "Details erneut anzeigen: $* scripts/check-vendor-updates.py" >&2
    return "$status"
  fi
}

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
  run_python_checks python3
elif command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
  run_python_checks py -3
elif command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
  run_python_checks python
elif command -v wsl.exe >/dev/null 2>&1 \
  && wsl.exe python3 -c 'import sys' >/dev/null 2>&1; then
  run_python_checks wsl.exe python3
else
  echo "Warning: Python 3 not found; PWA audit skipped. Node.js regression tests passed." >&2
fi

echo "Stamping the app version..."
node scripts/stamp-app-version.mjs
