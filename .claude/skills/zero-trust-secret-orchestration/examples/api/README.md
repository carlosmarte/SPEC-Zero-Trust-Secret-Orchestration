# API Examples

The SKILL's public surface contract — the canonical entry points routes
use to read a secret without round-tripping through `process.env`.

## Surface kind

Synchronous-style function calls on a framework-attached resolver. In
Fastify: `app.secrets.resolve(key)`. In FastAPI: `await secrets.resolve(key)`
inside a route that receives `Depends(get_secrets)`. The resolver itself
is async — the framework adapter just exposes it.

## Entries

| #   | Entry                                          | Description                                              |
| --- | ---------------------------------------------- | -------------------------------------------------------- |
| 01  | [Fastify route — `/db-url`](01-fastify-route.md) | Reads `PG_PASSWORD` via `app.secrets`.                  |
| 02  | [FastAPI route — `/db-url`](02-fastapi-route.md) | Reads `PG_PASSWORD` via `Depends(get_secrets)`.         |
