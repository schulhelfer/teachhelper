#!/bin/sh

if ! command -v node >/dev/null 2>&1; then
  NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  fi
fi

set -e

run_python_checks() {
  if "$@" scripts/audit.py; then
    :
  else
    status=$?
    echo "Pre-Commit abgebrochen: Der PWA-Audit ist fehlgeschlagen." >&2
    echo "Details erneut anzeigen: $* scripts/audit.py" >&2
    return "$status"
  fi

  echo "Running Python regression tests..."
  for python_test in tests/*.test.py; do
    if "$@" "$python_test"; then
      :
    else
      status=$?
      echo "Pre-Commit abgebrochen: $python_test ist fehlgeschlagen." >&2
      echo "Details erneut anzeigen: $* $python_test" >&2
      return "$status"
    fi
  done

  echo "Checking vendored package security advisories..."
  if "$@" scripts/check-vendor-security.py; then
    :
  else
    status=$?
    echo "Pre-Commit abgebrochen: Die Sicherheits-Advisory-Prüfung ist fehlgeschlagen." >&2
    echo "Details erneut anzeigen: $* scripts/check-vendor-security.py" >&2
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
  python_runner=python3
elif command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
  python_runner=py
elif command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
  python_runner=python
elif command -v wsl.exe >/dev/null 2>&1 \
  && wsl.exe python3 -c 'import sys' >/dev/null 2>&1; then
  python_runner=wsl
else
  echo "Error: Python 3 not found or not executable. Install Python 3 to run the required pre-commit checks." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js not found. Install Node.js to run the regression tests." >&2
  exit 1
fi

echo "Running Node.js regression tests..."
node --test tests/*.test.mjs

echo "Running PWA audit..."
case "$python_runner" in
  python3)
    run_python_checks python3
    ;;
  py)
    run_python_checks py -3
    ;;
  python)
    run_python_checks python
    ;;
  wsl)
    run_python_checks wsl.exe python3
    ;;
esac

echo "Stamping the app version..."
node scripts/stamp-app-version.mjs
