#!/usr/bin/env bash
# Usage: audit.sh <repo-path>
# Emits the audit report table on stdout. Exits 0 even when findings exist —
# the table itself is the contract; downstream tooling decides whether a
# FAIL row should block.
#
# Portable to bash 3.2 (macOS default) — no associative arrays.
set -euo pipefail

REPO="${1:?usage: audit.sh <repo-path>}"
if [[ ! -d "$REPO" ]]; then
  echo "audit.sh: not a directory: $REPO" >&2
  exit 2
fi

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.venv
  --exclude-dir=__tests__
  --exclude-dir=tests
  --exclude-dir=fixtures
  --exclude-dir=build
  --exclude-dir=dist
  --exclude-dir=.git
)

signal_name() {
  case "$1" in
    1) echo "execSync for secret retrieval" ;;
    2) echo "writeback to env" ;;
    3) echo "non-stub .env committed" ;;
    4) echo "plaintext input for secrets" ;;
    5) echo "uncaptured stdio" ;;
    6) echo "SystemEnvStrategy in development" ;;
    7) echo "no biometric strategy in chain" ;;
  esac
}

severity() {
  case "$1" in
    1|2|3|6) echo "FAIL" ;;
    4|5|7)   echo "WARN" ;;
  esac
}

remediation() {
  case "$1" in
    1) echo "See \`references/mjs/src/strategies/keychain-biometric.mjs\`" ;;
    2) echo "Attach secrets to app state (\`fastify.decorate\`/\`app.state\`); never write back to env" ;;
    3) echo "Remove \`.env\` from git; rotate all values; resolve via the chain" ;;
    4) echo "Use \`SecureField\` (SwiftUI) or password \`<input>\` instead of plaintext" ;;
    5) echo "Use \`runSandboxed\` / \`run_sandboxed\` — never inherit stdio" ;;
    6) echo "Drop \`SystemEnvStrategy\` from the chain in development" ;;
    7) echo "Add \`new KeychainBiometricStrategy()\` to the local chain" ;;
  esac
}

emit_row() {
  printf '| %s (%s) | %s | %s | %s |\n' \
    "$1" "$(signal_name "$1")" "$2" "$(severity "$1")" "$(remediation "$1")"
}

ROWS=()

collect() {
  local n="$1" pattern="$2"
  local line fileline
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fileline=$(printf '%s' "$line" | awk -F: '{ printf "%s:%s", $1, $2 }')
    ROWS+=("$(emit_row "$n" "$fileline")")
  done < <(grep -nrIE "$pattern" "$REPO" "${EXCLUDES[@]}" 2>/dev/null || true)
}

# Signal 1 — execSync / blocking subprocess
collect 1 '\bexecSync\b|subprocess\.(run|call|check_output)|os\.system\('

# Signal 2 — writeback to env
collect 2 'process\.env\[[^]]+\]\s*=|os\.environ\[[^]]+\]\s*=|os\.environ\.update\('

# Signal 3 — non-stub .env committed
if command -v git >/dev/null 2>&1 && git -C "$REPO" rev-parse >/dev/null 2>&1; then
  while IFS= read -r envfile; do
    [[ -z "$envfile" ]] && continue
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      ROWS+=("$(emit_row 3 "${envfile}:${line%%:*}")")
    done < <(grep -nE '^[A-Z][A-Z0-9_]+=.+' "${REPO}/${envfile}" 2>/dev/null || true)
  done < <(git -C "$REPO" ls-files 2>/dev/null | grep -E '(^|/)\.env$' || true)
fi

# Signal 4 — plaintext input for secrets
collect 4 '<TextField[^>]+(token|secret|password)|input.*type=["'"'"']text["'"'"'].*(token|password)'

# Signal 5 — uncaptured stdio
collect 5 'stdio:[[:space:]]*["'"'"']inherit["'"'"']|stdout=sys\.stdout|stderr=sys\.stderr'

# Signal 6 — SystemEnvStrategy in dev chain
collect 6 'new SystemEnvStrategy\(\)|SystemEnvStrategy\(\)'

# Signal 7 — no biometric strategy anywhere in the chain construction sites.
#   Heuristic: there is at least one createResolver/create_resolver call but
#   no KeychainBiometricStrategy anywhere.
if grep -qrIE 'createResolver\(|create_resolver\(' "$REPO" "${EXCLUDES[@]}" 2>/dev/null; then
  if ! grep -qrIE 'KeychainBiometricStrategy' "$REPO" "${EXCLUDES[@]}" 2>/dev/null; then
    ROWS+=("$(emit_row 7 '(no occurrences)')")
  fi
fi

if (( ${#ROWS[@]} == 0 )); then
  echo "PASS — no signals found."
  exit 0
fi

echo "| Signal | File:line | Severity | Remediation |"
echo "| ------ | --------- | -------- | ----------- |"
printf '%s\n' "${ROWS[@]}"
