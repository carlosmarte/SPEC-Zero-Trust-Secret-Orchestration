import pytest

from zts.harness import run_sandboxed


@pytest.mark.asyncio
async def test_timeout_kills_and_reports_none():
    r = await run_sandboxed("/bin/sleep", "5", timeout_ms=100)
    assert r.code is None
