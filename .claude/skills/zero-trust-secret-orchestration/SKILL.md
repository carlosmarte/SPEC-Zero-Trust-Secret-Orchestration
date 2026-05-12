---
name: zero-trust-secret-orchestration
description: Scaffold or audit the Zero-Trust Secret Orchestration & Execution Harness in Node.js (Fastify, mjs) and Python (FastAPI) projects. Implements a Passport.js-style strategy chain (SystemEnvStrategy, KeychainBiometricStrategy, pluggable cloud strategies), a sandboxed subprocess harness with concealed telemetry, environment-aware fallback chains, and anti-authentication-fatigue enforcement. Use when adding secret resolution to a polyglot service, hardening biometric gates, or auditing a repo for secrets-in-env / execSync / writeback regressions.
allowed-tools: Bash,Read,Write,Edit,Grep,Glob
---

# Zero-Trust Secret Orchestration & Execution Harness

Scaffold the spec's strategy-chain + subprocess harness into a target
Node.js (Fastify) or Python (FastAPI) project, or audit an existing
project for the canonical regressions.

## When to trigger

| Signal in the user / target repo                                                            | Mode      |
| ------------------------------------------------------------------------------------------- | --------- |
| "Add secret resolution to <service>" / new repo with no resolver wiring                     | scaffold  |
| `.env` committed to git or `process.env.PG_PASSWORD` / `os.environ["…"]` for live secrets   | audit     |
| `child_process.execSync("security …")` / `subprocess.run(["security", …])` for Keychain     | audit     |
| Resolved secrets written back to `process.env` / `os.environ`                               | audit     |
| Biometric prompt fires on every request (no debounce / no fallback chain)                   | audit     |
| Greenfield Fastify or FastAPI service that mentions "Keychain", "Vault", "AWS Secrets"      | scaffold  |
| User explicitly says "scaffold the zero-trust harness" or "audit secret resolution"         | as named  |

## Decision tree

1. **Is the SKILL invoked with explicit `mode=audit` or `mode=scaffold`?**
   - Yes → jump to the named section.
   - No → continue.
2. **Does the target repo already import the resolver module?**
   `grep -RIE "createResolver|create_resolver|from zts.resolver" <repo> --include='*.{mjs,js,ts,py}'`
   - Hit → `audit` mode (the wiring exists; check it for regressions).
   - No hit → continue.
3. **Does the target repo have a non-stub `.env` checked into git?**
   `git -C <repo> ls-files | grep -E '(^|/)\.env$'`
   - Hit → `audit` mode first (likely violation of signal 3), then offer to
     scaffold the replacement.
   - No hit → `scaffold` mode.

> **Safety guard.** When in doubt, run `audit` first. The audit is
> read-only and tells you precisely what state the repo is in. Only then
> decide whether to scaffold the missing pieces (which is non-destructive
> for files the audit did not flag) or to remediate flagged FAIL signals
> in place.

## Scaffold mode

Copy the polyglot reference under `references/` into the target repo and
wire it into the framework adapter. The reference is self-contained and
runnable — no further code generation is required.

| Target stack    | Copy from                       | Copy to (in target)                       | Wire-in step                                                                       |
| --------------- | ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js Fastify | `references/mjs/src/`           | `<repo>/src/secrets/`                     | `app.register(secretsPlugin, { strategies })` in the Fastify bootstrap.            |
| Python FastAPI  | `references/py/src/zts/`        | `<repo>/src/zts/`                         | `attach_secrets(app, strategies)` in the FastAPI lifespan.                         |

Construct the strategy chain per environment:

- **development** — `[KeychainBiometricStrategy()]` only. `SystemEnvStrategy`
  is rejected by the resolver factory (anti-fatigue: forces the
  biometric prompt during dev, prevents accidental "env shortcut").
- **staging / production** — `[CloudSecretStrategy(...), SystemEnvStrategy()]`
  with cloud first, env as last-resort fallback.

After scaffolding, run the audit (next section) against the target to
confirm no pre-existing regressions slipped past the scaffold.

## Audit mode

Run the seven canonical greps from [`audit.md`](audit.md) over the target
repo. Emit a markdown table of findings:

```
| signal                                                            | file:line | severity | remediation                            |
| ----------------------------------------------------------------- | --------- | -------- | -------------------------------------- |
| (1) blocking subprocess for secret retrieval                      | …         | FAIL     | replace with `runSandboxed` / `run_sandboxed` |
| (2) writeback to process.env / os.environ                         | …         | FAIL     | resolve at call-site; never persist     |
| (3) hard-coded secret in `.env` checked into git                  | …         | FAIL     | rotate + delete; rewire via resolver    |
| (4) plaintext input (TextField / `input()`) collecting secrets    | …         | WARN     | use a SecureField / `getpass`           |
| (5) child stdio inherited / piped to shared log                   | …         | WARN     | route via harness; buffer-only          |
| (6) SystemEnvStrategy allowed in development                      | …         | FAIL     | dev-mode guard in `createResolver`      |
| (7) no biometric strategy in local fallback chain                 | …         | WARN     | add `KeychainBiometricStrategy()`       |
```

See [`audit.md`](audit.md) for the exact grep patterns + false-positive
filters.

## References

The SKILL ships polyglot twin packages. The following symbols MUST exist
in both languages with matching behavior:

| Concept                       | mjs (`references/mjs/src/...`)              | py (`references/py/src/zts/...`)                |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Strategy base                 | `strategy.mjs` → `Strategy`                 | `strategy.py` → `Strategy(ABC)`                 |
| Error: resolution failure     | `strategy.mjs` → `SecretResolutionError`    | `strategy.py` → `SecretResolutionError`         |
| Error: config failure         | `strategy.mjs` → `StrategyConfigError`      | `strategy.py` → `StrategyConfigError`           |
| System-env strategy           | `strategies/system-env.mjs`                 | `strategies/system_env.py`                      |
| Biometric keychain strategy   | `strategies/keychain-biometric.mjs`         | `strategies/keychain_biometric.py`              |
| Cloud strategy base + AWS stub| `strategies/cloud.mjs`                      | `strategies/cloud.py`                           |
| Sandboxed subprocess          | `harness.mjs` → `runSandboxed`              | `harness.py` → `run_sandboxed`                  |
| Resolver factory              | `resolver.mjs` → `createResolver`           | `resolver.py` → `create_resolver`               |
| Framework adapter             | `fastify-plugin.mjs`                        | `fastapi_adapter.py`                            |

## Sibling skills

| Sibling                              | What it does                                                                                  | When to use it instead                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `wire-github-token-into-swiftui-app` | Wires a GitHub PAT into a sandboxed SwiftUI macOS app via Keychain + a SecureField popover.   | The target is a SwiftUI macOS app, not a Fastify/FastAPI service.                            |
| `release-cooldown-{npm,pnpm,uv,…}`   | Hardens a project against new-version supply-chain attacks via package-manager cooldown.      | The concern is the *package supply chain*, not how *secrets* are resolved at runtime.        |
| `sdk-paradigms`                      | Catalog of the 16 SDK paradigms (Client, Middleware, Transport, etc.).                        | You're designing or auditing an SDK's architecture, not specifically its secret resolution.  |

This SKILL is the runtime-resolution layer: how a service decides
where a secret comes from at request time. It is not about how the
secret is *stored* (use Keychain / Vault for that) or how the package
that needs it is *installed* (use cooldown SKILLs for that).
