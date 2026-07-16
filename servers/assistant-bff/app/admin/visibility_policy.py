from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from app.storage.business_store import get_admin_feature_flag, upsert_admin_feature_flag


@dataclass(frozen=True)
class VisibilityPolicyConfig:
    feature_key: str
    scope_key: str
    users_key: str
    feature_default: bool = False
    fallback_users: tuple[str, ...] = field(default_factory=tuple)
    fallback_users_provider: Callable[[], Iterable[object]] | None = None
    fallback_scope: str = "restricted"
    empty_fallback_scope: str = "all"


def coerce_bool(value: Any, default: bool) -> bool:
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


def normalize_user_identifiers(values: Iterable[object]) -> list[str]:
    items: list[str] = []
    for item in values:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized and normalized not in items:
                items.append(normalized)
    return items


def get_flag_value(config_key: str, default: Any = None) -> Any:
    item = get_admin_feature_flag(config_key)
    if item is None:
        return default
    return item.get("config_value", default)


def get_feature_enabled(config: VisibilityPolicyConfig) -> bool:
    return coerce_bool(get_flag_value(config.feature_key, config.feature_default), config.feature_default)


def get_visibility_config(config: VisibilityPolicyConfig) -> tuple[str, list[str], bool]:
    scope_item = get_admin_feature_flag(config.scope_key)
    users_item = get_admin_feature_flag(config.users_key)

    normalized_scope = ""
    if scope_item is not None:
        scope_value = str(scope_item.get("config_value") or "").strip().lower()
        if scope_value in {"all", "restricted"}:
            normalized_scope = scope_value

    normalized_users: list[str] = []
    if users_item is not None:
        raw_users = users_item.get("config_value")
        if isinstance(raw_users, list):
            normalized_users = normalize_user_identifiers(raw_users)

    if normalized_scope:
        return normalized_scope, sorted(normalized_users), False

    fallback_source = (
        config.fallback_users_provider()
        if config.fallback_users_provider is not None
        else config.fallback_users
    )
    fallback_users = normalize_user_identifiers(fallback_source)
    if fallback_users:
        return config.fallback_scope, sorted(fallback_users), True
    return config.empty_fallback_scope, [], True


def normalize_visibility_payload(visible_scope: str, visible_users: Iterable[object]) -> dict[str, Any]:
    normalized_scope = visible_scope.strip().lower()
    if normalized_scope not in {"all", "restricted"}:
        raise ValueError("invalid visible_scope")
    return {
        "visible_scope": normalized_scope,
        "visible_users": normalize_user_identifiers(visible_users),
    }


def is_user_allowed(
    user_identifiers: Iterable[str],
    *,
    feature_enabled: bool,
    visible_scope: str,
    visible_users: Iterable[str],
) -> bool:
    if not feature_enabled:
        return False
    if visible_scope == "all":
        return True
    if visible_scope == "restricted":
        allowed_users = set(normalize_user_identifiers(visible_users))
        if not allowed_users:
            return False
        return bool(allowed_users & set(normalize_user_identifiers(user_identifiers)))
    return False


def upsert_visibility_flags(
    config: VisibilityPolicyConfig,
    *,
    visible_scope: str,
    visible_users: list[str],
    updated_by: str,
    scope_description: str,
    users_description: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    scope_item = upsert_admin_feature_flag(
        config_key=config.scope_key,
        config_value=visible_scope,
        value_type="string",
        description=scope_description,
        updated_by=updated_by,
    )
    users_item = upsert_admin_feature_flag(
        config_key=config.users_key,
        config_value=visible_users,
        value_type="json",
        description=users_description,
        updated_by=updated_by,
    )
    return scope_item, users_item


__all__ = [
    "VisibilityPolicyConfig",
    "coerce_bool",
    "get_feature_enabled",
    "get_flag_value",
    "get_visibility_config",
    "is_user_allowed",
    "normalize_user_identifiers",
    "normalize_visibility_payload",
    "upsert_visibility_flags",
]
