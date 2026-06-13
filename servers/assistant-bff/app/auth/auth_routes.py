"""Mock authentication routes and helpers.

The real project relies on an authentication system.  For the purposes of
testing the front-end in this repository we provide minimal endpoints and
a dependency that returns a dummy user.  This allows other routes to use
``Depends(get_current_user)`` without implementing a full auth flow.
"""

from __future__ import annotations

from fastapi import APIRouter, Request


DEFAULT_AUTH_PROVIDER = "c"
GLOBAL_AUTH_PROVIDER = "global"


def resolve_auth_provider(request: Request) -> str:
    """Resolve the login portal/provider from trusted request context."""

    user_agent = request.headers.get("user-agent", "")
    x_forwarded_for = request.headers.get("x-forwarded-for", "")

    if "aaaa" in user_agent:
        return "a"
    if x_forwarded_for and any(item in x_forwarded_for for item in ("ip1", "ip2")):
        return "b"
    return DEFAULT_AUTH_PROVIDER


def normalize_auth_provider(value: object) -> str:
    provider = str(value or "").strip()
    return provider or DEFAULT_AUTH_PROVIDER


# All authentication-related mock routes live under ``/api/auth`` so the
# front-end can interact with them using the paths it expects.
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status")
async def status() -> dict[str, str]:
    """Return a mock login status."""
    return {"name": "user2-claude"}


@router.get("/get-provider")
async def get_provider(request: Request) -> dict[str, dict[str, str]]:
    """Return a dummy OAuth provider description."""
    return {"provider": {"name": "MockSSO", "param": resolve_auth_provider(request)}}


@router.get("/oauth-login/{provider}")
async def oauth_login(provider: str) -> dict[str, str]:
    """Pretend to redirect to the provider's login page."""
    return {"message": f"mock redirect to {provider}"}


@router.post("/logout")
async def logout() -> dict[str, str]:
    """Return a mock logout confirmation."""
    return {"message": "logged out"}


@router.post("/login")
async def login() -> dict[str, str]:
    """Return a mock login response."""
    return {"access_token": "mock-token"}


def get_current_user(request: Request) -> dict[str, str]:
    """Return a dummy user for dependency injection.

    In production this function would verify a token or session and
    return the authenticated user.  Here we simply return a static
    dictionary so that other routes can depend on it without additional
    setup.
    """

    return {
        "sub": "user2-claude@nu.com",
        "email": "user2-claude@nu.com",
        "group": "CN=jc,OU=平台组,OU=平台运维,OU=nuuser,DC=nu,DC=com",
        "auth_provider": resolve_auth_provider(request),
    }


def get_current_auth_provider(user: dict[str, str]) -> str:
    provider = (
        user.get("auth_provider")
        or user.get("provider")
        or user.get("provider_param")
    )
    return normalize_auth_provider(provider)


__all__ = [
    "DEFAULT_AUTH_PROVIDER",
    "GLOBAL_AUTH_PROVIDER",
    "router",
    "get_current_user",
    "get_current_auth_provider",
    "normalize_auth_provider",
    "resolve_auth_provider",
]
