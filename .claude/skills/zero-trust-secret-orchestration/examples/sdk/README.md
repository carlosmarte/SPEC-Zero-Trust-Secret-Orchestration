# SDK Examples

Programmatic usage of the SKILL's reference packages from a host
application — Node ESM importer or Python `import` consumer.

## Setup

Node (mjs):

```bash
cd <skill-dir>/references/mjs && make install
node -e 'import("./src/strategy.mjs").then(m => console.log(Object.keys(m)))'
```

Python (py):

```bash
cd <skill-dir>/references/py && make install
python -c 'from zts.strategy import Strategy; print(Strategy.__module__)'
```

Minimal one-time initialization — construct the resolver exactly once and
attach it to whatever your host treats as long-lived state (Fastify
decorator, FastAPI `app.state`, module-level singleton in a CLI):

```js
const resolver = await createResolver({
  strategies: chainForEnv(process.env),
  env: process.env,
});
```

## Scenarios

| #   | Scenario                                              | Description                                                |
| --- | ----------------------------------------------------- | ---------------------------------------------------------- |
| 01  | [Local dev fallback](01-local-fallback.md)            | `[KeychainBiometricStrategy, SystemEnvStrategy]` chain.    |
| 02  | [Production fallback](02-production-fallback.md)      | `[SystemEnvStrategy, AwsSecretsManagerStrategy]` chain.    |
