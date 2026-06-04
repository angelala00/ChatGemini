from __future__ import annotations

from fastapi import Request


DEFAULT_AUTH_PROVIDER = "c"


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
