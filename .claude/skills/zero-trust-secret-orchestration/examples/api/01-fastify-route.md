# Entry 01 — Fastify `GET /db-url`

## Goal

Read a secret via `app.secrets.resolve(...)` inside a Fastify route
handler. The handler never touches `process.env` directly — that's the
whole point of the SPEC.

## Signature

```
GET /db-url → 200 { connection: string } | 404 | 500
```

## Inputs

None. The route name is fixed.

## Outputs

| Status | Body                                                            |
| ------ | --------------------------------------------------------------- |
| 200    | `{ "connection": "postgres://user:hunter2@localhost/db" }`      |
| 404    | `{ "error": "secret_missing", "key": "PG_PASSWORD" }`           |
| 500    | `{ "error": "<ErrorClassName>", "message": "..." }`             |

## Errors

| Condition                  | Surface                       |
| -------------------------- | ----------------------------- |
| resolver returned `null`   | 404 with `secret_missing`     |
| `SecretResolutionError`    | 500 with the error class name |
| `StrategyConfigError`      | 500 with the error class name |

## Example

```js
// app.mjs
import Fastify from "fastify";
import ztsPlugin from "../../references/mjs/src/fastify-plugin.mjs";
import { KeychainBiometricStrategy } from "../../references/mjs/src/strategies/keychain-biometric.mjs";
import { SystemEnvStrategy } from "../../references/mjs/src/strategies/system-env.mjs";
import { SecretResolutionError, StrategyConfigError } from "../../references/mjs/src/strategy.mjs";

const app = Fastify({ logger: true });
await app.register(ztsPlugin, {
  strategies:
    process.env.APP_ENV === "production"
      ? [new SystemEnvStrategy()]
      : [new KeychainBiometricStrategy({ service: "zts-demo" })],
});

app.get("/db-url", async (req, reply) => {
  try {
    const pw = await app.secrets.resolve("PG_PASSWORD");
    if (pw === null) {
      return reply.code(404).send({ error: "secret_missing", key: "PG_PASSWORD" });
    }
    return { connection: `postgres://user:${pw}@localhost/db` };
  } catch (e) {
    if (e instanceof SecretResolutionError || e instanceof StrategyConfigError) {
      return reply.code(500).send({ error: e.name, message: e.message });
    }
    throw e;
  }
});

await app.listen({ port: 3000 });
```

## Invocation

```bash
APP_ENV=production PG_PASSWORD=hunter2 node examples/api/app.mjs &
curl -s http://localhost:3000/db-url
```

## Expected body

```json
{"connection":"postgres://user:hunter2@localhost/db"}
```
