#!/bin/sh
set -e

if [ ! -f scripts/pre-commit-checks.sh ]; then
  echo "Error: scripts/pre-commit-checks.sh not found. Run this script from the repository root." >&2
  exit 1
fi

mkdir -p .git/hooks

cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
set -e

exec sh scripts/pre-commit-checks.sh
HOOK

chmod +x .git/hooks/pre-commit

echo "Pre-commit hook installed: Node.js tests and Python 3 audit"
