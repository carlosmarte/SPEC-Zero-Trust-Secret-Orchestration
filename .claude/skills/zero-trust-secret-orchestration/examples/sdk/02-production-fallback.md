# Scenario 02 — Production fallback chain

## Goal

Demonstrate the production fallback chain — env first, then cloud — and
the explicit plug-in seam for AWS Secrets Manager. The AWS stub raises
`StrategyConfigError` when no client is injected, proving the plug-in
seam is real and unmocked.

## Prerequisites

- `NODE_ENV=production` (so the anti-fatigue guard does not trip).
- The mjs reference installed: `cd <skill-dir>/references/mjs && make install`.

## Code

```js
// examples/sdk/02-production-fallback.mjs
import { createResolver } from "../../references/mjs/src/resolver.mjs";
import { SystemEnvStrategy } from "../../references/mjs/src/strategies/system-env.mjs";
import { AwsSecretsManagerStrategy } from "../../references/mjs/src/strategies/cloud.mjs";
import { StrategyConfigError, SecretResolutionError } from "../../references/mjs/src/strategy.mjs";

const resolver = await createResolver({
  strategies: [
    new SystemEnvStrategy(),
    new AwsSecretsManagerStrategy(), // no client → stub raises on use
  ],
  env: process.env,
});

try {
  console.log("from env:", await resolver.resolve("DB_PASSWORD"));
} catch (e) {
  console.log("env path failed:", e.name);
}

delete process.env.DB_PASSWORD;
try {
  await resolver.resolve("DB_PASSWORD");
} catch (e) {
  console.log("aws stub raised:", e.name, "-", e.message.slice(0, 60));
}
```

## Invocation

```bash
NODE_ENV=production DB_PASSWORD=hunter2 node examples/sdk/02-production-fallback.mjs
```

## Expected outcome

```
from env: hunter2
aws stub raised: StrategyConfigError - AwsSecretsManagerStrategy is a stub. Inject `{ client:
```

## Notes

- The `StrategyConfigError` from the AWS stub propagates through the
  resolver — `CloudSecretStrategy.get()` re-raises config errors verbatim
  (only application-level failures get wrapped in `SecretResolutionError`).
- For real AWS wiring, see `references/mjs/README.md` § "Wiring a real
  AWS Secrets Manager client".
- Order matters: env-first means a leaked env var would win over the
  cloud source. The SPEC's production chain documents this trade-off —
  env is a last-resort *fallback*, not a *primary*, in many real
  deployments. Reverse the order when your threat model demands it.
