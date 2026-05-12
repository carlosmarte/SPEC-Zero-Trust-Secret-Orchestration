# References — Python

Reference implementation of the Zero-Trust Secret Orchestration spec for
Python services using FastAPI and asyncio.

## Surface

| Module                                       | Export                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `zts.strategy`                               | `Strategy`, `SecretResolutionError`, `StrategyConfigError`                      |
| `zts.harness`                                | `run_sandboxed`, `RunResult`                                                    |
| `zts.resolver`                               | `Resolver`, `create_resolver`                                                   |
| `zts.strategies.system_env`                  | `SystemEnvStrategy`                                                             |
| `zts.strategies.keychain_biometric`          | `KeychainBiometricStrategy`                                                     |
| `zts.strategies.cloud`                       | `CloudSecretStrategy`, `AwsSecretsManagerStrategy`                              |
| `zts.fastapi_adapter`                        | `attach_secrets`, `get_secrets`                                                 |

## Wiring a real AWS Secrets Manager client

```python
import aioboto3

from zts.strategies.cloud import AwsSecretsManagerStrategy

session = aioboto3.Session()
async with session.client("secretsmanager", region_name="us-east-1") as client:
    strategy = AwsSecretsManagerStrategy(client=client)
    # use `strategy` for the lifetime of the `async with` block
```

The strategy treats the `client` opaquely — it only calls
`await client.get_secret_value(SecretId=key)`. Any object satisfying
that shape (a mock, a custom wrapper, a different provider's SDK) works.

## FastAPI wiring

```python
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from zts.fastapi_adapter import attach_secrets, get_secrets
from zts.resolver import Resolver, create_resolver
from zts.strategies.keychain_biometric import KeychainBiometricStrategy


@asynccontextmanager
async def lifespan(app: FastAPI):
    resolver = create_resolver([KeychainBiometricStrategy()])
    attach_secrets(app, resolver)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/db")
async def db(secrets: Resolver = Depends(get_secrets)):
    return {"pg": await secrets.resolve("PG_PASSWORD")}
```

## Anti-fatigue guard

`create_resolver` raises `StrategyConfigError` if `APP_ENV == "development"`
(or `NODE_ENV == "development"`) and the chain contains a
`SystemEnvStrategy`. The fix is to construct the chain conditionally per
environment — never to add an "ignore-in-dev" escape hatch.
