#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mjs_out=$(node -e "
  import('$SKILL_DIR/references/mjs/src/harness.mjs').then(m =>
    m.runSandboxed('/bin/echo', ['parity']).then(r =>
      process.stdout.write(r.stdout.toString() + ':' + r.code))
  );
")

py_out=$(python -c "
import asyncio, sys
sys.path.insert(0, '$SKILL_DIR/references/py/src')
from zts.harness import run_sandboxed
r = asyncio.run(run_sandboxed('/bin/echo', 'parity'))
sys.stdout.write(r.stdout.decode() + ':' + str(r.code))
")

if [[ "$mjs_out" == "$py_out" ]]; then
  echo "OK parity: $mjs_out"
else
  echo "DRIFT:"
  echo "  mjs: $mjs_out"
  echo "  py : $py_out"
  exit 1
fi
