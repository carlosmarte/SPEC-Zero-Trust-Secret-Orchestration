from zts.strategy import SecretResolutionError, Strategy, StrategyConfigError


class CloudSecretStrategy(Strategy):
    """Concrete subclasses implement `_fetch(key)`."""

    async def _fetch(self, key: str) -> str | None:
        raise NotImplementedError(
            "CloudSecretStrategy._fetch must be implemented by a subclass"
        )

    async def get(self, key: str) -> str | None:
        try:
            return await self._fetch(key)
        except StrategyConfigError:
            raise
        except Exception as exc:
            raise SecretResolutionError(f"cloud fetch failed for {key}") from exc


class AwsSecretsManagerStrategy(CloudSecretStrategy):
    def __init__(self, *, client=None):
        self.client = client

    async def _fetch(self, key: str) -> str | None:
        if self.client is None:
            raise StrategyConfigError(
                "AwsSecretsManagerStrategy is a stub. "
                "Inject `client=boto3.client('secretsmanager')` to activate it."
            )
        out = await self.client.get_secret_value(SecretId=key)
        return out.get("SecretString")
