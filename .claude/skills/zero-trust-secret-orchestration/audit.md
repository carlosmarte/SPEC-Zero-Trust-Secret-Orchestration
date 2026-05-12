# Audit signals

This SKILL detects seven canonical regressions against the Zero-Trust
Secret Orchestration spec. Each row shows the grep, the exclude filter,
and the severity. The audit script in `audit.sh` runs all seven.

| #   | Signal                                              | Grep (use with `grep -nrIE`)                                                              | Exclude                            | Severity |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| 1   | Blocking subprocess for secret retrieval            | `\bexecSync\b\|subprocess\.(run\|call\|check_output)\|os\.system\(`                       | `(__tests__\|tests?\|fixtures)/`   | FAIL     |
| 2   | Writeback to env after resolution                   | `process\.env\[[^\]]+\]\s*=\|os\.environ\[[^\]]+\]\s*=\|os\.environ\.update\(`            | `(node_modules\|\.venv)/`          | FAIL     |
| 3   | Non-stub `.env` committed                           | `\b[A-Z][A-Z0-9_]+=.+`                                                                    | per-file: only `.env`              | FAIL     |
| 4   | Plaintext input collecting secrets                  | `<TextField[^>]+(token\|secret\|password)\|input.*type=["']text["'].*(token\|password)`   | `(node_modules\|build\|dist)/`     | WARN     |
| 5   | Uncaptured stdio from injected payloads             | `stdio:\s*["']inherit["']\|stdout=sys\.stdout\|stderr=sys\.stderr`                        | `(node_modules\|\.venv)/`          | WARN     |
| 6   | `SystemEnvStrategy` allowed in development          | `new SystemEnvStrategy\(\)\|SystemEnvStrategy\(\)` (in same chain as a dev-mode comment)  | `(node_modules\|\.venv)/`          | FAIL     |
| 7   | No biometric strategy in any local chain            | (zero hits for `KeychainBiometricStrategy` is itself the signal)                          | n/a                                | WARN     |

## Applying excludes

The third column expresses excludes in two forms:

- **Path-rooted excludes** look like `(node_modules|.venv)/` — pass each
  segment to `grep --exclude-dir=<segment>` (or to ripgrep's `-g
  !<segment>`).
- **Per-file restriction** like `per-file: only .env` — for signal 3,
  do NOT pass the grep to the whole tree; restrict to `.env` files only
  (`git ls-files | grep -E '(^|/)\.env$' | xargs grep -nE …`).

A row whose exclude column is `n/a` operates on the whole tree.

## Report format

The audit emits a single markdown table with this exact header:

```
| Signal | File:line | Severity | Remediation |
| ------ | --------- | -------- | ----------- |
```

Example rows:

```
| 1 (execSync for secret retrieval) | src/db/connect.mjs:14 | FAIL | See `references/mjs/src/strategies/keychain-biometric.mjs:18` |
| 7 (no biometric strategy in chain) | src/secrets.mjs:9     | WARN | Add `new KeychainBiometricStrategy()` to the chain |
```

If no signals fire, the audit emits a single line instead of an empty
table: `PASS — no signals found.`

### Remediation: signal 1 — execSync for secret retrieval

```diff
- import { execSync } from "node:child_process";
- const secret = execSync(`security find-generic-password -s svc -a ${k} -w`).toString().trim();
+ import { KeychainBiometricStrategy } from "./strategies/keychain-biometric.mjs";
+ const secret = await new KeychainBiometricStrategy({ service: "svc" }).get(k);
```

### Remediation: signal 2 — writeback to env

```diff
  const password = await resolver.resolve("PG_PASSWORD");
- process.env.PG_PASSWORD = password;        // violates SPEC §4
+ fastify.decorate("pgPassword", password);  // attach to app state
```

### Remediation: signal 3 — non-stub `.env` committed

1. `git rm --cached .env`
2. Add `.env` to `.gitignore`.
3. Rotate every value previously in `.env` — they are compromised.
4. Resolve at runtime via the chain (see `references/mjs/src/resolver.mjs`).

### Remediation: signal 6 — SystemEnvStrategy in development

```diff
  const chain = [
-   new SystemEnvStrategy(),
    new KeychainBiometricStrategy({ service: "svc" }),
  ];
  const resolver = await createResolver({ strategies: chain, env: process.env });
```

The `createResolver` factory throws if `NODE_ENV=development` and the
chain contains `SystemEnvStrategy` — drop it locally.

### Remediation: signal 4 — plaintext input for secrets

Switch the input to a password / SecureField widget. For SwiftUI, see
the sibling SKILL `wire-github-token-into-swiftui-app`'s `TokenPopover`.
For web frontends, use `<input type="password">`. For terminal prompts,
use `read -s` (bash) or `getpass.getpass()` (Python).

### Remediation: signal 5 — uncaptured stdio from injected payloads

Replace direct subprocess calls with the harness:

- Node: `runSandboxed(cmd, args, opts)` — see
  `references/mjs/src/harness.mjs`.
- Python: `await run_sandboxed(cmd, *args, **opts)` — see
  `references/py/src/zts/harness.py`.

The harness raises if you pass `stdio` / `stdout` / `stderr` overrides;
this enforcement is intentional (SPEC §2).

### Remediation: signal 7 — no biometric strategy in chain

Add `KeychainBiometricStrategy` to the local-development chain:

```js
const chain = [
  new KeychainBiometricStrategy({ service: "my-svc" }),
  // production-only strategies remain below it
];
```

In `production`/`CI` it's fine to omit the biometric strategy — the
fallback chain (`[SystemEnvStrategy, AwsSecretsManagerStrategy]`) does
the job. But the local-dev chain MUST include it (SPEC §3.3).
