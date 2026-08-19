"""Deployment-specific auth provider resolution.

``resolve_auth_provider`` decides which login portal/provider a request
came from.  The rules depend on the deployment environment (user-agent
patterns, trusted proxy IPs, default portal id), so this logic lives in
its own module and is expected to be replaced per deployment.
"""

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


def get_current_auth_provider(user: dict[str, str]) -> str:
    provider = (
        user.get("auth_provider")
        or user.get("provider")
        or user.get("provider_param")
    )
    return normalize_auth_provider(provider)
