from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.admin.access_control import resolve_user_permissions
from app.auth.auth_routes import get_current_user
from app.base_config import model_config
from app.storage.business_store import (
    delete_admin_feature_flag,
    delete_admin_model_config,
    delete_admin_user_permission,
    get_admin_feature_flag,
    get_admin_model_config,
    get_admin_user_permission,
    insert_admin_audit_log,
    list_admin_audit_logs,
    list_admin_feature_flags,
    list_admin_model_configs,
    list_admin_user_permissions,
    upsert_admin_feature_flag,
    upsert_admin_model_config,
    upsert_admin_user_permission,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_UPLOAD_TYPES = {"document", "image"}
ALLOWED_VISIBILITY_SCOPES = {"all", "whitelist", "hidden"}
ALLOWED_FLAG_VALUE_TYPES = {"string", "number", "boolean", "json"}


class AdminModelConfigPayload(BaseModel):
    model_id: str
    display_name: str
    provider_model_name: str
    sort_order: int = 1000
    enabled: bool = True
    supports_reasoning: bool = False
    supports_tool_calling: bool = False
    supports_native_image_input: bool = False
    reasoning_default_enabled: bool = False
    reasoning_parser_mode: str | None = None
    reasoning_parameter_format: str | None = None
    allowed_upload_types: list[str] = []
    visibility_scope: str = "all"
    visibility_users: list[str] = []
    metadata: dict[str, Any] = {}


class AdminUserPermissionPayload(BaseModel):
    user_key: str
    permission_code: str
    enabled: bool = True
    remark: str | None = None


class AdminFeatureFlagPayload(BaseModel):
    config_key: str
    config_value: Any
    value_type: str
    description: str | None = None


def ensure_admin_access(user: dict[str, object]) -> set[str]:
    permissions = resolve_user_permissions(user)
    if "admin.access" not in permissions:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access not enabled")
    return permissions


def ensure_admin_permission(
    user: dict[str, object],
    permission_code: str,
) -> set[str]:
    permissions = ensure_admin_access(user)
    if permission_code not in permissions:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"{permission_code} not enabled",
        )
    return permissions


def _audit_actor(user: dict[str, object]) -> tuple[str, str | None]:
    actor_key = str(user.get("sub") or user.get("email") or "")
    actor_email = user.get("email")
    return actor_key, str(actor_email) if isinstance(actor_email, str) else None


def _record_admin_audit(
    *,
    user: dict[str, object],
    action: str,
    resource_type: str,
    resource_key: str,
    before_state: Any = None,
    after_state: Any = None,
) -> None:
    actor_key, actor_email = _audit_actor(user)
    insert_admin_audit_log(
        actor_key=actor_key,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_key=resource_key,
        before_state=before_state,
        after_state=after_state,
    )


def _normalize_model_payload(payload: AdminModelConfigPayload) -> dict[str, Any]:
    model_id = payload.model_id.strip()
    display_name = payload.display_name.strip()
    provider_model_name = payload.provider_model_name.strip()
    if not model_id or not display_name or not provider_model_name:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "model_id, display_name and provider_model_name are required",
        )
    upload_types = []
    for item in payload.allowed_upload_types:
        normalized = item.strip().lower()
        if not normalized:
            continue
        if normalized not in ALLOWED_UPLOAD_TYPES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"invalid upload type: {normalized}",
            )
        if normalized not in upload_types:
            upload_types.append(normalized)
    visibility_scope = payload.visibility_scope.strip().lower() or "all"
    if visibility_scope not in ALLOWED_VISIBILITY_SCOPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"invalid visibility_scope: {visibility_scope}",
        )
    visibility_users = []
    for item in payload.visibility_users:
        normalized = item.strip()
        if normalized and normalized not in visibility_users:
            visibility_users.append(normalized)
    return {
        "model_id": model_id,
        "display_name": display_name,
        "provider_model_name": provider_model_name,
        "sort_order": payload.sort_order,
        "enabled": payload.enabled,
        "supports_reasoning": payload.supports_reasoning,
        "supports_tool_calling": payload.supports_tool_calling,
        "supports_native_image_input": payload.supports_native_image_input,
        "reasoning_default_enabled": payload.reasoning_default_enabled,
        "reasoning_parser_mode": (payload.reasoning_parser_mode or "").strip() or None,
        "reasoning_parameter_format": (payload.reasoning_parameter_format or "").strip() or None,
        "allowed_upload_types": upload_types,
        "visibility_scope": visibility_scope,
        "visibility_users": visibility_users,
        "metadata": payload.metadata or {},
    }


def _normalize_permission_payload(payload: AdminUserPermissionPayload) -> dict[str, Any]:
    user_key = payload.user_key.strip()
    permission_code = payload.permission_code.strip()
    if not user_key or not permission_code:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "user_key and permission_code are required",
        )
    return {
        "user_key": user_key,
        "permission_code": permission_code,
        "enabled": payload.enabled,
        "remark": (payload.remark or "").strip() or None,
    }


def _normalize_feature_flag_payload(payload: AdminFeatureFlagPayload) -> dict[str, Any]:
    config_key = payload.config_key.strip()
    value_type = payload.value_type.strip().lower()
    if not config_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "config_key is required")
    if value_type not in ALLOWED_FLAG_VALUE_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"invalid value_type: {value_type}",
        )
    return {
        "config_key": config_key,
        "config_value": payload.config_value,
        "value_type": value_type,
        "description": (payload.description or "").strip() or None,
    }


def _gpts_feature_enabled() -> bool:
    item = get_admin_feature_flag("gpts_feature_enabled")
    if item is None:
        return bool(model_config.GPTS_FEATURE_ENABLED)
    value = item.get("config_value")
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(model_config.GPTS_FEATURE_ENABLED)


@router.get("/permission")
async def admin_permission(user: dict = Depends(get_current_user)) -> dict[str, object]:
    permissions = resolve_user_permissions(user)
    return {
        "allowed": "admin.access" in permissions,
        "permissions": sorted(permissions),
    }


@router.get("/models")
async def admin_models(user: dict = Depends(get_current_user)) -> dict[str, object]:
    permissions = ensure_admin_access(user)
    return {
        "items": list_admin_model_configs(),
        "permissions": sorted(permissions),
    }


@router.get("/permissions")
async def admin_permissions(user: dict = Depends(get_current_user)) -> dict[str, object]:
    permissions = ensure_admin_access(user)
    return {
        "items": list_admin_user_permissions(),
        "permissions": sorted(permissions),
    }


@router.get("/feature-flags")
async def admin_feature_flags(user: dict = Depends(get_current_user)) -> dict[str, object]:
    permissions = ensure_admin_access(user)
    return {
        "items": list_admin_feature_flags(),
        "permissions": sorted(permissions),
    }


@router.get("/audit-logs")
async def admin_audit_logs(
    limit: int = 50,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_access(user)
    return {
        "items": list_admin_audit_logs(limit),
        "permissions": sorted(permissions),
    }


@router.get("/gpts-overview")
async def admin_gpts_overview(user: dict = Depends(get_current_user)) -> dict[str, object]:
    permissions = ensure_admin_access(user)
    feature_enabled = _gpts_feature_enabled()
    whitelist_users = sorted(
        str(item).strip() for item in model_config.GPTS_WHITE_LIST if str(item).strip()
    )
    permission_items = list_admin_user_permissions()
    explicit_manage_users = sorted(
        {
            str(item.get("user_key") or "").strip()
            for item in permission_items
            if item.get("enabled")
            and item.get("permission_code") == "gpts.manage"
            and str(item.get("user_key") or "").strip()
        }
    )
    fallback_manage_users = [item for item in whitelist_users if item not in explicit_manage_users]
    visible_scope = "all" if not whitelist_users else "whitelist"
    current_permissions = resolve_user_permissions(user)
    current_user_allowed = feature_enabled and (
        not whitelist_users or user.get("email") in whitelist_users or user.get("sub") in whitelist_users
    )
    return {
        "feature_enabled": feature_enabled,
        "visible_scope": visible_scope,
        "whitelist_users": whitelist_users,
        "explicit_manage_users": explicit_manage_users,
        "fallback_manage_users": fallback_manage_users,
        "effective_manage_users": sorted(set(explicit_manage_users) | set(fallback_manage_users)),
        "current_user_allowed": current_user_allowed,
        "current_user_manage_allowed": "gpts.manage" in current_permissions,
        "compat_note": "GPTS_WHITE_LIST users receive fallback admin.access and gpts.manage permissions.",
        "permissions": sorted(permissions),
    }


@router.post("/models")
async def create_admin_model(
    payload: AdminModelConfigPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "models.manage")
    item = upsert_admin_model_config(**_normalize_model_payload(payload))
    _record_admin_audit(
        user=user,
        action="create",
        resource_type="model",
        resource_key=item["model_id"],
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.put("/models/{model_id}")
async def update_admin_model(
    model_id: str,
    payload: AdminModelConfigPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "models.manage")
    normalized = _normalize_model_payload(payload)
    if normalized["model_id"] != model_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "model_id path/body mismatch")
    before_state = get_admin_model_config(model_id)
    item = upsert_admin_model_config(**normalized)
    _record_admin_audit(
        user=user,
        action="update",
        resource_type="model",
        resource_key=item["model_id"],
        before_state=before_state,
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.delete("/models/{model_id}")
async def remove_admin_model(
    model_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "models.manage")
    existing = get_admin_model_config(model_id)
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "model config not found")
    delete_admin_model_config(model_id)
    _record_admin_audit(
        user=user,
        action="delete",
        resource_type="model",
        resource_key=model_id,
        before_state=existing,
    )
    return {
        "deleted": True,
        "model_id": model_id,
        "permissions": sorted(permissions),
    }


@router.post("/permissions")
async def create_admin_permission(
    payload: AdminUserPermissionPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "permissions.manage")
    item = upsert_admin_user_permission(**_normalize_permission_payload(payload))
    _record_admin_audit(
        user=user,
        action="create",
        resource_type="permission",
        resource_key=f"{item['user_key']}::{item['permission_code']}",
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.put("/permissions")
async def update_admin_permission(
    payload: AdminUserPermissionPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "permissions.manage")
    normalized = _normalize_permission_payload(payload)
    before_state = get_admin_user_permission(
        normalized["user_key"], normalized["permission_code"]
    )
    item = upsert_admin_user_permission(**normalized)
    _record_admin_audit(
        user=user,
        action="update",
        resource_type="permission",
        resource_key=f"{item['user_key']}::{item['permission_code']}",
        before_state=before_state,
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.delete("/permissions")
async def remove_admin_permission(
    user_key: str,
    permission_code: str,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "permissions.manage")
    existing = get_admin_user_permission(user_key, permission_code)
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "permission config not found")
    delete_admin_user_permission(user_key, permission_code)
    _record_admin_audit(
        user=user,
        action="delete",
        resource_type="permission",
        resource_key=f"{user_key}::{permission_code}",
        before_state=existing,
    )
    return {
        "deleted": True,
        "user_key": user_key,
        "permission_code": permission_code,
        "permissions": sorted(permissions),
    }


@router.post("/feature-flags")
async def create_admin_feature_flag(
    payload: AdminFeatureFlagPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "feature_flags.manage")
    normalized = _normalize_feature_flag_payload(payload)
    updated_by = user.get("email") or user.get("sub")
    item = upsert_admin_feature_flag(**normalized, updated_by=str(updated_by or ""))
    _record_admin_audit(
        user=user,
        action="create",
        resource_type="feature_flag",
        resource_key=item["config_key"],
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.put("/feature-flags/{config_key}")
async def update_admin_feature_flag(
    config_key: str,
    payload: AdminFeatureFlagPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "feature_flags.manage")
    normalized = _normalize_feature_flag_payload(payload)
    if normalized["config_key"] != config_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "config_key path/body mismatch")
    updated_by = user.get("email") or user.get("sub")
    before_state = get_admin_feature_flag(config_key)
    item = upsert_admin_feature_flag(**normalized, updated_by=str(updated_by or ""))
    _record_admin_audit(
        user=user,
        action="update",
        resource_type="feature_flag",
        resource_key=item["config_key"],
        before_state=before_state,
        after_state=item,
    )
    return {"item": item, "permissions": sorted(permissions)}


@router.delete("/feature-flags/{config_key}")
async def remove_admin_feature_flag(
    config_key: str,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    permissions = ensure_admin_permission(user, "feature_flags.manage")
    existing = get_admin_feature_flag(config_key)
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "feature flag not found")
    delete_admin_feature_flag(config_key)
    _record_admin_audit(
        user=user,
        action="delete",
        resource_type="feature_flag",
        resource_key=config_key,
        before_state=existing,
    )
    return {
        "deleted": True,
        "config_key": config_key,
        "permissions": sorted(permissions),
    }


__all__ = ["router", "ensure_admin_access", "resolve_user_permissions"]
