# Entry 02 — FastAPI `GET /db-url`

## Goal

Read a secret via `app.state.secrets` inside a FastAPI route handler
using `Depends(get_secrets)`. The handler never touches `os.environ`
directly — that's the whole point of the SPEC.

## Signature

```
GET /db-url → 200 { connection: str } | 404 | 500
```

## Inputs

None.

## Outputs

| Status | Body                                                            |
| ------ | --------------------------------------------------------------- |
| 200    | `{ "connection": "postgres://user:hunter2@localhost/db" }`      |
| 404    | `{ "error": "secret_missing", "key": "PG_PASSWORD" }`           |
| 500    | `{ "error": "<ErrorClassName>", "message": "..." }`             |

## Errors

| Condition                  | Surface                       |
| -------------------------- | ----------------------------- |
| resolver returned `None`   | 404 with `secret_missing`     |
| `SecretResolutionError`    | 500 with the error class name |
| `StrategyConfigError`      | 500 with the error class name |

## Example

```python
# app.py
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from zts.fastapi_adapter import attach_secrets, get_secrets
from zts.resolver import Resolver, create_resolver
from zts.strategies.keychain_biometric import KeychainBiometricStrategy
from zts.strategies.system_env import SystemEnvStrategy
from zts.strategy import SecretResolutionError, StrategyConfigError


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("APP_ENV") == "production":
        chain = [SystemEnvStrategy()]
    else:
        chain = [KeychainBiometricStrategy(service="zts-demo")]
    resolver = create_resolver(chain)
    attach_secrets(app, resolver)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/db-url")
async def db_url(secrets: Resolver = Depends(get_secrets)):
    try:
        pw = await secrets.resolve("PG_PASSWORD")
    except SecretResolutionError as e:
        raise HTTPException(status_code=500, detail={"error": type(e).__name__, "message": str(e)})
    except StrategyConfigError as e:
        raise HTTPException(status_code=500, detail={"error": type(e).__name__, "message": str(e)})
    if pw is None:
        raise HTTPException(status_code=404, detail={"error": "secret_missing", "key": "PG_PASSWORD"})
    return {"connection": f"postgres://user:{pw}@localhost/db"}
```

## Invocation

```bash
APP_ENV=production PG_PASSWORD=hunter2 uv run uvicorn examples.api.app:app --port 3001 &
curl -s http://localhost:3001/db-url
```

## Expected body

```json
{"connection":"postgres://user:hunter2@localhost/db"}
```
