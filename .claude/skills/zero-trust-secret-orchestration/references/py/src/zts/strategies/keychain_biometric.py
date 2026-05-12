import os

from zts.harness import run_sandboxed
from zts.strategy import SecretResolutionError, Strategy


class KeychainBiometricStrategy(Strategy):
    """macOS Keychain reader gated by Touch ID via `security`.

    Exit code mapping for `security find-generic-password -w`:
      0   — success; stdout is the password.
      44  — keychain item not found → None.
      128 — user cancelled the biometric prompt → SecretResolutionError.
      other — unexpected → SecretResolutionError.
    """

    def __init__(self, service: str | None = None, *, _runner=None):
        self.service = service or os.environ.get("KEYCHAIN_SERVICE") or "zts"
        self._runner = _runner or run_sandboxed

    async def get(self, key: str) -> str | None:
        result = await self._runner(
            "security",
            "find-generic-password",
            "-s",
            self.service,
            "-a",
            key,
            "-w",
            timeout_ms=30_000,
        )
        if result.code == 44:
            return None
        if result.code == 128:
            raise SecretResolutionError("biometric prompt cancelled by user")
        if result.code != 0:
            raise SecretResolutionError(f"security exited {result.code}")
        return result.stdout.decode().rstrip("\n")
