from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from app.auth.auth_login_token import get_current_user
from app.auth.oauth import (
    DEFAULT_AUTH_PROVIDER,
    get_current_auth_provider,
    normalize_auth_provider,
    resolve_auth_provider,
)

GLOBAL_AUTH_PROVIDER = "global"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _safe_return_to(value: object) -> str:
    normalized = str(value or "").strip()
    if not normalized.startswith("/") or normalized.startswith("//") or "\\" in normalized:
        return ""
    parsed = urlsplit(normalized)
    if parsed.scheme or parsed.netloc:
        return ""
    return normalized


@router.get("/get-provider")
async def get_provider(request: Request) -> dict[str, dict[str, str]]:
    return {"provider": {"name": "MockSSO", "param": resolve_auth_provider(request)}}


def _login_entry_response(request: Request, return_to: str, provider: str) -> Response:
    # Contract for the production (intranet) OAuth implementation:
    # - the frontend jumps to a single entry (`/api/auth/login?returnTo=...`);
    #   the provider is resolved server-side from request context (UA/IP via
    #   resolve_auth_provider), so sub-apps never need get-provider first,
    # - accept a `returnTo` query param that must be a same-site relative path
    #   (validated by _safe_return_to: starts with "/", no "//", no backslash,
    #   no scheme/netloc; query and fragment are allowed),
    # - carry it through the OAuth flow (state or server-side session),
    # - 302-redirect back to that relative path after the callback completes.
    # Do NOT build redirects from Referer in production; same-origin deployments
    # resolve relative targets correctly. The Referer handling below only exists
    # so the mock works across dev ports (frontend :3000 / backend :5008).
    target = _safe_return_to(return_to)
    if target:
        origin = ""
        referer = request.headers.get("referer") or ""
        parsed_referer = urlsplit(referer) if referer else None
        if parsed_referer and parsed_referer.scheme and parsed_referer.netloc:
            origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"
        return RedirectResponse(f"{origin}{target}", status_code=302)
    return {"message": f"mock redirect to {provider}"}



@router.get("/oauth-login/{provider}")
async def oauth_login(provider: str, request: Request, returnTo: str = "") -> Response:
    # Kept for backward compatibility; prefer the `/api/auth/login` entry.
    return _login_entry_response(request, returnTo, normalize_auth_provider(provider))


@router.get("/oauth-callback/{provider}")
async def oauth_callback(provider: str) -> dict[str, str]:
    # Production implementation: after the OAuth provider callback completes,
    # apply the same _safe_return_to validation and 302 back to that path.
    return {"message": f"mock callback from {provider}"}


@router.get("/login")
async def login(request: Request, returnTo: str = "") -> Response:
    # Single login entry for sub-apps: provider resolution happens here based
    # on request context, the browser navigates directly to this endpoint.
    return _login_entry_response(request, returnTo, resolve_auth_provider(request))


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
