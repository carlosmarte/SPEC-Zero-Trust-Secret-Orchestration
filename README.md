# Zero-Trust Secret Orchestration & Execution Harness

A runtime contract for how a process **fetches** a secret at request time. Strict
about three things, opinionated about almost nothing else:

1. **Concealed Telemetry** — the OS keystore CLI's stdout never leaks into the
   parent process's streams or shared logs.
2. **Anti-Authentication-Fatigue** — in development, the env-variable shortcut
   is refused at construction time, forcing the developer through the same
   biometric gate the production user faces.
3. **No Writeback** — a resolved secret never lands back in `process.env` /
   `os.environ`. The resolver is read-through, not read-then-cache-globally.

This repo ships [`SPEC.md`](SPEC.md) — the language-neutral contract — plus a
runnable polyglot reference (Node.js + Python) and an audit tool that detects
the seven canonical regressions against the spec.

---

## Why this exists

Every service eventually needs to read a database password (or an API key, or a
signing cert). The default path is almost always wrong in one of three ways:

### Failure mode 1 — leaky subprocess

```js
const pw = execSync("security find-generic-password -s db -a PG_PASSWORD -w")
  .toString().trim();
```

`execSync` blocks the event loop, but the worse problem is that the spawned
process inherits the parent's stdio file descriptors. The password lands in
whatever happens to be reading the parent's stream — CI log buffers, terminal
multiplexers, screen recorders, attached debuggers. There is no
"capture this just for me" mode on a shared file descriptor.

### Failure mode 2 — writeback to env

```js
const pw = await vault.fetch("PG_PASSWORD");
process.env.PG_PASSWORD = pw;          // looks innocuous
```

Once that line runs, **every** child process inherits the secret. `npm`
postinstall scripts, sidecar containers, language runtimes that fork on demand,
debugger attachments. This is the pivot path supply-chain attacks rely on:
compromise a dev dependency, read `process.env`, exfiltrate everything in one
hop.

### Failure mode 3 — `.env` as biometric bypass

```
# .env
PG_PASSWORD=hunter2     # because the Touch ID prompt fires every test cycle
```

The developer who reaches for `.env` isn't reckless — they're rationally
avoiding repetitive friction. But the side effect is that the **production
user** faces a biometric gate and the **developer** does not. Worse, `.env`
files leak (committed by accident, uploaded to artifact stores, captured by
build logs) and every value in them is then permanently compromised.

This spec is engineered against those three failure modes. Each one maps to
exactly one of the three rules above.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────┐
│ caller (HTTP handler, CLI subcommand, background worker)         │
│   └──► resolver.resolve("PG_PASSWORD")                          │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼  walks chain in order, short-circuits on first hit
┌──────────────────────────────────────────────────────────────────┐
│ Resolver (factory-validated chain, dev-mode guard)               │
│                                                                  │
│  [ KeychainBiometricStrategy ] ──► spawns native CLI via Harness │
│  [ CloudSecretStrategy       ] ──► HTTPS to vault / SDK call     │
│  [ SystemEnvStrategy         ] ──► reads env (FORBIDDEN in dev)  │
└──────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                          ┌────────────────────────────┐
                          │ Sandboxed Subprocess Harness│
                          │ - buffered stdio (no inherit)│
                          │ - minimal env (PATH only)   │
                          │ - SIGTERM → SIGKILL escalate │
                          └────────────────────────────┘
```

The Resolver is the only entry point a caller sees. Strategies and the Harness
are internal — leaking either across the framework boundary is itself a
regression the audit flags.

### Strategy contract in one paragraph

Every strategy implements an async `get(key) → string | absent`. The return
semantics carry the chain control flow:

- **Return absent** (`null`, `None`, `Option::None`, etc.) — "I don't have this
  key. Resolver: continue walking."
- **Throw** (`SecretResolutionError`) — "I had this key but resolution failed.
  Resolver: stop. Do not silently fall through to the next strategy."

That distinction is the whole reason the contract works. Conflating the two
turns the resolver into a swallow-and-pray loop.

### Anti-fatigue enforcement

The resolver factory inspects the chain at construction time, not at request
time:

```python
if APP_ENV == "development" and any(isinstance(s, SystemEnvStrategy) for s in chain):
    raise StrategyConfigError(
        "SystemEnvStrategy is disabled in development. "
        "Use KeychainBiometricStrategy locally."
    )
```

The dev-time chain is biometric-only. The prod-time chain is whatever your
threat model demands — cloud-first with env as fallback, or the other way
around. The contract doesn't dictate the order; it only forbids one specific
mis-configuration.

---

## What's in this repo

| Path                                                | What it is                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)                                | The normative, language-neutral contract. 13 sections, per-language transposition tables. |
| [`.claude/skills/zero-trust-secret-orchestration/`](.claude/skills/zero-trust-secret-orchestration/)  | Agent SKILL — scaffold-vs-audit decision tree + the polyglot reference.                   |
| `.claude/skills/.../SKILL.md`                       | The SKILL's entry point for downstream Claude agents.                                     |
| `.claude/skills/.../audit.md` + `audit.sh`          | The seven audit signals, grep patterns, and the runnable detector.                        |
| `.claude/skills/.../references/mjs/`                | Node.js (mjs, Fastify) reference implementation.                                          |
| `.claude/skills/.../references/py/`                 | Python (FastAPI) reference implementation.                                                |
| `.claude/skills/.../examples/`                      | Runnable SDK / CLI / API scenarios.                                                       |
| `.claude/skills/.../scripts/parity-harness.sh`      | Cross-language byte-parity test for the subprocess harness.                               |

---

## Quick start

### Audit an existing repo

The audit script greps for the seven canonical regressions and emits a markdown
table. It is read-only:

```bash
./.claude/skills/zero-trust-secret-orchestration/audit.sh ../my-service
```

Sample output against a deliberately broken fixture:

```
| Signal | File:line | Severity | Remediation |
| ------ | --------- | -------- | ----------- |
| 1 (execSync for secret retrieval) | secrets.mjs:2 | FAIL | See `references/mjs/src/strategies/keychain-biometric.mjs` |
| 6 (SystemEnvStrategy in development) | secrets.mjs:4 | FAIL | Drop `SystemEnvStrategy` from the chain in development |
| 7 (no biometric strategy in chain) | (no occurrences) | WARN | Add `new KeychainBiometricStrategy()` to the local chain |
```

A clean repo prints `PASS — no signals found.`.

### Run the reference implementations

Both packages expose the same eight Makefile targets — `help install ci-install
lint test build clean ci`. The `ci` target is the single command CI runs.

```bash
# Node.js (mjs)
cd .claude/skills/zero-trust-secret-orchestration/references/mjs
make ci

# Python (FastAPI)
cd ../py
make ci
```

The Python package uses [`uv`](https://docs.astral.sh/uv/) when available and
falls back to plain `pip` + `venv` so it runs on a bare CI image.

### Scaffold the reference into a new service

The SKILL is invokable by downstream Claude Code agents:

```
use the zero-trust-secret-orchestration skill to wire secret resolution into ../my-fastify-service
```

The SKILL walks its [decision tree](.claude/skills/zero-trust-secret-orchestration/SKILL.md#decision-tree)
to pick `scaffold` vs `audit` mode based on three observable signals (existing
resolver imports, presence of a committed `.env`, explicit user override).

---

## The seven audit signals

Lifted from [`SPEC.md` §7](SPEC.md#7-audit-signals-the-canonical-seven). Severity
is normative — the audit script enforces it.

| #   | Signal                                              | Severity |
| --- | --------------------------------------------------- | -------- |
| 1   | Blocking subprocess for secret retrieval            | FAIL     |
| 2   | Writeback to env after resolution                   | FAIL     |
| 3   | Non-stub `.env` committed to git                    | FAIL     |
| 4   | Plaintext input widget collecting a secret          | WARN     |
| 5   | Uncaptured stdio from injected payloads             | WARN     |
| 6   | `SystemEnvStrategy` allowed in development          | FAIL     |
| 7   | No biometric strategy in any local fallback chain   | WARN     |

`FAIL` rows describe an active security violation. `WARN` rows describe a
missing defense — the threat still exists but is not actively realized.

---

## Polyglot status

| Language     | Reference impl | Audit                        | Tests passing | Notes                                                            |
| ------------ | -------------- | ---------------------------- | ------------- | ---------------------------------------------------------------- |
| Node.js mjs  | shipped        | shipped (`audit.sh` works)   | 7/7           | Fastify adapter. ESM, Node ≥ 20.                                 |
| Python       | shipped        | shipped (`audit.sh` works)   | 7/7           | FastAPI adapter. Python ≥ 3.11. `uv` lockfile committed.         |
| Java         | spec'd in §9.3 | n/a                          | —             | `CompletableFuture<Optional<String>>`; Spring Boot adapter.      |
| Rust         | spec'd in §9.4 | n/a                          | —             | `Result<Option<String>, E>`; Axum adapter; `tokio::process`.     |
| Go           | spec'd in §9.5 | n/a                          | —             | Sentinel `ErrNotPresent` (Go can't distinguish empty vs absent). |
| Swift        | spec'd in §9.6 | n/a                          | —             | Vapor adapter; native `LAContext` allowed instead of `security`. |
| Kotlin / C#  | informative    | n/a                          | —             | Closest neighbors: Java / Java.                                  |

The contract from `SPEC.md` is identical across all rows. Adding a new
language is mechanical once you pick the closest neighbor in `SPEC.md` §9.

---

## Deeper reading

- [`SPEC.md`](SPEC.md) — the normative contract with per-language transposition
  tables and the 15-test minimum acceptance suite.
- [`.claude/skills/zero-trust-secret-orchestration/SKILL.md`](.claude/skills/zero-trust-secret-orchestration/SKILL.md) — the
  agent-facing entry point with the scaffold-vs-audit decision tree.
- [`.claude/skills/zero-trust-secret-orchestration/audit.md`](.claude/skills/zero-trust-secret-orchestration/audit.md) — the
  seven audit signals with grep patterns, false-positive filters, and inline
  remediation diffs.
- [`.claude/skills/zero-trust-secret-orchestration/references/`](.claude/skills/zero-trust-secret-orchestration/references/) — runnable
  reference implementations side-by-side, including the cross-language byte-parity test
  for the subprocess harness.

---

## What this spec is NOT

| Out of scope          | Whose job is it?                                                                |
| --------------------- | ------------------------------------------------------------------------------- |
| Credential storage    | The OS keystore (Keychain, Secret Service, DPAPI).                              |
| Distribution          | The secret manager (AWS SM, Vault, GCP Secret Manager).                         |
| Authorization         | IAM / cloud RBAC. This spec assumes the process is allowed to read what it asks for. |
| Resolution audit logs | The keystore's native audit log (Keychain access log, AWS CloudTrail).          |
| TLS to vault          | The cloud SDK. This spec only fixes the *shape* of the injected client.         |

The runtime resolution layer is one layer of a bigger pile. This spec covers
exactly that layer.

---

## License

[MIT](LICENSE). Copyright 2026 Carlos Marte.
