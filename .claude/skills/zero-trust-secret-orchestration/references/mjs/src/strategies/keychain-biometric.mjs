import { Strategy, SecretResolutionError } from "../strategy.mjs";
import { runSandboxed } from "../harness.mjs";

/**
 * Exit code mapping for `security find-generic-password -w`:
 *   0   — success; stdout is the password (trim trailing newline).
 *   44  — keychain item not found → resolver should continue chain → null.
 *   128 — user cancelled the biometric prompt → SecretResolutionError.
 *   other — unexpected; treat as resolution failure → SecretResolutionError.
 */
export class KeychainBiometricStrategy extends Strategy {
  constructor({ service, _runner } = {}) {
    super();
    this.service = service ?? process.env.KEYCHAIN_SERVICE ?? "zts";
    this._runner = _runner ?? runSandboxed;
  }

  async get(key) {
    const { stdout, code } = await this._runner(
      "security",
      ["find-generic-password", "-s", this.service, "-a", key, "-w"],
      { timeoutMs: 30_000 },
    );
    if (code === 44) return null;
    if (code === 128) {
      throw new SecretResolutionError("biometric prompt cancelled by user");
    }
    if (code !== 0) {
      throw new SecretResolutionError(`security exited ${code}`);
    }
    return stdout.toString().trim();
  }
}
