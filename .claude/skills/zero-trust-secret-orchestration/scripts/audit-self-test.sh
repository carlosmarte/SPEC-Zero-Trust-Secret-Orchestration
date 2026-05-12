#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$SKILL_DIR/references"
EXIT=0

run() {
  local n="$1" pattern="$2"
  local hits
  hits=$(grep -nrIE "$pattern" "$TARGET" \
      --exclude-dir=node_modules \
      --exclude-dir=.venv \
      --exclude-dir=__tests__ \
      --exclude-dir=tests \
      || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL signal $n: $hits"
    EXIT=1
  fi
}

# Signals 1, 2, 5 — must return zero hits against `references/`.
run 1 '\bexecSync\b|subprocess\.(run|call|check_output)|os\.system\('
run 2 'process\.env\[[^]]+\]\s*=|os\.environ\[[^]]+\]\s*=|os\.environ\.update\('
run 5 'stdio:[[:space:]]*["'"'"']inherit["'"'"']|stdout=sys\.stdout|stderr=sys\.stderr'

if (( EXIT == 0 )); then
  echo "OK — references/ has no FAIL/WARN hits for signals 1, 2, 5."
fi
exit "$EXIT"
