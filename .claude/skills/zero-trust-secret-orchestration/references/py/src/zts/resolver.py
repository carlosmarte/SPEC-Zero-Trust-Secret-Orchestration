from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Sequence

from zts.strategy import Strategy, StrategyConfigError


@dataclass
class Resolver:
    strategies: Sequence[Strategy]

    async def resolve(self, key: str) -> str | None:
        for s in self.strategies:
            v = await s.get(key)
            if v is not None:
                return v
        return None


def create_resolver(
    strategies: Sequence[Strategy], env: dict | None = None
) -> Resolver:
    env = env if env is not None else os.environ
    if not strategies:
        raise TypeError("create_resolver requires a non-empty strategies sequence")
    for s in strategies:
        if not isinstance(s, Strategy):
            raise TypeError(f"chain entry {type(s).__name__} is not a Strategy")

    is_dev = env.get("APP_ENV") == "development" or env.get("NODE_ENV") == "development"
    if is_dev:
        from zts.strategies.system_env import SystemEnvStrategy

        if any(isinstance(s, SystemEnvStrategy) for s in strategies):
            raise StrategyConfigError(
                "SystemEnvStrategy is disabled in development. "
                "Use KeychainBiometricStrategy locally to enforce the biometric gate."
            )

    return Resolver(strategies=list(strategies))
