import { test } from "node:test";
import assert from "node:assert/strict";
import { KeychainBiometricStrategy } from "../src/strategies/keychain-biometric.mjs";
import { SecretResolutionError } from "../src/strategy.mjs";

const mkRunner = (out, code) =>
  async function () {
    return { stdout: Buffer.from(out), stderr: Buffer.alloc(0), code };
  };

test("returns trimmed stdout on exit 0", async () => {
  const s = new KeychainBiometricStrategy({ _runner: mkRunner("secret\n", 0) });
  assert.equal(await s.get("k"), "secret");
});

test("returns null on exit 44", async () => {
  const s = new KeychainBiometricStrategy({ _runner: mkRunner("", 44) });
  assert.equal(await s.get("k"), null);
});

test("throws on exit 128", async () => {
  const s = new KeychainBiometricStrategy({ _runner: mkRunner("", 128) });
  await assert.rejects(() => s.get("k"), SecretResolutionError);
});
