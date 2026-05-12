import os

from zts.strategy import Strategy


class SystemEnvStrategy(Strategy):
    async def get(self, key: str) -> str | None:
        return os.environ.get(key) or None
