import pytest

from zts.strategies.system_env import SystemEnvStrategy


@pytest.mark.asyncio
async def test_present(monkeypatch):
    monkeypatch.setenv("ZTS_T1", "secret")
    assert await SystemEnvStrategy().get("ZTS_T1") == "secret"


@pytest.mark.asyncio
async def test_empty(monkeypatch):
    monkeypatch.setenv("ZTS_T2", "")
    assert await SystemEnvStrategy().get("ZTS_T2") is None


@pytest.mark.asyncio
async def test_absent(monkeypatch):
    monkeypatch.delenv("ZTS_T3", raising=False)
    assert await SystemEnvStrategy().get("ZTS_T3") is None
