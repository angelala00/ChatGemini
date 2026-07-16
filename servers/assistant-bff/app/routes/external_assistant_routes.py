from __future__ import annotations

import re
from urllib.parse import unquote, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, status

from app.admin.access_control import (
    get_feature_flag_value,
    is_external_assistant_visible_to_user,
)
from app.auth.auth_routes import get_current_user
from app.base_config import model_config


router = APIRouter(prefix="/api/external-assistant", tags=["external-assistant"])

EXTERNAL_ASSISTANT_BASE_URL_KEY = "external_assistant_base_url"
EXTERNAL_ASSISTANT_MENUS_KEY = "external_assistant_menus"
MAX_EXTERNAL_ASSISTANT_MENUS = 30
_MENU_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def is_external_assistant_allowed(user: dict[str, object]) -> bool:
    return is_external_assistant_visible_to_user(user)


def ensure_external_assistant_allowed(user: dict[str, object]) -> None:
    if not is_external_assistant_allowed(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "External assistant workspace not enabled",
        )


def _safe_base_url(value: object) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    if normalized.startswith("/") and not normalized.startswith("//"):
        parsed = urlsplit(normalized)
        if not parsed.scheme and not parsed.netloc and not parsed.query and not parsed.fragment:
            return parsed.path
        return ""
    parsed = urlsplit(normalized)
    if (
        parsed.scheme in {"http", "https"}
        and parsed.netloc
        and not parsed.query
        and not parsed.fragment
    ):
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", "", ""))
    return ""


def _normalize_menu_path(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if normalized.startswith("//") or "\\" in normalized:
        return None
    parsed = urlsplit(normalized)
    if parsed.scheme or parsed.netloc:
        return None

    path = parsed.path.lstrip("/")
    for segment in path.split("/"):
        decoded_segment = unquote(segment)
        if decoded_segment in {".", ".."} or "/" in decoded_segment or "\\" in decoded_segment:
            return None
    return urlunsplit(("", "", path, parsed.query, parsed.fragment))


def _resolve_menu_url(base_url: str, relative_path: str) -> str:
    path = urlsplit(relative_path)
    base = urlsplit(base_url)
    if base.scheme and base.netloc:
        if not path.path:
            return urlunsplit((base.scheme, base.netloc, base.path or "/", path.query, path.fragment))
        base_path = base.path.rstrip("/")
        resolved_path = f"{base_path}/{path.path}"
        return urlunsplit((base.scheme, base.netloc, resolved_path or "/", path.query, path.fragment))

    if not path.path:
        return urlunsplit(("", "", base.path or "/", path.query, path.fragment))
    base_path = base.path.rstrip("/")
    resolved_path = f"{base_path}/{path.path}"
    return urlunsplit(("", "", resolved_path or "/", path.query, path.fragment))


def _configured_menus(base_url: str, value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    menus: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for item in value[:MAX_EXTERNAL_ASSISTANT_MENUS]:
        if not isinstance(item, dict):
            continue
        menu_id = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        relative_path = _normalize_menu_path(item.get("path"))
        if (
            not _MENU_ID_PATTERN.fullmatch(menu_id)
            or not label
            or len(label) > 80
            or relative_path is None
            or menu_id in seen_ids
        ):
            continue
        seen_ids.add(menu_id)
        menus.append(
            {
                "id": menu_id,
                "label": label,
                "url": _resolve_menu_url(base_url, relative_path),
            }
        )
    return menus


@router.get("/permission")
async def external_assistant_permission(
    user: dict = Depends(get_current_user),
) -> dict[str, bool]:
    return {"allowed": is_external_assistant_allowed(user)}


@router.get("/bootstrap")
async def external_assistant_bootstrap(
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    ensure_external_assistant_allowed(user)
    title = model_config.EXTERNAL_ASSISTANT_TITLE
    base_url = _safe_base_url(
        get_feature_flag_value(
            EXTERNAL_ASSISTANT_BASE_URL_KEY,
            model_config.EXTERNAL_ASSISTANT_URL,
        )
    )
    menus = _configured_menus(
        base_url,
        get_feature_flag_value(EXTERNAL_ASSISTANT_MENUS_KEY, []),
    ) if base_url else []
    iframe_url = menus[0]["url"] if menus else base_url
    return {
        "allowed": True,
        "title": title,
        "iframe_url": iframe_url,
        "menus": menus,
    }


__all__ = [
    "ensure_external_assistant_allowed",
    "external_assistant_bootstrap",
    "external_assistant_permission",
    "is_external_assistant_allowed",
    "router",
]
