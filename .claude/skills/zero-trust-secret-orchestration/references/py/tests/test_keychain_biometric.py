from collections import namedtuple

import pytest

from zts.strategies.keychain_biometric import KeychainBiometricStrategy
from zts.strategy import SecretResolutionError

RunResult = namedtuple("RunResult", ["stdout", "stderr", "code"])


def _runner(out: str, code: int):
    async def fake(*_args, **_kwargs):
        return RunResult(stdout=out.encode(), stderr=b"", code=code)

    return fake


@pytest.mark.asyncio
async def test_success():
    s = KeychainBiometricStrategy(_runner=_runner("secret\n", 0))
    assert await s.get("k") == "secret"


@pytest.mark.asyncio
async def test_not_found():
    s = KeychainBiometricStrategy(_runner=_runner("", 44))
    assert await s.get("k") is None


@pytest.mark.asyncio
async def test_cancelled():
    s = KeychainBiometricStrategy(_runner=_runner("", 128))
    with pytest.raises(SecretResolutionError):
        await s.get("k")
