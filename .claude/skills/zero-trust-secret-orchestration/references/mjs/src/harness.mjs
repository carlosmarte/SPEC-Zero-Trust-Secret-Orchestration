/**
 * Sandboxed subprocess harness — SPEC §2 ("Concealed Telemetry").
 *
 * Stdout and stderr are strictly buffered. The harness offers no opt-out
 * (no `stdio`, `stdout`, or `stderr` override). This is intentional —
 * forwarding injected output to the parent's streams would leak
 * environment variables, intermediate steps, and unstructured payloads
 * into shared logs. Do not add an escape hatch.
 */

import { spawn } from "node:child_process";

/**
 * Sandboxed subprocess runner. Buffers stdout/stderr; never inherits or
 * pipes to the parent's stdio. Caller receives buffers and the exit code.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ timeoutMs?: number, env?: Record<string,string>, stdio?: never, stdout?: never, stderr?: never }} [opts]
 * @returns {Promise<{ stdout: Buffer, stderr: Buffer, code: number | null }>}
 */
export function runSandboxed(cmd, args, opts = {}) {
  if (opts.stdio !== undefined || opts.stdout !== undefined || opts.stderr !== undefined) {
    throw new Error(
      "runSandboxed: stdio override is not allowed (concealed-telemetry rule)",
    );
  }
  const env = opts.env ?? { PATH: "/usr/bin:/bin" };
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    let timer;
    let killer;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        killer = setTimeout(() => child.kill("SIGKILL"), 1000);
      }, opts.timeoutMs);
    }
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err),
        code,
      });
    });
  });
}
