import { test } from "node:test";
import assert from "node:assert/strict";
import { runSandboxed } from "../src/harness.mjs";

test("kills runaway and reports code=null", async () => {
  const r = await runSandboxed("/bin/sleep", ["5"], { timeoutMs: 100 });
  assert.equal(r.code, null);
});
