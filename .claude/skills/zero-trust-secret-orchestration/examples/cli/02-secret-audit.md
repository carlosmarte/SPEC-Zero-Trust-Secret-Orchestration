# Command 02 — `zts audit <repo-path>`

## Goal

Run the audit against a deliberately broken fixture and read the
markdown table the SKILL emits.

## Prerequisites

- `zts` CLI installed (the same install as `01-secret-get.md`).
- The fixtures under `examples/cli/fixtures/` (provided by this plan).

## Invocation

```bash
zts audit examples/cli/fixtures/leaky
```

## Expected output

```
| Signal | File:line | Severity | Remediation |
| ------ | --------- | -------- | ----------- |
| 1 (execSync for secret retrieval) | examples/cli/fixtures/leaky/secrets.mjs:2 | FAIL | See `references/mjs/src/strategies/keychain-biometric.mjs` |
```

Against the clean fixture:

```bash
zts audit examples/cli/fixtures/clean
```

```
PASS — no signals found.
```

## Exit codes

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| 0    | no FAIL rows (WARN-only rows still emit) |
| 1    | at least one FAIL row                    |

## Source

The `zts audit` subcommand shells out to `<skill-dir>/audit.sh`:

```js
// references/mjs/bin/zts.mjs (excerpt — the `audit` subcommand)
import { spawnSync } from "node:child_process";

const audit = spawnSync(
  process.env.ZTS_AUDIT_SCRIPT ?? new URL("../../../audit.sh", import.meta.url).pathname,
  [process.argv[3]],
  { stdio: ["ignore", "inherit", "inherit"] },
);
process.exit(audit.status);
```
