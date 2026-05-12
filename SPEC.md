# SPEC — Zero-Trust Secret Orchestration & Execution Harness

**Status:** stable
**Audience:** implementors generating a language-specific solution from this spec
**Canonical reference:** [`.claude/skills/zero-trust-secret-orchestration/`](.claude/skills/zero-trust-secret-orchestration/)
  ships the Node.js (mjs) and Python (FastAPI) implementations side-by-side.

## §0 Reader's guide

This document is the contract. Each `MUST` / `MUST NOT` is normative.
Each language-specific recipe under §9 is illustrative — it shows the
idiomatic transposition but does not relax the contract.

An implementation that satisfies §5 (Security Invariants), §3 (Core
Contracts), and the §8 test contract is conformant, regardless of
language. The list of "common languages" called out by name —
**Python, Node.js, Java, Rust, Go, Swift** — is meant to be exhaustive
enough that any other language (Kotlin, C#, Ruby, …) can pattern-match
its transposition from the closest neighbor in §9.

## §1 Goal

Provide a runtime layer that decides **where a secret comes from**
at request time, under three uncompromising rules:

1. **Concealed Telemetry.** Subprocesses spawned to talk to native
   credential stores (macOS `security`, `bioutil`, Linux `secret-tool`,
   Windows `CredentialManager`, …) **MUST NOT** leak their stdout /
   stderr into the parent's streams or shared logs.
2. **Anti-Authentication-Fatigue.** In `development`, the bypass route
   (system environment variables) **MUST** be refused so the developer
   is forced through the same biometric gate the production user faces.
3. **Strategy Chain.** Resolution walks an ordered list of strategies.
   The first strategy that returns a value wins; a strategy that throws
   stops the chain (it had the secret but resolution failed). Neither
   resolution nor any caller **MUST** write the resolved value back to
   the process environment.

This is the **runtime resolution layer**, not the **storage layer**.
Storing a credential is the OS keystore's job (Keychain on macOS,
Secret Service on Linux, DPAPI on Windows). Distributing it is the
secret-manager's job (AWS Secrets Manager, Vault, GCP Secret Manager).
This spec covers only how the running process *fetches* it.

## §2 Architecture (language-neutral)

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

The Resolver is the only entry point a caller sees. Strategies and the
Harness are internal — leaking them across the framework boundary is
itself a regression.

## §3 Core Contracts

### §3.1 Strategy

```
interface Strategy {
  // Return contract:
  //   - return absent/none/null/Optional.empty/Result::Ok(None):
  //       "I don't have this key" → resolver continues the chain.
  //   - raise/throw/Err/panic-equivalent:
  //       "I had it but resolution failed" → resolver STOPS here.
  //
  // The resolver MUST NOT catch resolution exceptions to silently
  // continue the chain. A throwing strategy is a hard failure.
  fn get(key: string) -> Async<Option<string>>
}
```

| MUST | The method is asynchronous (returns `Promise` / `Future` / `Task` / `Awaitable` in the host language). Synchronous strategies are not conformant — they block the event loop on subprocess wait. |
| MUST | The method takes exactly one parameter: the lookup key as a string. |
| MUST | The return type distinguishes "absent" from "empty string". An empty string **MUST** be normalized to absent (callers cannot use empty as a sentinel for valid). |
| MUST NOT | A strategy mutate the process environment, the file system, or any shared state. Strategies are pure functions of `(key, configured state)`. |

### §3.2 Resolver

```
interface Resolver {
  fn resolve(key: string) -> Async<Option<string>>
}

// Factory:
fn createResolver(strategies: Sequence<Strategy>, env?: Map<string, string>) -> Resolver
```

| MUST | The factory validate that `strategies` is non-empty. Empty chains are a configuration error, not a "resolve everything to null" shortcut. |
| MUST | The factory validate each entry implements `Strategy` (via `isinstance`, `instanceof`, trait bound, type bound, etc.). |
| MUST | The factory honor §6 (anti-fatigue) before returning. |
| MUST | `resolve(key)` walk the chain in **construction order**. The order is the contract — callers tune it per environment. |
| MUST | `resolve(key)` short-circuit on the first non-absent return value. |
| MUST | A throw inside any strategy propagate verbatim to the caller. The resolver does not coerce errors into "absent". |

### §3.3 Sandboxed Subprocess Harness

```
struct RunResult {
  stdout: bytes
  stderr: bytes
  code:   int | None     // None == killed by timeout
}

fn runSandboxed(
  cmd: string,
  args: Sequence<string>,
  options?: {
    timeoutMs: int,
    env:       Map<string, string>,   // default: { PATH: "/usr/bin:/bin" }
  }
) -> Async<RunResult>
```

| MUST | `stdin` of the child is the OS equivalent of `/dev/null` (`ignore` in Node, `subprocess.DEVNULL` in Python, `Stdio::null()` in Rust, etc.). |
| MUST | `stdout` and `stderr` of the child are captured into buffers and **never** inherit from or pipe to the parent's streams. |
| MUST | If the host language exposes any "inherit stdio" / "pipe to parent" / "shared file descriptor" option, the harness **MUST** refuse to accept that option from callers. Passing it is an error at the harness boundary, not a runtime warning. |
| MUST | The default environment passed to the child is `{ PATH: "/usr/bin:/bin" }` (or the platform equivalent on Windows: `PATH=%SystemRoot%\System32`). The parent's full environment is **NOT** inherited unless the caller explicitly passes an `env` map. |
| MUST | On `timeoutMs` expiry, the harness sends the OS "terminate" signal (`SIGTERM` on POSIX, `TerminateProcess` on Windows). After a 1-second grace window, it sends the OS "kill" signal (`SIGKILL` / forced termination). |
| MUST | If the child was killed by the timeout, `code` is the language's "no exit code" sentinel: `None` (Python), `null` (JS), `-1` or an `Option<i32>::None` (Rust), `nil` (Go via a sentinel), `nil` (Swift). |
| MUST | The harness itself is byte-quiet — it does not `print` / `console.log` / `println!` to the parent's streams under any condition. |

### §3.4 Framework Adapter

```
fn attachSecrets(app, resolver) -> void
```

| MUST | The adapter attach the resolver to the framework's app-scope state (`fastify.decorate("secrets", …)`, `app.state.secrets = …`, Spring `@Bean`, Axum `Extension<Resolver>`, gin context value, Vapor `Application.storage[…]`). |
| MUST NOT | The adapter eagerly resolve any secret. Resolution is lazy at first request. |
| MUST NOT | The adapter write resolved values back to the process environment, to a config file, or to any per-request scope that survives the request (no module-level caches). The strategies themselves are free to cache internally; the *adapter* never does. |

### §3.5 Error taxonomy

Exactly two named error types are observable across the boundary:

| Error                       | Raised when                                                              | Caller should           |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| `SecretResolutionError`     | A strategy was responsible for the key but resolution failed (network, user cancelled biometric, subprocess returned unexpected exit code). | 5xx; do **not** retry from a different strategy. The chain stopped intentionally. |
| `StrategyConfigError`       | The chain was mis-configured at construction time (empty list, non-Strategy entry, anti-fatigue rule violated, AWS stub with no client). | 5xx; this is a deploy bug, not a runtime issue. Surface to ops, not to user. |

Both error types **MUST** be public exports of the implementation. They
**MUST** carry the original cause (Python's `__cause__`, JS's `cause`
option, Rust's `source()`, Java's `getCause()`, Go's `errors.Unwrap`,
Swift's underlying `Error`).

## §4 Concrete Strategies (Required)

Every conformant implementation **MUST** ship these three.

### §4.1 `SystemEnvStrategy`

```
class SystemEnvStrategy : Strategy
  get(key) -> env[key]; if empty string -> absent
```

- Empty string **MUST** be normalized to absent (see §3.1).
- The strategy reads from a snapshot of the environment captured at
  resolver-factory construction time **OR** from the live environment
  on each call. Both are conformant; document which one is used.

### §4.2 `KeychainBiometricStrategy`

The OS-native credential store, gated by the OS biometric prompt.
The strategy **MUST** spawn the native CLI via the §3.3 harness.

Per-OS bindings (informative — choose the one matching the build target):

| OS         | CLI binary                      | Exit code: not-found | Exit code: cancelled  | Notes                                               |
| ---------- | ------------------------------- | -------------------- | --------------------- | --------------------------------------------------- |
| macOS      | `security find-generic-password`| `44`                 | `128`                 | Touch ID via `LAContext` for ACL-protected items.   |
| Linux      | `secret-tool lookup …`          | `1` (with empty out) | `1` (interactive `xdg-open` flow) | Requires `gnome-keyring` / `kwallet` `secret-service`. |
| Windows    | PowerShell `CredentialManager`  | `0` with empty out   | exception via WinHello | Microsoft Hello via `Windows.Security.Credentials`. |

| MUST | The strategy expose a `service` configuration value (`-s` flag on macOS, collection on Linux, target name on Windows). |
| MUST | The strategy distinguish "not found" (→ return absent, chain continues) from "cancelled by user" (→ raise `SecretResolutionError`). |
| MUST | The strategy expose a constructor-injection seam (`_runner` / `_harness` / similar private name) so unit tests can substitute a fake harness without spawning a real subprocess. The seam name is implementation-defined but its presence is required by §8. |

### §4.3 `CloudSecretStrategy` (abstract) + concrete stub

```
abstract class CloudSecretStrategy : Strategy
  abstract fn _fetch(key) -> Async<Option<string>>
  fn get(key) -> try _fetch else wrap in SecretResolutionError
                 (StrategyConfigError passes through unchanged)
```

| MUST | A concrete stub for at least one cloud secret manager is shipped (the reference uses AWS Secrets Manager). |
| MUST | The stub raise `StrategyConfigError` with a message naming the missing dependency when invoked without an injected client. Silent return of absent is **NOT** conformant. |
| MUST | The injected client be a duck-typed adapter, not the cloud SDK class directly. The stub describes the adapter shape (e.g., `{ send(input) -> Promise<{ SecretString: string }> }` for AWS-style). This is so consumers can swap SDK versions / mock / use a different provider without forking the strategy. |

## §5 Security Invariants (normative MUSTs)

| §   | Invariant                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | The harness **MUST NOT** offer a "shared stdio" / "inherit" / "pipe to parent" escape hatch — even as opt-in.                |
| 5.2 | The harness **MUST NOT** inherit the parent environment by default; the caller passes `env` explicitly to opt in.           |
| 5.3 | The resolver **MUST NOT** write resolved values back to `process.env` / `os.environ` / `System.getenv` / `std::env::set_var` / `os.Setenv` / `setenv(2)` / `ProcessInfo.environment`. |
| 5.4 | The resolver **MUST NOT** persist resolved values to disk or shared memory. Strategies may cache *within their own instance* (e.g., a TTL cache inside a cloud strategy), but the resolver itself is stateless. |
| 5.5 | In `development`, `SystemEnvStrategy` **MUST** be refused at resolver-factory time — see §6.                                |
| 5.6 | A strategy that throws **MUST** stop the chain. Falling through to the next strategy on `SecretResolutionError` is **NOT** conformant. |
| 5.7 | The harness's timeout escalation (`SIGTERM` → 1s grace → `SIGKILL`) **MUST** complete — no "best effort" early returns that leave a zombie subprocess holding a biometric prompt. |

## §6 Anti-Authentication-Fatigue

`SystemEnvStrategy` exists as a production fallback. In development,
it is an *attractive nuisance*: a developer hitting the keychain prompt
every test cycle will `export PG_PASSWORD=…` and bypass the biometric
gate entirely — defeating the spec.

The factory enforces this:

```
isDev = env["APP_ENV"] == "development" OR env["NODE_ENV"] == "development"

if isDev AND any(s isinstance SystemEnvStrategy for s in strategies):
  raise StrategyConfigError(
    "SystemEnvStrategy is disabled in development. " +
    "Use KeychainBiometricStrategy locally to enforce the biometric gate."
  )
```

| MUST | The check happen at factory time, not at `resolve(key)` time. A mis-configured chain must fail fast. |
| MUST | The error class is `StrategyConfigError`. |
| MUST | The check be honored on both `APP_ENV=development` and `NODE_ENV=development` (cross-language env conventions). |
| MAY  | Implementations honor additional sentinels (e.g., `DJANGO_SETTINGS_MODULE` ending in `.development`, `ENV=dev`, `RUST_LOG=debug`) — provided that the canonical two above always trigger the guard. |

## §7 Audit Signals (the canonical seven)

A conformant implementation **MUST** ship an audit mode that detects
these in a target repository. Severities are normative:

| #   | Signal                                              | Severity | Why                                                                     |
| --- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| 1   | Blocking subprocess for secret retrieval            | FAIL     | Bypasses the harness — leaks stdio, blocks event loop.                  |
| 2   | Writeback to env after resolution                   | FAIL     | Defeats §5.3; any child process inherits the secret.                    |
| 3   | Non-stub `.env` committed to git                    | FAIL     | The secret is already compromised regardless of every other control.    |
| 4   | Plaintext input widget collecting a secret          | WARN     | UX leaks via screen-recording, accessibility APIs, shoulder-surfing.   |
| 5   | Uncaptured stdio from injected payloads             | WARN     | Same threat as 1, but in code paths that already use the harness elsewhere. |
| 6   | `SystemEnvStrategy` allowed in development          | FAIL     | Defeats §6 anti-fatigue.                                                |
| 7   | No biometric strategy in any local fallback chain   | WARN     | Local-dev path has no gate at all; resolves to env only.                |

The audit emits a markdown table with this exact header:

```
| Signal | File:line | Severity | Remediation |
| ------ | --------- | -------- | ----------- |
```

If no signals fire, the audit emits the single line `PASS — no signals found.`.

## §8 Test Contract (minimum)

Any implementation **MUST** ship tests covering at least:

| Test                                  | What it pins                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `system-env: present`                 | A set env var resolves to its value.                                          |
| `system-env: empty-string`            | Empty string env var resolves to absent (NOT empty).                          |
| `system-env: unset`                   | Unset env var resolves to absent.                                             |
| `keychain: success`                   | Native CLI exits 0 → strategy returns trimmed stdout.                         |
| `keychain: not-found`                 | OS-specific "not-found" exit code → strategy returns absent.                  |
| `keychain: cancelled`                 | OS-specific "cancelled" exit code → strategy raises `SecretResolutionError`.  |
| `cloud-stub: unconfigured`            | AWS-style stub with no client raises `StrategyConfigError`, not silent absent. |
| `resolver: short-circuit`             | First non-absent return wins; subsequent strategies are not called.            |
| `resolver: empty-chain`               | Factory raises `TypeError` / equivalent on empty `strategies`.                |
| `resolver: non-strategy entry`        | Factory raises type error when entry doesn't implement `Strategy`.            |
| `resolver: dev-guard tripped`         | `APP_ENV=development` + `SystemEnvStrategy` in chain → factory raises `StrategyConfigError`. |
| `resolver: dev-guard not tripped`     | `APP_ENV=production` + same chain succeeds.                                   |
| `harness: echo`                       | Trivial echo command captures stdout, exit code = 0.                          |
| `harness: timeout-kills-and-reports-sentinel` | A 5-second sleep with a 100ms timeout returns the "no exit code" sentinel.    |
| `harness: stdio-override-rejected`    | Passing `stdio: "inherit"` / `stdout=sys.stdout` / equivalent raises at the boundary. |

Total: 15 minimum tests. Implementations are encouraged to add more.

A cross-language **polyglot parity test** is RECOMMENDED for monorepos
that ship two or more languages: spawn the harness in each language
against `/bin/echo parity` and assert byte-identical stdout and
identical exit code.

## §9 Per-language Transposition Guide

The reference under [`.claude/skills/zero-trust-secret-orchestration/references/`](.claude/skills/zero-trust-secret-orchestration/references/)
contains a runnable mjs + py twin. For other languages, this section
captures the idiomatic mapping; the contract itself is unchanged.

### §9.1 Python (reference)

| Spec element            | Python form                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Async                   | `async def` + `asyncio`                                                                    |
| Strategy                | `abc.ABC` + `@abstractmethod async def get(self, key: str) -> str \| None`                 |
| Resolver factory        | Module-level `def create_resolver(strategies, env=None) -> Resolver`                       |
| Harness                 | `asyncio.create_subprocess_exec(stdin=DEVNULL, stdout=PIPE, stderr=PIPE)`                  |
| Forbid stdio override   | `**forbidden` kwarg sink + `raise TypeError` if non-empty                                  |
| Errors                  | `class SecretResolutionError(Exception)`, `class StrategyConfigError(Exception)`           |
| Framework adapter       | `app.state.secrets = resolver` (FastAPI) + `Depends(get_secrets)` provider                 |
| Build tooling           | `pyproject.toml` (`requires-python = ">=3.11"`) + `uv` lockfile                            |
| Test runner             | `pytest` with `pytest-asyncio` (`asyncio_mode = "auto"`)                                   |

### §9.2 Node.js (reference)

| Spec element            | Node form                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Async                   | `async function` + Promises                                                                |
| Strategy                | `class Strategy { async get(key) { throw … } }` — concrete classes `extend Strategy`       |
| Resolver factory        | `export async function createResolver({ strategies, env })`                                |
| Harness                 | `child_process.spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env })`               |
| Forbid stdio override   | `if (opts.stdio \|\| opts.stdout \|\| opts.stderr) throw …`                                |
| Errors                  | `class SecretResolutionError extends Error { … }` with `cause` option (Node 16.9+)         |
| Framework adapter       | `fastify-plugin` wrapper that calls `fastify.decorate("secrets", resolver)`                |
| Build tooling           | `package.json` with `"type": "module"`, `"engines": { "node": ">=20" }`                    |
| Test runner             | `node --test 'test/*.test.mjs'` (built-in test runner; no Jest/Vitest dependency)          |

### §9.3 Java

| Spec element            | Java form                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Async                   | `CompletableFuture<Optional<String>>` (Project Loom virtual threads optional but encouraged on JDK 21+)  |
| Strategy                | `interface Strategy { CompletableFuture<Optional<String>> get(String key); }`                            |
| Resolver factory        | `public final class Resolver { public static Resolver of(List<Strategy> strategies, Map<String,String> env) … }` |
| Harness                 | `ProcessBuilder` with `redirectInput(Redirect.from(new File("/dev/null")))` + `redirectOutput(Redirect.PIPE)` |
| Forbid stdio override   | Don't expose a `redirectOutput` / `redirectError` parameter on the `runSandboxed` signature at all       |
| Errors                  | `class SecretResolutionException extends RuntimeException`, `class StrategyConfigException extends IllegalStateException` |
| Framework adapter       | Spring Boot: `@Bean` of type `Resolver` plus a `@Component SecretsAccessor` using it from `@RestController` handlers |
| Build tooling           | Gradle (Kotlin DSL) or Maven; `--release 21` for record patterns                                         |
| Test runner             | JUnit 5 (`@Test` + `@TempDir` + `Assertions.assertThrows`)                                                |

Idiom: avoid `Future<String>` returning `null` — use `Optional<String>`
inside the future. Java's nullable-via-`null` collides with the spec's
"absent vs throw" semantic.

### §9.4 Rust

| Spec element            | Rust form                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Async                   | `async fn` + `tokio` runtime                                                                |
| Strategy                | `#[async_trait] pub trait Strategy: Send + Sync { async fn get(&self, key: &str) -> Result<Option<String>, SecretResolutionError>; }` |
| Resolver factory        | `pub fn create_resolver(strategies: Vec<Box<dyn Strategy>>, env: &HashMap<String,String>) -> Result<Resolver, StrategyConfigError>` |
| Harness                 | `tokio::process::Command` with `.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).env_clear().envs(env)` |
| Forbid stdio override   | Do not expose `Stdio` configuration in the public `run_sandboxed` signature — it takes `timeout_ms` and `env`, full stop |
| Errors                  | `#[derive(thiserror::Error, Debug)] pub enum SecretResolutionError { … }` — two distinct error types, not variants of one |
| Framework adapter       | Axum: `axum::Extension<Arc<Resolver>>` injected via `.layer(Extension(resolver))`           |
| Build tooling           | Cargo workspace; `cargo nextest run` recommended                                            |
| Test runner             | `#[tokio::test]` async tests                                                                |

Idiom: use the `Result<Option<String>, E>` pair — `Ok(None)` is "absent,
continue chain"; `Err(_)` is "stop chain". Don't conflate with `Option<Result<…>>`.

### §9.5 Go

| Spec element            | Go form                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Async                   | `context.Context` cancellation + goroutines; methods return `(string, error)` (string `== ""` means absent if the second return is `ErrNotPresent`) |
| Strategy                | `type Strategy interface { Get(ctx context.Context, key string) (string, error) }`         |
| Resolver factory        | `func NewResolver(strategies []Strategy, env map[string]string) (*Resolver, error)`        |
| Harness                 | `exec.CommandContext(ctx, cmd, args...)` with `cmd.Stdin = nil` (default), `cmd.Stdout = &out`, `cmd.Stderr = &err`, `cmd.Env = env` |
| Forbid stdio override   | The `RunSandboxed` function signature takes `cmd, args, options` — `options` has no field for stdio. Setting `cmd.Stdout` from inside the harness is hidden state |
| Errors                  | `var ErrNotPresent = errors.New("not present")` (sentinel for "absent" — NOT an actual error to propagate); `type SecretResolutionError struct{ Inner error }`; `type StrategyConfigError struct{ Reason string }` — both implement `Unwrap()` |
| Framework adapter       | `gin.Engine.Use(func(c *gin.Context) { c.Set("secrets", resolver); c.Next() })` or `chi` `middleware.WithValue(ctx, secretsKey, resolver)` |
| Build tooling           | `go.mod` with `go 1.22+`                                                                    |
| Test runner             | `testing.T` + `testify/assert`                                                              |

Idiom warning: Go does not have a `null`-vs-empty distinction in
strings. Use a sentinel error (`ErrNotPresent`) to signal absent, and
reserve the `string` return for genuine values. Returning `("", nil)`
is ambiguous and **NOT** conformant.

### §9.6 Swift

| Spec element            | Swift form                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Async                   | `async`/`await` + structured concurrency (`Task`, `TaskGroup`)                              |
| Strategy                | `protocol Strategy: Sendable { func get(_ key: String) async throws -> String? }`           |
| Resolver factory        | `public func createResolver(strategies: [any Strategy], env: [String: String]) throws -> Resolver` |
| Harness                 | `Process()` with `.standardInput = FileHandle.nullDevice`, `.standardOutput = Pipe()`, `.standardError = Pipe()`, `.environment = env` |
| Forbid stdio override   | Wrap `Process` in a function whose signature is `runSandboxed(_ cmd: String, _ args: [String], timeoutMs: Int? = nil, env: [String:String]? = nil)` — no `FileHandle` parameter exists |
| Errors                  | `public enum SecretResolutionError: Error { case cancelled, subprocessFailed(Int32), … }`, `public enum StrategyConfigError: Error { case empty, notAStrategy, devModeViolation }` — two distinct enums, not cases of one |
| Framework adapter       | Vapor: `app.storage[SecretsKey.self] = resolver`; routes read via `req.application.storage[SecretsKey.self]` |
| Build tooling           | `Package.swift` (Swift 5.10+)                                                              |
| Test runner             | `swift-testing` (`@Test` macro)                                                            |

Bridging note: on macOS, `KeychainBiometricStrategy` can skip the
`security` CLI entirely and use `LAContext` + the Security framework
directly. That's a **valid optimization** — the contract is "biometric
gate before returning the value", not "must spawn `security`". When
done this way, §3.3 still applies to any other subprocess (e.g., a
helper for environment unsealing), and the §8 `keychain` test cases
become integration tests rather than unit tests with a fake harness.

### §9.7 Other languages (informative)

| Language | Closest neighbor in §9 | Notable transposition note                                                          |
| -------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Kotlin   | §9.3 (Java)            | Use `suspend fun` + coroutines instead of `CompletableFuture`; `data class` for `RunResult`. |
| C#       | §9.3 (Java)            | `async Task<string?>` + `IAsyncDisposable`; ASP.NET Core middleware for adapter.    |
| Ruby     | §9.1 (Python)          | `async-gem` or `Fiber.schedule`; `Module#prepend` for the dev-mode guard.           |
| Elixir   | §9.4 (Rust)            | Behaviours instead of traits; supervisor tree for harness lifecycle.                |
| Dart     | §9.4 (Rust) + §9.6     | `Future<String?>`; `Process.start` with explicit `ProcessStartMode.normal`.         |
| PHP      | §9.1 (Python)          | Use ReactPHP or AMPHP for async; the spec is implementable in blocking PHP only if every request gets its own process. |

If your language is not on either list: pick the §9 entry whose
async model is closest, then re-derive the table mechanically. The
contract from §3 / §5 / §6 / §7 / §8 does not change.

## §10 Acceptance Checklist for Any Implementation

Run this list before declaring an implementation conformant.

### Surface

- [ ] Public exports: `Strategy`, `SystemEnvStrategy`, `KeychainBiometricStrategy`, `CloudSecretStrategy`, one concrete cloud stub, `createResolver` (factory or constructor), `runSandboxed` (harness), `SecretResolutionError`, `StrategyConfigError`, plus the framework adapter for the host framework.
- [ ] Symbol names match the polyglot map in `.claude/skills/zero-trust-secret-orchestration/SKILL.md` (modulo language-specific case conventions for methods — class/error names are identical).
- [ ] The framework adapter never writes to the process environment (`grep` for the language's `setenv`-equivalent inside the adapter file: zero hits).

### Contract

- [ ] §3.1 absent-vs-throw distinction is observable from the test suite.
- [ ] §3.3 harness rejects any caller-supplied stdio override.
- [ ] §3.3 harness escalates timeout via OS-terminate → 1s grace → OS-kill.
- [ ] §3.3 harness uses `{ PATH: "/usr/bin:/bin" }` (or platform equivalent) as default child env.
- [ ] §6 dev-mode guard trips on `APP_ENV=development` AND on `NODE_ENV=development`.
- [ ] §5.3 writeback is not present anywhere in the resolver or adapter (`grep`-checked).

### Tests

- [ ] All 15 §8 minimum cases pass.
- [ ] If polyglot: cross-language parity test for the harness against `/bin/echo` passes byte-for-byte.

### Audit

- [ ] The implementation ships an audit script (or its language-native equivalent — a `cargo zts-audit` subcommand, a `manage.py zts-audit` Django command, etc.) that emits the §7 markdown table.
- [ ] Run the audit against the implementation's own `references/` (or equivalent canonical-good directory) — expected output is `PASS — no signals found.`. A self-test that fires false positives against the reference is itself a defect.

### Documentation

- [ ] A README or `SKILL.md` at the implementation root, with the same five sections as the reference: "When to trigger", "Decision tree", "Scaffold mode", "Audit mode", "References".
- [ ] An examples directory exposing the three surfaces from §6 of the reference: SDK (library use), CLI (operator use), API (route handler).
- [ ] A `Makefile` (or per-language equivalent — `cargo`, `gradle`, `npm` scripts, `make.sh`) exposing the eight lifecycle targets: `help install ci-install lint test build clean ci`.

## §11 Non-Goals

This spec deliberately does **NOT** cover:

- **Credential storage.** How the secret gets into the keystore is the
  operator's problem. The spec only addresses how the *running process*
  reads it back out.
- **Distribution.** Pushing rotated secrets to N hosts is the secret
  manager's problem. The spec assumes the keystore / vault is already
  populated with current values.
- **Authorization.** The spec assumes the running process is authorized
  to read the secrets it asks for. Identity, IAM policies, and cloud
  RBAC are out of scope.
- **Audit logging of resolution attempts.** Tempting, but every audit
  log of "process X read secret Y at time T" is itself a secret-adjacent
  artifact that needs the same protections. The spec defers this to the
  keystore's native audit log (Keychain access log, AWS CloudTrail, etc.).
- **Network transport for cloud strategies.** TLS, cert pinning, mTLS to
  vault are the cloud SDK's job. The spec only fixes the *shape* of the
  injected client (`{ send(input) -> Promise<…> }` or equivalent).

## §12 Versioning

This SPEC is versioned by its commit hash. Any normative change (a new
`MUST` / `MUST NOT`, or a relaxation of an existing one) bumps a MINOR
version in the implementation's `CHANGELOG.md`. Editorial changes
(clarifications, typo fixes, new informative examples) do not.

The reference implementation under
[`.claude/skills/zero-trust-secret-orchestration/`](.claude/skills/zero-trust-secret-orchestration/)
is the executable companion. If this document and the reference
disagree on a normative point, **this document wins** — the reference
needs to be patched to match.
