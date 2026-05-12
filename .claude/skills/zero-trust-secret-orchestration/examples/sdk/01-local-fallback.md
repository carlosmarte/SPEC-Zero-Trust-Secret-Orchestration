# Scenario 01 — Local-dev fallback chain

## Goal

Demonstrate the local-dev fallback chain that forces a biometric gate
before considering any other source. The resolver factory's anti-fatigue
guard means `SystemEnvStrategy` MUST NOT appear in this chain when
`NODE_ENV=development` — so the chain is biometric-only.

## Prerequisites

- macOS with Touch ID enrolled.
- A keychain item for the demo:
  ```bash
  security add-generic-password -s zts-demo -a DB_PASSWORD -w hunter2 -U
  ```
- The mjs reference installed: `cd <skill-dir>/references/mjs && make install`.

## Code

```js
// examples/sdk/01-local-fallback.mjs
import { createResolver } from "../../references/mjs/src/resolver.mjs";
import { KeychainBiometricStrategy } from "../../references/mjs/src/strategies/keychain-biometric.mjs";

const resolver = await createResolver({
  strategies: [new KeychainBiometricStrategy({ service: "zts-demo" })],
  env: process.env,
});

const v = await resolver.resolve("DB_PASSWORD");
console.log(v);
```

## Invocation

```bash
NODE_ENV=development node examples/sdk/01-local-fallback.mjs
```

## Expected outcome

| Step                                | Outcome                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| 1. Biometric prompt fires (manual)  | macOS Touch ID sheet appears with `security` listed as the requester. |
| 2. User approves with Touch ID      | `security` exits 0; stdout contains the password.                   |
| 3. Process prints to stdout         | `hunter2`                                                           |

The biometric prompt step is `manual` — this scenario CANNOT run in CI
because Touch ID requires a human hand. CI marks this example as
`skipped`.

## Notes

- Do NOT add `SystemEnvStrategy` here — the resolver factory will throw
  `StrategyConfigError` because `NODE_ENV=development`. That guard is
  intentional (SPEC §4 anti-fatigue).
- If `security` returns 44 (item not found), the resolver returns `null`
  and your program decides how to surface "not configured locally".
- If the user cancels the biometric prompt, `security` exits 128 and the
  resolver throws `SecretResolutionError("biometric prompt cancelled by user")`.
