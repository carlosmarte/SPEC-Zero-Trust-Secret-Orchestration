# Command 01 — `zts get <key>`

## Goal

Fetch a secret from the resolver chain and print the value to stdout.

## Prerequisites

- `zts` CLI installed (`pnpm link --global` or `npm link` from `references/mjs/`).
- An environment that defines the chain at the env vars the CLI reads.

## Invocation

```bash
NODE_ENV=production DB_PASSWORD=hunter2 zts get DB_PASSWORD
```

## Expected output

```
hunter2
```

(Followed by a single newline. No banner, no log lines, no JSON wrapping
— stdout is the secret only so it can be piped: `pg_pass=$(zts get
DB_PASSWORD)`.)

## Exit codes

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| 0    | resolved successfully                                |
| 2    | key not in any strategy (resolver returned `null`)   |
| 3    | chain mis-configured (`StrategyConfigError`)         |
| 4    | resolution failed mid-chain (`SecretResolutionError`) |

## Source

```js
#!/usr/bin/env node
// references/mjs/bin/zts.mjs (excerpt — the `get` subcommand)
import { createResolver } from "../src/resolver.mjs";
import { SystemEnvStrategy } from "../src/strategies/system-env.mjs";
import { StrategyConfigError, SecretResolutionError } from "../src/strategy.mjs";

const [, , subcmd, key] = process.argv;
if (subcmd !== "get" || !key) {
  console.error("usage: zts get <key>");
  process.exit(64);
}

try {
  const resolver = await createResolver({ strategies: [new SystemEnvStrategy()] });
  const v = await resolver.resolve(key);
  if (v === null) process.exit(2);
  process.stdout.write(v + "\n");
} catch (e) {
  if (e instanceof StrategyConfigError) process.exit(3);
  if (e instanceof SecretResolutionError) process.exit(4);
  throw e;
}
```
