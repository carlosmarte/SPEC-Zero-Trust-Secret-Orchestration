from fastapi import Request

from zts.resolver import Resolver


def attach_secrets(app, resolver: Resolver) -> None:
    """Store `resolver` on the FastAPI app state.

    Routes should read it via `Depends(get_secrets)`.
    """
    app.state.secrets = resolver


async def get_secrets(request: Request) -> Resolver:
    return request.app.state.secrets
