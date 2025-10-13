"""Mock authentication routes and helpers.

The real project relies on an authentication system.  For the purposes of
testing the front-end in this repository we provide minimal endpoints and
a dependency that returns a dummy user.  This allows other routes to use
``Depends(get_current_user)`` without implementing a full auth flow.
"""

from __future__ import annotations

from fastapi import APIRouter


# All authentication-related mock routes live under ``/api/auth`` so the
# front-end can interact with them using the paths it expects.
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status")
async def status() -> dict[str, str]:
    """Return a mock login status."""
    return {"name": "mock_user"}


@router.get("/get-provider")
async def get_provider() -> dict[str, dict[str, str]]:
    """Return a dummy OAuth provider description."""
    return {"provider": {"name": "MockSSO", "param": "mock"}}


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


def get_current_user() -> dict[str, str]:
    """Return a dummy user for dependency injection.

    In production this function would verify a token or session and
    return the authenticated user.  Here we simply return a static
    dictionary so that other routes can depend on it without additional
    setup.
    """

    return {"sub": "mock_user", "email": "mock@example.com"}


__all__ = ["router", "get_current_user"]
