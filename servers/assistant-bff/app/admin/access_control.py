from __future__ import annotations

from typing import Any

from app.admin.visibility_policy import (
    VisibilityPolicyConfig,
    coerce_bool as _visibility_coerce_bool,
    get_feature_enabled,
    get_flag_value,
    get_visibility_config,
    is_user_allowed,
)
from app.base_config import model_config
from app.storage.business_store import list_enabled_permissions_for_user


GPTS_VISIBILITY_POLICY = VisibilityPolicyConfig(
    feature_key="gpts_feature_enabled",
    scope_key="gpts_visible_scope",
    users_key="gpts_visible_users",
    feature_default=bool(model_config.GPTS_FEATURE_ENABLED),
    fallback_users=tuple(
        sorted(str(item).strip() for item in model_config.GPTS_WHITE_LIST if str(item).strip())
    ),
)

LIBRARY_VISIBILITY_POLICY = VisibilityPolicyConfig(
    feature_key="library_feature_enabled",
    scope_key="library_visible_scope",
    users_key="library_visible_users",
    feature_default=False,
)


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
    return _visibility_coerce_bool(value, default)


def get_feature_flag_value(config_key: str, default: Any = None) -> Any:
    return get_flag_value(config_key, default)


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
    scope, _users, using_fallback = get_visibility_config(GPTS_VISIBILITY_POLICY)
    return None if using_fallback else scope


def get_gpts_visibility_users() -> list[str]:
    _scope, users, using_fallback = get_visibility_config(GPTS_VISIBILITY_POLICY)
    return [] if using_fallback else users


def get_library_visibility_scope() -> str | None:
    scope, _users, using_fallback = get_visibility_config(LIBRARY_VISIBILITY_POLICY)
    return None if using_fallback else scope


def get_library_visibility_users() -> list[str]:
    _scope, users, using_fallback = get_visibility_config(LIBRARY_VISIBILITY_POLICY)
    return [] if using_fallback else users


def is_gpts_feature_visible_to_user(user: dict[str, object]) -> bool:
    scope, users, _using_fallback = get_visibility_config(GPTS_VISIBILITY_POLICY)
    return is_user_allowed(
        user_keys(user),
        feature_enabled=get_feature_enabled(GPTS_VISIBILITY_POLICY),
        visible_scope=scope,
        visible_users=users,
    )


def is_library_visible_to_user(user: dict[str, object]) -> bool:
    scope, users, _using_fallback = get_visibility_config(LIBRARY_VISIBILITY_POLICY)
    return is_user_allowed(
        user_keys(user),
        feature_enabled=get_feature_enabled(LIBRARY_VISIBILITY_POLICY),
        visible_scope=scope,
        visible_users=users,
    )


__all__ = [
    "fallback_permissions_for_user",
    "GPTS_VISIBILITY_POLICY",
    "LIBRARY_VISIBILITY_POLICY",
    "get_feature_flag_value",
    "get_gpts_visibility_scope",
    "get_gpts_visibility_users",
    "get_library_visibility_scope",
    "get_library_visibility_users",
    "get_feature_flag_string_list",
    "is_feature_flag_enabled",
    "is_gpts_feature_visible_to_user",
    "is_library_visible_to_user",
    "resolve_user_permissions",
    "user_keys",
]
