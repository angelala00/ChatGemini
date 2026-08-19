"""Login identity resolution for the current request.

``get_current_user`` verifies the login state of an incoming request
(token / session) and returns the authenticated user's identity dict:
``{name, sub, email, group, auth_provider}``.

This logic is deployment-specific (the mock here returns a dummy user),
so it lives in its own module and is expected to be replaced in real
deployments.  In production it should raise HTTP 401 when the request
is not authenticated.
"""

from __future__ import annotations

from fastapi import Request

from app.auth.oauth import resolve_auth_provider


def get_current_user(request: Request) -> dict[str, str]:
    """Return a dummy user for dependency injection.

    In production this function would verify a token or session and
    return the authenticated user.  Here we simply return a static
    dictionary so that other routes can depend on it without additional
    setup.
    """

    return {
        "name": "user2-claude",
        "sub": "user2-claude@nu.com",
        "email": "user2-claude@nu.com",
        "group": "CN=jc,OU=平台组,OU=平台运维,OU=nuuser,DC=nu,DC=com",
        "auth_provider": resolve_auth_provider(request),
    }
