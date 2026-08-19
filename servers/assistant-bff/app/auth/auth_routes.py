from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth.auth_login_token import get_current_user
from app.auth.oauth import (
    DEFAULT_AUTH_PROVIDER,
    get_current_auth_provider,
    normalize_auth_provider,
    resolve_auth_provider,
)

GLOBAL_AUTH_PROVIDER = "global"

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/get-provider")
async def get_provider(request: Request) -> dict[str, dict[str, str]]:
    return {"provider": {"name": "MockSSO", "param": resolve_auth_provider(request)}}


@router.get("/oauth-login/{provider}")
async def oauth_login(provider: str) -> dict[str, str]:
    return {"message": f"mock redirect to {provider}"}


@router.get("/oauth-callback/{provider}")
async def oauth_callback(provider: str) -> dict[str, str]:
    return {"message": f"mock callback from {provider}"}


@router.post("/logout")
async def logout() -> dict[str, str]:
    return {"message": "logged out"}


@router.get("/status")
async def status(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
    return {"name": user.get("name", "")}


@router.get("/userinfo")
async def userinfo(
    user: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:
    return {
        "sub": user.get("sub", ""),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "group": user.get("group", ""),
        "auth_provider": user.get("auth_provider", ""),
    }


__all__ = [
    "DEFAULT_AUTH_PROVIDER",
    "GLOBAL_AUTH_PROVIDER",
    "router",
    "get_current_user",
    "get_current_auth_provider",
    "normalize_auth_provider",
    "resolve_auth_provider",
]
