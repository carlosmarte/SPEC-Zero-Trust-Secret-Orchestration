from abc import ABC, abstractmethod


class Strategy(ABC):
    """Polymorphic base for secret resolution strategies.

    Return contract for `get(key)`:
        - return None: I don't have this key; resolver continues the chain.
        - raise:       I had it but resolution failed; resolver STOPS here.
    """

    @abstractmethod
    async def get(self, key: str) -> str | None:
        raise NotImplementedError


class SecretResolutionError(Exception):
    """Raised when a strategy had the key but resolution failed.

    Resolver chain stops here; caller decides whether to retry.
    """


class StrategyConfigError(Exception):
    """Raised at resolver construction when the chain is mis-configured."""
