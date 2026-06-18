from __future__ import annotations

from typing import Any

from app.base_config import model_config
from app.storage.business_store import get_admin_feature_flag, list_enabled_permissions_for_user


def user_keys(user: dict[str, object]) -> list[str]:
    keys: list[str] = []
    for field in ("email", "sub"):
        value = user.get(field)
        if isinstance(value, str) and value.strip():
            keys.append(value.strip())
    return keys


def fallback_permissions_for_user(user: dict[str, object]) -> set[str]:
    keys = set(user_keys(user))
    permissions: set[str] = set()
    if keys & model_config.GPTS_WHITE_LIST:
        permissions.update({"admin.access", "gpts.manage"})
    if keys & model_config.VOICE_LAB_WHITE_LIST:
        permissions.add("voice_lab.access")
    return permissions


def resolve_user_permissions(user: dict[str, object]) -> set[str]:
    keys = user_keys(user)
    permissions = list_enabled_permissions_for_user(keys)
    permissions.update(fallback_permissions_for_user(user))
    return {item for item in permissions if item}


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def get_feature_flag_value(config_key: str, default: Any = None) -> Any:
    item = get_admin_feature_flag(config_key)
    if item is None:
        return default
    return item.get("config_value", default)


def is_feature_flag_enabled(config_key: str, default: bool = False) -> bool:
    return _coerce_bool(get_feature_flag_value(config_key, default), default)


def get_feature_flag_string_list(config_key: str) -> list[str]:
    value = get_feature_flag_value(config_key, [])
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized and normalized not in items:
                items.append(normalized)
    return items


def get_gpts_visibility_scope() -> str | None:
    value = get_feature_flag_value("gpts_visible_scope", None)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"all", "restricted"}:
            return normalized
    return None


def get_gpts_visibility_users() -> list[str]:
    return get_feature_flag_string_list("gpts_visible_users")


__all__ = [
    "fallback_permissions_for_user",
    "get_feature_flag_value",
    "get_gpts_visibility_scope",
    "get_gpts_visibility_users",
    "get_feature_flag_string_list",
    "is_feature_flag_enabled",
    "resolve_user_permissions",
    "user_keys",
]
