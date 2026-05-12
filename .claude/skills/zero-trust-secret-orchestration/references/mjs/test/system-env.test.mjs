import { test } from "node:test";
import assert from "node:assert/strict";
import { SystemEnvStrategy } from "../src/strategies/system-env.mjs";

test("returns the env value when set", async () => {
  process.env.ZTS_T1 = "secret";
  assert.equal(await new SystemEnvStrategy().get("ZTS_T1"), "secret");
});

test("returns null on empty-string env", async () => {
  process.env.ZTS_T2 = "";
  assert.equal(await new SystemEnvStrategy().get("ZTS_T2"), null);
});

test("returns null on unset env", async () => {
  delete process.env.ZTS_T3;
  assert.equal(await new SystemEnvStrategy().get("ZTS_T3"), null);
});
