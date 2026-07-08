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
python3 scripts/audit.py
HOOK

chmod +x .git/hooks/pre-commit

echo "Pre-commit hook installed: python3 scripts/audit.py"
