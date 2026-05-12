# References — Node.js (mjs)

Reference implementation of the Zero-Trust Secret Orchestration spec for
Node.js services using ESM modules and Fastify.

## Surface

| Module                                     | Export                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `src/strategy.mjs`                         | `Strategy`, `SecretResolutionError`, `StrategyConfigError`       |
| `src/harness.mjs`                          | `runSandboxed`                                                   |
| `src/resolver.mjs`                         | `createResolver`                                                 |
| `src/strategies/system-env.mjs`            | `SystemEnvStrategy`                                              |
| `src/strategies/keychain-biometric.mjs`    | `KeychainBiometricStrategy`                                      |
| `src/strategies/cloud.mjs`                 | `CloudSecretStrategy`, `AwsSecretsManagerStrategy`               |
| `src/fastify-plugin.mjs`                   | default export (`fastify-plugin`-wrapped plugin)                 |

## Wiring a real AWS Secrets Manager client

```js
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { AwsSecretsManagerStrategy } from "./src/strategies/cloud.mjs";

const sm = new SecretsManagerClient({ region: "us-east-1" });
const client = { send: (input) => sm.send(new GetSecretValueCommand(input)) };

const strategy = new AwsSecretsManagerStrategy({ client });
```

The adapter shape (`{ send(input) }`) is deliberately minimal so any
SDK version, mock, or alternative cloud provider can satisfy it without
changing the strategy.

## Fastify wiring

```js
import Fastify from "fastify";
import ztsPlugin from "./src/fastify-plugin.mjs";
import { KeychainBiometricStrategy } from "./src/strategies/keychain-biometric.mjs";
import { AwsSecretsManagerStrategy } from "./src/strategies/cloud.mjs";

const app = Fastify();
await app.register(ztsPlugin, {
  strategies: process.env.APP_ENV === "production"
    ? [new AwsSecretsManagerStrategy({ client }), /* env last-resort */]
    : [new KeychainBiometricStrategy()],
});

app.get("/db", async () => ({ pg: await app.secrets.resolve("PG_PASSWORD") }));
```

## Anti-fatigue guard

`createResolver` throws `StrategyConfigError` if `NODE_ENV === "development"`
(or `APP_ENV === "development"`) and the chain contains a
`SystemEnvStrategy`. The fix is to construct the chain conditionally per
environment — never to add an "ignore-in-dev" escape hatch.
