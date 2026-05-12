"""Sandboxed subprocess harness — SPEC §2 ("Concealed Telemetry").

Stdout and stderr are strictly buffered. The harness offers no opt-out
(no `stdio`, `stdout`, `stderr` kwargs). This is intentional — forwarding
injected output to the parent's streams would leak environment variables,
intermediate steps, and unstructured payloads into shared logs. Do not
add an escape hatch.
"""

import asyncio
from typing import NamedTuple


class RunResult(NamedTuple):
    stdout: bytes
    stderr: bytes
    code: int | None  # None when killed by timeout


async def run_sandboxed(
    cmd: str,
    *args: str,
    timeout_ms: int | None = None,
    env: dict[str, str] | None = None,
    **forbidden: object,
) -> RunResult:
    if forbidden:
        raise TypeError(
            "run_sandboxed: unexpected kwargs %r — stdio override is not allowed "
            "(concealed-telemetry rule)" % list(forbidden.keys())
        )
    env = env if env is not None else {"PATH": "/usr/bin:/bin"}
    proc = await asyncio.create_subprocess_exec(
        cmd,
        *args,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        if timeout_ms is None:
            out, err = await proc.communicate()
            return RunResult(stdout=out, stderr=err, code=proc.returncode)
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_ms / 1000
            )
            return RunResult(stdout=out, stderr=err, code=proc.returncode)
        except asyncio.TimeoutError:
            proc.terminate()
            try:
                out, err = await asyncio.wait_for(proc.communicate(), timeout=1.0)
            except asyncio.TimeoutError:
                proc.kill()
                out, err = await proc.communicate()
            return RunResult(stdout=out, stderr=err, code=None)
    finally:
        if proc.returncode is None:
            proc.kill()
