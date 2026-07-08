#!/bin/sh
set -e

if [ ! -f scripts/audit.py ]; then
  echo "Error: scripts/audit.py not found. Run this script from the repository root." >&2
  exit 1
fi

mkdir -p .git/hooks

cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
set -e

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
  exec python3 scripts/audit.py
fi

if command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
  exec py -3 scripts/audit.py
fi

if command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
  exec python scripts/audit.py
fi

if command -v wsl.exe >/dev/null 2>&1; then
  exec wsl.exe python3 scripts/audit.py
fi

echo "Error: Python 3 not found. Install Python 3, run commits from WSL, or install WSL with python3." >&2
exit 1
HOOK

chmod +x .git/hooks/pre-commit

echo "Pre-commit hook installed: Python 3 audit runner"
