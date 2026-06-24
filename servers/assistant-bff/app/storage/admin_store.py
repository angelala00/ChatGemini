from __future__ import annotations

import importlib
from typing import Any


class _LazyCore:
    def __getattr__(self, name: str):
        module = importlib.import_module("app.storage.business_store")
        return getattr(module, name)


_core = _LazyCore()


def list_admin_model_configs() -> list[dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        rows = conn.execute(
            """
            SELECT id, model_id, display_name, provider_model_name, sort_order,
                   enabled, supports_reasoning, supports_tool_calling,
                   supports_native_image_input, reasoning_default_enabled,
                   reasoning_parser_mode, reasoning_parameter_format,
                   allowed_upload_types, visibility_scope, visibility_users,
                   metadata, created_at, updated_at
              FROM admin_model_configs
             ORDER BY sort_order ASC, id ASC
            """
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _core._normalize_row(row)
        items.append(
            {
                "id": item.get("id"),
                "model_id": item.get("model_id"),
                "display_name": item.get("display_name"),
                "provider_model_name": item.get("provider_model_name"),
                "sort_order": int(item.get("sort_order") or 1000),
                "enabled": _core._coerce_bool(item.get("enabled")),
                "supports_reasoning": _core._coerce_bool(item.get("supports_reasoning")),
                "supports_tool_calling": _core._coerce_bool(item.get("supports_tool_calling")),
                "supports_native_image_input": _core._coerce_bool(item.get("supports_native_image_input")),
                "reasoning_default_enabled": _core._coerce_bool(item.get("reasoning_default_enabled")),
                "reasoning_parser_mode": item.get("reasoning_parser_mode"),
                "reasoning_parameter_format": item.get("reasoning_parameter_format"),
                "allowed_upload_types": _core._load_json_field(item.get("allowed_upload_types"), fallback=[]),
                "visibility_scope": item.get("visibility_scope") or "all",
                "visibility_users": _core._load_json_field(item.get("visibility_users"), fallback=[]),
                "metadata": _core._load_json_field(item.get("metadata"), fallback={}),
                "created_at": str(item.get("created_at") or ""),
                "updated_at": str(item.get("updated_at") or ""),
            }
        )
    return items


def get_admin_model_config(model_id: str) -> dict[str, Any] | None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            row = conn.execute(
                """
                SELECT id, model_id, display_name, provider_model_name, sort_order,
                       enabled, supports_reasoning, supports_tool_calling,
                       supports_native_image_input, reasoning_default_enabled,
                       reasoning_parser_mode, reasoning_parameter_format,
                       allowed_upload_types, visibility_scope, visibility_users,
                       metadata, created_at, updated_at
                  FROM admin_model_configs
                 WHERE model_id=%s
                """,
                (model_id,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id, model_id, display_name, provider_model_name, sort_order,
                       enabled, supports_reasoning, supports_tool_calling,
                       supports_native_image_input, reasoning_default_enabled,
                       reasoning_parser_mode, reasoning_parameter_format,
                       allowed_upload_types, visibility_scope, visibility_users,
                       metadata, created_at, updated_at
                  FROM admin_model_configs
                 WHERE model_id=?
                """,
                (model_id,),
            ).fetchone()
    if not row:
        return None
    item = _core._normalize_row(row)
    return {
        "id": item.get("id"),
        "model_id": item.get("model_id"),
        "display_name": item.get("display_name"),
        "provider_model_name": item.get("provider_model_name"),
        "sort_order": int(item.get("sort_order") or 1000),
        "enabled": _core._coerce_bool(item.get("enabled")),
        "supports_reasoning": _core._coerce_bool(item.get("supports_reasoning")),
        "supports_tool_calling": _core._coerce_bool(item.get("supports_tool_calling")),
        "supports_native_image_input": _core._coerce_bool(item.get("supports_native_image_input")),
        "reasoning_default_enabled": _core._coerce_bool(item.get("reasoning_default_enabled")),
        "reasoning_parser_mode": item.get("reasoning_parser_mode"),
        "reasoning_parameter_format": item.get("reasoning_parameter_format"),
        "allowed_upload_types": _core._load_json_field(item.get("allowed_upload_types"), fallback=[]),
        "visibility_scope": item.get("visibility_scope") or "all",
        "visibility_users": _core._load_json_field(item.get("visibility_users"), fallback=[]),
        "metadata": _core._load_json_field(item.get("metadata"), fallback={}),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
    }


def upsert_admin_model_config(
    *,
    model_id: str,
    display_name: str,
    provider_model_name: str,
    sort_order: int = 1000,
    enabled: bool = True,
    supports_reasoning: bool = False,
    supports_tool_calling: bool = False,
    supports_native_image_input: bool = False,
    reasoning_default_enabled: bool = False,
    reasoning_parser_mode: str | None = None,
    reasoning_parameter_format: str | None = None,
    allowed_upload_types: list[str] | None = None,
    visibility_scope: str = "all",
    visibility_users: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _core.ensure_initialized()
    now = _core._now_iso()
    payload = (
        model_id,
        display_name,
        provider_model_name,
        int(sort_order),
        bool(enabled),
        bool(supports_reasoning),
        bool(supports_tool_calling),
        bool(supports_native_image_input),
        bool(reasoning_default_enabled),
        reasoning_parser_mode,
        reasoning_parameter_format,
        _core._dump_json_field(allowed_upload_types, fallback=[]),
        visibility_scope or "all",
        _core._dump_json_field(visibility_users, fallback=[]),
        _core._dump_json_field(metadata, fallback={}),
        now,
        now,
    )
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO admin_model_configs(
                    model_id, display_name, provider_model_name, sort_order, enabled,
                    supports_reasoning, supports_tool_calling, supports_native_image_input,
                    reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                    allowed_upload_types, visibility_scope, visibility_users, metadata,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (model_id) DO UPDATE SET
                    display_name=EXCLUDED.display_name,
                    provider_model_name=EXCLUDED.provider_model_name,
                    sort_order=EXCLUDED.sort_order,
                    enabled=EXCLUDED.enabled,
                    supports_reasoning=EXCLUDED.supports_reasoning,
                    supports_tool_calling=EXCLUDED.supports_tool_calling,
                    supports_native_image_input=EXCLUDED.supports_native_image_input,
                    reasoning_default_enabled=EXCLUDED.reasoning_default_enabled,
                    reasoning_parser_mode=EXCLUDED.reasoning_parser_mode,
                    reasoning_parameter_format=EXCLUDED.reasoning_parameter_format,
                    allowed_upload_types=EXCLUDED.allowed_upload_types,
                    visibility_scope=EXCLUDED.visibility_scope,
                    visibility_users=EXCLUDED.visibility_users,
                    metadata=EXCLUDED.metadata,
                    updated_at=EXCLUDED.updated_at
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_model_configs(
                    model_id, display_name, provider_model_name, sort_order, enabled,
                    supports_reasoning, supports_tool_calling, supports_native_image_input,
                    reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                    allowed_upload_types, visibility_scope, visibility_users, metadata,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    display_name=excluded.display_name,
                    provider_model_name=excluded.provider_model_name,
                    sort_order=excluded.sort_order,
                    enabled=excluded.enabled,
                    supports_reasoning=excluded.supports_reasoning,
                    supports_tool_calling=excluded.supports_tool_calling,
                    supports_native_image_input=excluded.supports_native_image_input,
                    reasoning_default_enabled=excluded.reasoning_default_enabled,
                    reasoning_parser_mode=excluded.reasoning_parser_mode,
                    reasoning_parameter_format=excluded.reasoning_parameter_format,
                    allowed_upload_types=excluded.allowed_upload_types,
                    visibility_scope=excluded.visibility_scope,
                    visibility_users=excluded.visibility_users,
                    metadata=excluded.metadata,
                    updated_at=excluded.updated_at
                """,
                payload,
            )
        conn.commit()
    item = get_admin_model_config(model_id)
    if item is None:
        raise RuntimeError(f"failed to persist admin model config: {model_id}")
    return item


def delete_admin_model_config(model_id: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute("DELETE FROM admin_model_configs WHERE model_id=%s", (model_id,))
        else:
            conn.execute("DELETE FROM admin_model_configs WHERE model_id=?", (model_id,))
        conn.commit()


def list_admin_user_permissions() -> list[dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        rows = conn.execute(
            """
            SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
              FROM admin_user_permissions
             ORDER BY user_key ASC, permission_code ASC, id ASC
            """
        ).fetchall()
    return [
        {
            "id": item.get("id"),
            "user_key": item.get("user_key"),
            "permission_code": item.get("permission_code"),
            "enabled": _core._coerce_bool(item.get("enabled")),
            "remark": item.get("remark"),
            "created_at": str(item.get("created_at") or ""),
            "updated_at": str(item.get("updated_at") or ""),
        }
        for item in (_core._normalize_row(row) for row in rows)
    ]


def get_admin_user_permission(user_key: str, permission_code: str) -> dict[str, Any] | None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            row = conn.execute(
                """
                SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
                  FROM admin_user_permissions
                 WHERE user_key=%s AND permission_code=%s
                """,
                (user_key, permission_code),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
                  FROM admin_user_permissions
                 WHERE user_key=? AND permission_code=?
                """,
                (user_key, permission_code),
            ).fetchone()
    if not row:
        return None
    item = _core._normalize_row(row)
    return {
        "id": item.get("id"),
        "user_key": item.get("user_key"),
        "permission_code": item.get("permission_code"),
        "enabled": _core._coerce_bool(item.get("enabled")),
        "remark": item.get("remark"),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
    }


def upsert_admin_user_permission(
    *,
    user_key: str,
    permission_code: str,
    enabled: bool = True,
    remark: str | None = None,
) -> dict[str, Any]:
    _core.ensure_initialized()
    now = _core._now_iso()
    payload = (
        user_key,
        permission_code,
        bool(enabled),
        remark,
        now,
        now,
    )
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO admin_user_permissions(
                    user_key, permission_code, enabled, remark, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_key, permission_code) DO UPDATE SET
                    enabled=EXCLUDED.enabled,
                    remark=EXCLUDED.remark,
                    updated_at=EXCLUDED.updated_at
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_user_permissions(
                    user_key, permission_code, enabled, remark, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_key, permission_code) DO UPDATE SET
                    enabled=excluded.enabled,
                    remark=excluded.remark,
                    updated_at=excluded.updated_at
                """,
                payload,
            )
        conn.commit()
    item = get_admin_user_permission(user_key, permission_code)
    if item is None:
        raise RuntimeError(
            f"failed to persist admin user permission: {user_key}::{permission_code}"
        )
    return item


def delete_admin_user_permission(user_key: str, permission_code: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                "DELETE FROM admin_user_permissions WHERE user_key=%s AND permission_code=%s",
                (user_key, permission_code),
            )
        else:
            conn.execute(
                "DELETE FROM admin_user_permissions WHERE user_key=? AND permission_code=?",
                (user_key, permission_code),
            )
        conn.commit()


def list_admin_feature_flags() -> list[dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        rows = conn.execute(
            """
            SELECT config_key, config_value, value_type, description, updated_at, updated_by
              FROM admin_feature_flags
             ORDER BY config_key ASC
            """
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _core._normalize_row(row)
        items.append(
            {
                "config_key": item.get("config_key"),
                "config_value": _core._load_json_field(item.get("config_value"), fallback=item.get("config_value")),
                "value_type": item.get("value_type"),
                "description": item.get("description"),
                "updated_at": str(item.get("updated_at") or ""),
                "updated_by": item.get("updated_by"),
            }
        )
    return items


def get_admin_feature_flag(config_key: str) -> dict[str, Any] | None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            row = conn.execute(
                """
                SELECT config_key, config_value, value_type, description, updated_at, updated_by
                  FROM admin_feature_flags
                 WHERE config_key=%s
                """,
                (config_key,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT config_key, config_value, value_type, description, updated_at, updated_by
                  FROM admin_feature_flags
                 WHERE config_key=?
                """,
                (config_key,),
            ).fetchone()
    if not row:
        return None
    item = _core._normalize_row(row)
    return {
        "config_key": item.get("config_key"),
        "config_value": _core._load_json_field(item.get("config_value"), fallback=item.get("config_value")),
        "value_type": item.get("value_type"),
        "description": item.get("description"),
        "updated_at": str(item.get("updated_at") or ""),
        "updated_by": item.get("updated_by"),
    }


def upsert_admin_feature_flag(
    *,
    config_key: str,
    config_value: Any,
    value_type: str,
    description: str | None = None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    _core.ensure_initialized()
    now = _core._now_iso()
    payload = (
        config_key,
        _core._dump_json_field(config_value, fallback=None),
        value_type,
        description,
        now,
        updated_by,
    )
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO admin_feature_flags(
                    config_key, config_value, value_type, description, updated_at, updated_by
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (config_key) DO UPDATE SET
                    config_value=EXCLUDED.config_value,
                    value_type=EXCLUDED.value_type,
                    description=EXCLUDED.description,
                    updated_at=EXCLUDED.updated_at,
                    updated_by=EXCLUDED.updated_by
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_feature_flags(
                    config_key, config_value, value_type, description, updated_at, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(config_key) DO UPDATE SET
                    config_value=excluded.config_value,
                    value_type=excluded.value_type,
                    description=excluded.description,
                    updated_at=excluded.updated_at,
                    updated_by=excluded.updated_by
                """,
                payload,
            )
        conn.commit()
    item = get_admin_feature_flag(config_key)
    if item is None:
        raise RuntimeError(f"failed to persist admin feature flag: {config_key}")
    return item


def delete_admin_feature_flag(config_key: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute("DELETE FROM admin_feature_flags WHERE config_key=%s", (config_key,))
        else:
            conn.execute("DELETE FROM admin_feature_flags WHERE config_key=?", (config_key,))
        conn.commit()


def insert_admin_audit_log(
    *,
    actor_key: str,
    actor_email: str | None,
    action: str,
    resource_type: str,
    resource_key: str,
    before_state: Any = None,
    after_state: Any = None,
) -> dict[str, Any]:
    _core.ensure_initialized()
    created_at = _core._now_iso()
    payload = (
        actor_key,
        actor_email,
        action,
        resource_type,
        resource_key,
        _core._dump_json_field(before_state, fallback=None) if before_state is not None else None,
        _core._dump_json_field(after_state, fallback=None) if after_state is not None else None,
        created_at,
    )
    with _core._connect() as conn:
        if _core._use_postgres():
            row = conn.execute(
                """
                INSERT INTO admin_audit_logs(
                    actor_key, actor_email, action, resource_type, resource_key,
                    before_state, after_state, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, actor_key, actor_email, action, resource_type, resource_key,
                          before_state, after_state, created_at
                """,
                payload,
            ).fetchone()
        else:
            cursor = conn.execute(
                """
                INSERT INTO admin_audit_logs(
                    actor_key, actor_email, action, resource_type, resource_key,
                    before_state, after_state, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
            row = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 WHERE id=?
                """,
                (cursor.lastrowid,),
            ).fetchone()
        conn.commit()
    item = _core._normalize_row(row)
    return {
        "id": item.get("id"),
        "actor_key": item.get("actor_key"),
        "actor_email": item.get("actor_email"),
        "action": item.get("action"),
        "resource_type": item.get("resource_type"),
        "resource_key": item.get("resource_key"),
        "before_state": _core._load_json_field(item.get("before_state"), fallback=None),
        "after_state": _core._load_json_field(item.get("after_state"), fallback=None),
        "created_at": str(item.get("created_at") or ""),
    }


def list_admin_audit_logs(limit: int = 50) -> list[dict[str, Any]]:
    _core.ensure_initialized()
    safe_limit = max(1, min(int(limit or 50), 200))
    with _core._connect() as conn:
        if _core._use_postgres():
            rows = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 ORDER BY created_at DESC, id DESC
                 LIMIT %s
                """,
                (safe_limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _core._normalize_row(row)
        items.append(
            {
                "id": item.get("id"),
                "actor_key": item.get("actor_key"),
                "actor_email": item.get("actor_email"),
                "action": item.get("action"),
                "resource_type": item.get("resource_type"),
                "resource_key": item.get("resource_key"),
                "before_state": _core._load_json_field(item.get("before_state"), fallback=None),
                "after_state": _core._load_json_field(item.get("after_state"), fallback=None),
                "created_at": str(item.get("created_at") or ""),
            }
        )
    return items


def list_enabled_permissions_for_user(user_keys: list[str]) -> set[str]:
    _core.ensure_initialized()
    normalized_keys = [key for key in user_keys if key]
    if not normalized_keys:
        return set()
    placeholders = ",".join(["%s"] * len(normalized_keys)) if _core._use_postgres() else ",".join(["?"] * len(normalized_keys))
    sql = f"""
        SELECT permission_code
          FROM admin_user_permissions
         WHERE enabled = {'TRUE' if _core._use_postgres() else '1'}
           AND user_key IN ({placeholders})
    """
    with _core._connect() as conn:
        rows = conn.execute(sql, tuple(normalized_keys)).fetchall()
    return {str(_core._normalize_row(row).get("permission_code") or "") for row in rows}
