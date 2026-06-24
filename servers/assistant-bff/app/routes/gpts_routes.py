import time
import uuid
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.agent_runtime_v3 import (
    DEFAULT_AGENT_CAPABILITY_IDS,
    AgentDefinition,
    list_agent_capabilities,
)
from app.admin.access_control import (
    is_gpts_feature_visible_to_user,
    resolve_user_permissions,
    user_keys,
)
from app.auth.auth_routes import GLOBAL_AUTH_PROVIDER, get_current_auth_provider, get_current_user
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, fetch_gpts, refresh_gpts, BUILTIN_GIDS, builtin_gpts
from app.gpts.model_metadata import resolve_model_configs
from app.base_config import model_config
from app.storage.business_store import (
    delete_custom_gpt,
    delete_user_gpt_state_by_gid,
    insert_custom_gpt,
    list_admin_model_configs,
    list_user_gpt_pin_states,
    list_user_pinned_rows,
    set_user_gpt_pin,
    update_custom_gpt,
    list_file_mappings,
    get_file_mapping,
)
from app.storage.file_lifecycle import delete_file_reference

router = APIRouter(prefix="/api", tags=["gpts"])

MAX_SAMPLES = 5
MAX_MODEL_ID_CHARS = 200
GPT_PROVIDER_SCOPE_PROVIDER = "provider"
GPT_PROVIDER_SCOPE_GLOBAL = "global"
REGULATION_GPT_ID = "regulationassistant"
GPTASSISTANT_GPT_ID = "gptassistant"
AGENT_RUNTIME_V3_HANDLER_KEY = "agent_runtime_v3"
ALLOWED_AGENT_UPLOAD_TYPES = {"document", "image"}
AGENT_RUNTIME_V3_CONFIG_FIELDS = {
    "enabled_capabilities",
    "runtime_limits",
    "context_policy",
}

GPTS_WHITE_LIST = model_config.GPTS_WHITE_LIST


def _validate_agent_runtime_v3_config(gid: str, config: dict) -> None:
    if not AGENT_RUNTIME_V3_CONFIG_FIELDS.intersection(config):
        return
    try:
        definition = AgentDefinition.from_config(gid, config)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    available_ids = {item["id"] for item in list_agent_capabilities()}
    unknown_ids = sorted(set(definition.enabled_capability_ids).difference(available_ids))
    if unknown_ids:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"unknown enabled_capabilities: {', '.join(unknown_ids)}",
        )


def _apply_new_agent_runtime_defaults(config: dict) -> None:
    config["assistant_kind"] = "custom"
    config["handler_key"] = AGENT_RUNTIME_V3_HANDLER_KEY
    config.setdefault("enabled_capabilities", list(DEFAULT_AGENT_CAPABILITY_IDS))
    config.setdefault(
        "runtime_limits",
        {"max_steps": 4, "max_capability_calls": 8},
    )
    config.setdefault(
        "context_policy",
        {
            "include_history": True,
            "include_history_summary": True,
            "allow_attachments": True,
            "allow_knowledge": True,
            "max_history_messages": 20,
        },
    )


def is_gpts_feature_allowed(user: dict) -> bool:
    return is_gpts_feature_visible_to_user(user)


def ensure_gpts_feature_allowed(user: dict) -> None:
    if not is_gpts_feature_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GPTS feature not enabled")


def is_gpts_manage_allowed(user: dict) -> bool:
    return "gpts.manage" in resolve_user_permissions(user)


def ensure_gpts_manage_allowed(user: dict) -> None:
    if not is_gpts_feature_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GPTS feature not enabled")
    if not is_gpts_manage_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GPTS management not enabled")


def _normalize_provider_scope(value: object) -> str:
    scope = str(value or "").strip().lower()
    if scope in {GPT_PROVIDER_SCOPE_PROVIDER, GPT_PROVIDER_SCOPE_GLOBAL}:
        return scope
    return GPT_PROVIDER_SCOPE_GLOBAL


def _get_gpt_provider_scope(gpt_dict: dict) -> str:
    return _normalize_provider_scope(gpt_dict.get("provider_scope"))


def _get_gpt_auth_provider(gpt_dict: dict) -> str:
    value = str(gpt_dict.get("auth_provider") or "").strip()
    return value or GLOBAL_AUTH_PROVIDER


def is_regulation_gpt(gid: str) -> bool:
    return gid == REGULATION_GPT_ID


def is_main_gpt(gid: str) -> bool:
    return gid == GPTASSISTANT_GPT_ID


def is_manageable_system_gpt(gid: str, gpt_dict: dict | None = None) -> bool:
    if is_regulation_gpt(gid) or is_main_gpt(gid):
        return True
    return bool(gpt_dict and str(gpt_dict.get("assistant_kind") or "").strip() == "system")


def can_manage_regulation_gpt(user: dict) -> bool:
    return bool(set(user_keys(user)) & model_config.GPTS_WHITE_LIST)


def can_manage_main_gpt(user: dict) -> bool:
    return bool(set(user_keys(user)) & model_config.GPTS_WHITE_LIST)


def _normalize_identity_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized and normalized not in items:
                items.append(normalized)
    return items


def _gpt_owner(gpt_dict: dict) -> str:
    return str(gpt_dict.get("owner") or "").strip()


def _gpt_admins(gpt_dict: dict) -> list[str]:
    return _normalize_identity_list(gpt_dict.get("admins"))


def _gpt_viewers(gpt_dict: dict) -> list[str]:
    return _normalize_identity_list(gpt_dict.get("viewers"))


def _default_manageable_system_owner(gid: str) -> str:
    if not is_manageable_system_gpt(gid):
        return ""
    seeded_keys = sorted(item for item in model_config.GPTS_WHITE_LIST if str(item).strip())
    return seeded_keys[0] if seeded_keys else ""


def _effective_gpt_owner(gid: str, gpt_dict: dict) -> str:
    return _gpt_owner(gpt_dict) or _default_manageable_system_owner(gid)


def _user_key_set(user: dict) -> set[str]:
    return {item for item in user_keys(user) if item}


def _gpt_can_view(user: dict, gpt_dict: dict) -> bool:
    keys = _user_key_set(user)
    if not keys:
        return False
    owner = _gpt_owner(gpt_dict)
    if owner and owner in keys:
        return True
    if keys & set(_gpt_admins(gpt_dict)):
        return True
    if keys & set(_gpt_viewers(gpt_dict)):
        return True
    return False


def _gpt_can_manage(user: dict, gpt_dict: dict) -> bool:
    keys = _user_key_set(user)
    if not keys:
        return False
    owner = _gpt_owner(gpt_dict)
    if owner and owner in keys:
        return True
    return bool(keys & set(_gpt_admins(gpt_dict)))


def _is_owner_identity(user: dict, owner: object) -> bool:
    normalized_owner = str(owner or "").strip()
    if not normalized_owner:
        return False
    return normalized_owner in _user_key_set(user)


def _normalize_acl_state(
    owner: object,
    admins: object,
    viewers: object,
) -> tuple[str, list[str], list[str]]:
    normalized_owner = str(owner or "").strip()
    normalized_admins = _normalize_identity_list(admins)
    normalized_viewers = _normalize_identity_list(viewers)

    if normalized_owner:
        normalized_admins = [item for item in normalized_admins if item != normalized_owner]
        normalized_viewers = [
            item
            for item in normalized_viewers
            if item != normalized_owner and item not in normalized_admins
        ]
    else:
        normalized_viewers = [item for item in normalized_viewers if item not in normalized_admins]

    return normalized_owner, normalized_admins, normalized_viewers


def is_gpt_visible_to_provider(gpt_dict: dict, current_provider: str) -> bool:
    if _get_gpt_provider_scope(gpt_dict) == GPT_PROVIDER_SCOPE_PROVIDER:
        return _get_gpt_auth_provider(gpt_dict) == current_provider
    return True


def ensure_owned_custom_gpt(gid: str, user: dict) -> dict:
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
    current_provider = get_current_auth_provider(user)
    gpt_item = gpts[gid]
    if is_manageable_system_gpt(gid, gpt_item):
        if (
            not (
                _gpt_can_manage(user, gpt_item)
                or can_manage_regulation_gpt(user)
                or can_manage_main_gpt(user)
            )
            or not is_gpt_visible_to_provider(gpt_item, current_provider)
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
        return gpt_item
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
    if not _gpt_can_manage(user, gpt_item) or not is_gpt_visible_to_provider(gpt_item, current_provider):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
    return gpt_item


def delete_assistant_knowledge_files(gid: str) -> None:
    for file_id, entry in list_file_mappings(gid).items():
        if entry.get("purpose") != "assistant_knowledge":
            continue
        delete_file_reference(file_id, entry)


def _is_effectively_pinned(gid: str, pin_state: dict[str, dict] | None) -> bool:
    if not pin_state:
        return True
    state = pin_state.get(gid)
    if state is None:
        return True
    return bool(state.get("is_pinned"))


def can_access_gpt(user: dict, gid: str) -> bool:
    if gid == GPTASSISTANT_GPT_ID:
        return True
    user_id = user.get("sub") or user.get("email") or ""
    if not user_id:
        return False
    current_provider = get_current_auth_provider(user)
    refresh_gpts()
    gpt_item = gpts.get(gid)
    if gpt_item and auth_ok(
        gpt_item,
        user.get("email") or "",
        user_id,
        current_provider=current_provider,
    ):
        return True
    return False


def get_sidebar_gpts(user: dict) -> list[dict]:
    """Return the left-rail agent entries for the current user.

    Sidebar semantics:
    - users with the GPTS entry see visible agents unless they explicitly unpinned them;
    - users without that entry see every agent currently visible to them.
    """
    refresh_gpts()
    user_email = user.get("email") or ""
    user_id = user.get("sub") or user.get("email") or ""
    current_provider = get_current_auth_provider(user)
    pin_state_map = list_user_gpt_pin_states(user_id) if user_id else {}
    if is_gpts_feature_allowed(user):
        explicit_pinned_rows = list_user_pinned_rows(user_id) if user_id else []
        explicit_pinned_order = {
            str(row.get("gpts_id") or ""): index
            for index, row in enumerate(explicit_pinned_rows)
        }
        pinned: list[dict] = []
        fallback_order = 0
        for gid, value in fetch_gpts().items():
            if gid == "gptassistant":
                continue
            if not auth_ok(
                value,
                user_email,
                user_id,
                current_provider=current_provider,
            ):
                continue
            if not _is_effectively_pinned(gid, pin_state_map):
                continue

            item = {
                "gid": gid,
                "name": value.get("name") or value.get("title") or gid,
                "is_pinned": True,
                "_explicit_order": explicit_pinned_order.get(gid),
                "_fallback_order": fallback_order,
            }
            if "logo" in value:
                item["logo"] = value["logo"]
            pinned.append(item)
            fallback_order += 1

        pinned.sort(
            key=lambda item: (
                0 if item["_explicit_order"] is not None else 1,
                item["_explicit_order"] if item["_explicit_order"] is not None else item["_fallback_order"],
                str(item.get("name") or "").lower(),
                str(item.get("gid") or ""),
            )
        )
        for item in pinned:
            item.pop("_explicit_order", None)
            item.pop("_fallback_order", None)
        return pinned

    visible_items: list[dict] = []

    for gid, value in fetch_gpts().items():
        if gid == "gptassistant":
            continue
        if not auth_ok(
            value,
            user_email,
            user_id,
            current_provider=current_provider,
        ):
            continue

        visible_items.append(
            {
                "gid": gid,
                **{k: v for k, v in value.items() if k not in {"system_prompt", "model_name", "auth"}},
                "is_pinned": True,
            }
        )

    return visible_items


def apply_runtime_model_visibility(
    _gid: str,
    models: list[dict],
    assistant_config: dict | None = None,
) -> list[dict]:
    config = assistant_config or {}
    raw_visible_model_ids = config.get("visible_model_ids")
    if not isinstance(raw_visible_model_ids, list):
        return models
    visible_model_ids = {
        str(item).strip()
        for item in raw_visible_model_ids
        if isinstance(item, str) and item.strip()
    }
    if not visible_model_ids:
        return models
    filtered = [
        item
        for item in models
        if isinstance(item, dict) and str(item.get("id") or "").strip() in visible_model_ids
    ]
    return filtered


def apply_admin_model_config_overrides(
    _gid: str,
    models: list[dict],
    *,
    include_missing: bool = True,
) -> list[dict]:
    admin_configs = [
        item
        for item in list_admin_model_configs()
        if isinstance(item, dict) and isinstance(item.get("model_id"), str)
    ]
    config_map = {item["model_id"]: item for item in admin_configs}
    if not config_map:
        return models

    def merge_admin_config(model: dict, admin_config: dict) -> dict:
        model_id = admin_config["model_id"]
        merged = dict(model)
        merged["id"] = model_id
        merged["name"] = admin_config.get("display_name") or merged.get("name") or model_id
        merged["model_name"] = (
            admin_config.get("provider_model_name")
            or merged.get("model_name")
            or model_id
        )
        merged["supports_reasoning"] = bool(admin_config.get("supports_reasoning"))
        merged["supports_tool_calling"] = bool(admin_config.get("supports_tool_calling"))
        merged["supports_native_image_input"] = bool(
            admin_config.get("supports_native_image_input")
        )
        merged["reasoning_default_enabled"] = bool(
            admin_config.get("reasoning_default_enabled")
        )
        if admin_config.get("reasoning_parser_mode"):
            merged["reasoning_parser_mode"] = admin_config["reasoning_parser_mode"]
        reasoning_parameter_format = admin_config.get("reasoning_parameter_format")
        if reasoning_parameter_format:
            compat = dict(merged.get("compat") or {})
            compat["reasoning_parameter_format"] = reasoning_parameter_format
            merged["compat"] = compat
        metadata = admin_config.get("metadata")
        if (
            isinstance(metadata, dict)
            and isinstance(metadata.get("description"), str)
            and metadata["description"].strip()
        ):
            merged["description"] = metadata["description"].strip()
        visibility_scope = admin_config.get("visibility_scope")
        visibility_users = admin_config.get("visibility_users")
        if visibility_scope == "whitelist" and isinstance(visibility_users, list):
            merged["auth"] = {"type": "white", "user": visibility_users}
        elif visibility_scope == "hidden":
            merged["auth"] = {"type": "white", "user": []}
        elif visibility_scope == "all":
            merged["auth"] = {"type": "all"}
        return merged

    overridden: list[dict] = []
    existing_model_ids: set[str] = set()
    for model in models:
        if not isinstance(model, dict):
            overridden.append(model)
            continue

        model_id = str(model.get("id") or "").strip()
        existing_model_ids.add(model_id)
        admin_config = config_map.get(model_id)
        if not admin_config:
            continue
        if admin_config.get("enabled"):
            overridden.append(merge_admin_config(model, admin_config))

    if include_missing:
        for admin_config in admin_configs:
            model_id = admin_config["model_id"]
            if model_id in existing_model_ids or not admin_config.get("enabled"):
                continue
            overridden.append(merge_admin_config({}, admin_config))

    overridden.sort(
        key=lambda item: (
            config_map.get(str(item.get("id") or ""), {}).get("sort_order", 1_000_000)
            if isinstance(item, dict)
            else 1_000_000
        )
    )
    return overridden


def apply_runtime_gpt_defaults(
    _gid: str,
    config: dict,
) -> dict:
    next_config = dict(config)
    resolved_upload_types = _resolve_default_upload_file_types(next_config)
    next_config["upload_file_types"] = resolved_upload_types
    if "file_upload_enabled" in next_config:
        next_config["file_upload_enabled"] = bool(next_config.get("file_upload_enabled"))
    else:
        next_config["file_upload_enabled"] = bool(resolved_upload_types)
    if "default_reasoning" in next_config:
        next_config["default_reasoning"] = bool(next_config.get("default_reasoning"))
    if "supports_reasoning" in next_config:
        next_config["supports_reasoning"] = bool(next_config.get("supports_reasoning"))
    return next_config


def _base_builtin_model_catalog() -> list[dict]:
    config = builtin_gpts.get(GPTASSISTANT_GPT_ID, {})
    models = config.get("models")
    if not isinstance(models, list):
        return []
    return [dict(item) for item in models if isinstance(item, dict)]


def _assistant_model_catalog(config: dict) -> list[dict]:
    models = config.get("models")
    base_models = models if isinstance(models, list) and models else _base_builtin_model_catalog()
    return apply_admin_model_config_overrides(GPTASSISTANT_GPT_ID, base_models)


def _normalize_upload_file_types(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        normalized = item.strip().lower()
        if normalized and normalized in ALLOWED_AGENT_UPLOAD_TYPES and normalized not in items:
            items.append(normalized)
    return items


def _resolve_default_upload_file_types(config: dict) -> list[str]:
    explicit_types = _normalize_upload_file_types(config.get("upload_file_types"))
    if explicit_types:
        return explicit_types
    if not config.get("file_upload_enabled", False):
        return []

    derived_types: list[str] = []
    models = config.get("models")
    if isinstance(models, list):
        for item in models:
            if not isinstance(item, dict):
                continue
            for upload_type in _normalize_upload_file_types(item.get("upload_file_types")):
                if upload_type not in derived_types:
                    derived_types.append(upload_type)
    return derived_types or ["document", "image"]


def _normalize_visible_model_ids(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized and normalized not in items:
                items.append(normalized)
    return items


def normalize_visible_models(body: dict, base_config: dict | None = None) -> None:
    assistant_config = {**(base_config or {}), **body}
    catalog = _assistant_model_catalog(assistant_config)
    valid_ids = {
        str(item.get("id") or "").strip()
        for item in catalog
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }
    submitted_ids = _normalize_visible_model_ids(body.get("visible_model_ids"))
    base_ids = _normalize_visible_model_ids((base_config or {}).get("visible_model_ids"))
    if submitted_ids:
        invalid_ids = [item for item in submitted_ids if item not in valid_ids]
        if invalid_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"unknown visible model ids: {', '.join(invalid_ids)}",
            )
        body["visible_model_ids"] = submitted_ids
    elif base_ids:
        body["visible_model_ids"] = [item for item in base_ids if item in valid_ids]
    else:
        body["visible_model_ids"] = list(valid_ids)

    preferred_model = str(body.get("default_model") or "").strip()
    visible_ids = body["visible_model_ids"]
    if preferred_model and preferred_model not in visible_ids:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "default_model must be included in visible_model_ids",
        )
    if not preferred_model and visible_ids:
        body["default_model"] = visible_ids[0]


def normalize_upload_file_types(body: dict, base_config: dict | None = None) -> None:
    submitted = body.get("upload_file_types")
    if submitted is None:
        if base_config is not None:
            body["upload_file_types"] = _resolve_default_upload_file_types(base_config)
        else:
            body["upload_file_types"] = ["document", "image"]
        return
    if not isinstance(submitted, list):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "upload_file_types must be a list")
    invalid_items = [
        item
        for item in submitted
        if not isinstance(item, str) or item.strip().lower() not in ALLOWED_AGENT_UPLOAD_TYPES
    ]
    if invalid_items:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"invalid upload_file_types: {', '.join(str(item) for item in invalid_items)}",
        )
    body["upload_file_types"] = _normalize_upload_file_types(submitted)


def get_user_identity(user: dict) -> tuple[str, str]:
    user_id = user.get("sub") or user.get("email")
    user_email = user.get("email") or user_id
    if not user_id or not user_email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    return user_id, user_email


def ensure_gpt_access_allowed(user: dict, gid: str) -> None:
    if not can_access_gpt(user, gid):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GPTS feature not enabled")


@router.get("/gpts/permission")
async def gpts_permission(user: dict = Depends(get_current_user)):
    return {
        "allowed": is_gpts_feature_allowed(user),
        "manage_allowed": is_gpts_manage_allowed(user),
    }


@router.get("/gpts/available-models")
async def get_available_gpt_models(
    gid: str | None = None,
    user: dict = Depends(get_current_user),
):
    ensure_gpts_manage_allowed(user)
    return await resolve_available_gpt_models(user, gid=gid)


@router.get("/gpts/capabilities")
async def get_available_gpt_capabilities(user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    return {
        "items": list_agent_capabilities(),
        "default_enabled": list(DEFAULT_AGENT_CAPABILITY_IDS),
        "runtime_version": "v3",
    }


@router.get("/gpts")
async def get_gpts(user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    gpt_logger.info(f"path=get_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    user_id = user.get("sub") or user.get("email") or ""
    current_provider = get_current_auth_provider(user)
    pin_state_map = list_user_gpt_pin_states(user_id) if user_id else {}

    gpts_list = [
        {
            "gid": key,
            **{k: v for k, v in value.items() if k not in {"system_prompt", "model_name", "auth"}},
            "is_pinned": _is_effectively_pinned(key, pin_state_map),
        }
        for key, value in fetch_gpts().items()
        if auth_ok(value, user["email"], user["sub"], current_provider=current_provider) and key != "gptassistant"
    ]
    return gpts_list


@router.patch("/gpts/{gid}/pin")
async def toggle_pin(gid: str, request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    body = await request.json()
    is_pinned = bool(body.get("is_pinned"))
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(404, "GPTS not found or not visible")
    if not auth_ok(
        gpts[gid],
        user.get("email") or "",
        user.get("sub"),
        current_provider=get_current_auth_provider(user),
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPTS not found or not visible")
    set_user_gpt_pin(user["sub"], gid, is_pinned=is_pinned)

    return {"gpts_id": gid, "is_pinned": is_pinned}


@router.get("/gpts/pined")
async def gpts_pined(user: dict = Depends(get_current_user)):
    user_id, user_email = get_user_identity(user)
    gpt_logger.info(f"path=gpts_pined user={user_email} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    return get_sidebar_gpts(user)


@router.get("/gpts/created")
async def gpts_created(user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    gpt_logger.info(f"path=gpts_created user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    current_provider = get_current_auth_provider(user)
    created = []
    for gid, data in gpts.items():
        if gid in BUILTIN_GIDS and not is_manageable_system_gpt(gid, data):
            continue
        if is_manageable_system_gpt(gid, data):
            if not (
                _gpt_can_manage(user, data)
                or can_manage_regulation_gpt(user)
                or can_manage_main_gpt(user)
            ):
                continue
        elif not _gpt_can_manage(user, data):
            continue
        if not is_gpt_visible_to_provider(data, current_provider):
            continue
        item = {
            "gid": gid,
            "name": data["name"],
            "owner": _effective_gpt_owner(gid, data),
            "can_edit": True,
            "can_delete": (
                (_gpt_owner(data) in _user_key_set(user) or is_gpts_manage_allowed(user))
                and gid not in BUILTIN_GIDS
            ),
        }
        if "logo" in data:
            item["logo"] = data["logo"]
        created.append(item)
    return created


@router.get("/gpts/detail/{gid}")
async def get_gpts_detail(gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_gpts_detail user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    ensure_gpt_access_allowed(user, gid)

    gpt_item = apply_runtime_gpt_defaults(gid, gpts[gid])

    exclude_fields = {"model_name"}
    system_manage_fallback = False
    if is_regulation_gpt(gid):
        system_manage_fallback = can_manage_regulation_gpt(user)
    elif is_main_gpt(gid):
        system_manage_fallback = can_manage_main_gpt(user)
    can_manage = _gpt_can_manage(user, gpt_item) or system_manage_fallback
    if not can_manage:
        exclude_fields.update({"system_prompt", "auth"})

    gpts_detail = {k: v for k, v in gpt_item.items() if k not in exclude_fields}
    gpts_detail["can_edit"] = can_manage
    effective_owner = _effective_gpt_owner(gid, gpt_item)
    user_keys = _user_key_set(user)
    is_owner = bool(effective_owner and effective_owner in user_keys)
    
    gpts_detail["can_transfer_owner"] = bool(
        is_owner or (not effective_owner and can_manage)
    )
    gpts_detail["can_delete"] = (
        (is_owner or is_gpts_manage_allowed(user))
        and gid not in BUILTIN_GIDS
    )
    if isinstance(gpts_detail.get("models"), list):
        full_runtime_models = _assistant_model_catalog(gpt_item)
        runtime_visible_models = apply_runtime_model_visibility(gid, full_runtime_models, gpt_item)
        visible_models = sanitize_models_for_detail(runtime_visible_models, user["email"], user["sub"])
        visible_models = await resolve_model_configs(visible_models)
        visible_models = apply_admin_model_config_overrides(
            GPTASSISTANT_GPT_ID,
            visible_models,
            include_missing=False,
        )
        gpts_detail["models"] = visible_models
        if can_manage:
            model_options = sanitize_models_for_detail(full_runtime_models, user["email"], user["sub"])
            model_options = await resolve_model_configs(model_options)
            model_options = apply_admin_model_config_overrides(
                GPTASSISTANT_GPT_ID,
                model_options,
                include_missing=False,
            )
            gpts_detail["model_options"] = model_options
            gpts_detail["visible_model_ids"] = _normalize_visible_model_ids(
                gpt_item.get("visible_model_ids")
            )
        if isinstance(gpts_detail.get("default_model"), str):
            default_model = gpts_detail["default_model"]
            visible_model_ids = {item.get("id") for item in visible_models if isinstance(item, dict)}
            if default_model not in visible_model_ids:
                gpts_detail["default_model"] = (
                    visible_models[0].get("id", "")
                    if visible_models
                    else ""
                )
    return gpts_detail


@router.get("/gpts/{gid}/knowledge-files")
async def list_gpt_knowledge_files(gid: str, user: dict = Depends(get_current_user)):
    ensure_owned_custom_gpt(gid, user)
    current_provider = get_current_auth_provider(user)
    return [
        {
            "file_id": file_id,
            "filename": entry.get("filename"),
            "file_extension": entry.get("fileExtension"),
            "size_bytes": entry.get("sizeBytes"),
            "upload_time": entry.get("uploadTime"),
        }
        for file_id, entry in list_file_mappings(gid).items()
        if entry.get("purpose") == "assistant_knowledge"
        and (
            entry.get("authProvider") == GLOBAL_AUTH_PROVIDER
            or entry.get("authProvider") == current_provider
        )
    ]


@router.delete("/gpts/{gid}/knowledge-files/{file_id}")
async def delete_gpt_knowledge_file(gid: str, file_id: str, user: dict = Depends(get_current_user)):
    ensure_owned_custom_gpt(gid, user)
    current_provider = get_current_auth_provider(user)
    entry = get_file_mapping(file_id, gid)
    if not entry or entry.get("purpose") != "assistant_knowledge":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Knowledge file not found")
    if entry.get("authProvider") not in {GLOBAL_AUTH_PROVIDER, current_provider}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Knowledge file not found")
    delete_file_reference(file_id, entry)
    return {"file_id": file_id}


@router.post("/gpts")
async def create_gpt(request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    body = await request.json()
    for field in ("name", "desc", "system_prompt"):
        if not body.get(field):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field} required")
    samples = body.get("samples", [])
    if not isinstance(samples, list) or any(not isinstance(s, str) for s in samples):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples must be list of strings")
    if len(samples) > MAX_SAMPLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples limit exceeded")
    refresh_gpts()
    gid = uuid.uuid4().hex
    while gid in BUILTIN_GIDS or gid in gpts:
        gid = uuid.uuid4().hex
    body["gid"] = gid
    body["owner"] = user['sub']
    _apply_new_agent_runtime_defaults(body)
    current_provider = get_current_auth_provider(user)
    provider_scope = _normalize_provider_scope(body.get("provider_scope") or GPT_PROVIDER_SCOPE_PROVIDER)
    body["provider_scope"] = provider_scope
    body["auth_provider"] = current_provider if provider_scope == GPT_PROVIDER_SCOPE_PROVIDER else GLOBAL_AUTH_PROVIDER
    auth = body.get("auth", {"type": "all"})
    if auth.get("type") == "white":
        users = auth.get("user", [])
        if not isinstance(users, list) or any(not isinstance(u, str) for u in users):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "auth.user must be list of strings")
    elif auth.get("type") not in {"all", "self"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid auth type")
    body["auth"] = auth
    owner, admins, viewers = _normalize_acl_state(user["sub"], body.get("admins"), body.get("viewers"))
    body["owner"] = owner or user["sub"]
    body["admins"] = admins
    body["viewers"] = viewers
    normalize_upload_file_types(body)
    normalize_preferred_model(body)
    normalize_visible_models(body)
    body["models"] = _assistant_model_catalog(body)
    _validate_agent_runtime_v3_config(gid, body)
    insert_custom_gpt(gid, body)
    refresh_gpts()
    return {"gid": gid}


@router.put("/gpts/{gid}")
async def update_gpt(gid: str, request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if is_manageable_system_gpt(gid, gpts[gid]):
        if not (
            _gpt_can_manage(user, gpts[gid])
            or can_manage_regulation_gpt(user)
            or can_manage_main_gpt(user)
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    elif gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be modified")
    if not is_manageable_system_gpt(gid, gpts[gid]) and not _gpt_can_manage(user, gpts[gid]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    submitted_body = await request.json()
    existing_config = {
        key: value
        for key, value in gpts[gid].items()
        if key != "chat_function" and not callable(value)
    }
    body = {**existing_config, **submitted_body}
    for protected_field in ("gid", "assistant_kind", "handler_key"):
        if protected_field in existing_config:
            body[protected_field] = existing_config[protected_field]
    current_provider = get_current_auth_provider(user)
    provider_scope = _normalize_provider_scope(body.get("provider_scope", gpts[gid].get("provider_scope")))
    if provider_scope == GPT_PROVIDER_SCOPE_PROVIDER:
        gpt_provider = str(
            body.get("auth_provider")
            or gpts[gid].get("auth_provider")
            or current_provider
        ).strip() or current_provider
        if gpt_provider != current_provider:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "GPT is not visible on this provider")
        body["auth_provider"] = gpt_provider
    else:
        body["auth_provider"] = GLOBAL_AUTH_PROVIDER
    body["provider_scope"] = provider_scope
    auth = body.get("auth", {"type": "all"})
    if auth.get("type") == "white":
        users = auth.get("user", [])
        if not isinstance(users, list) or any(not isinstance(u, str) for u in users):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "auth.user must be list of strings")
    elif auth.get("type") not in {"all", "self"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid auth type")
    body["auth"] = auth
    requested_owner = str(body.get("owner") or gpts[gid].get("owner") or "").strip()
    current_owner = _effective_gpt_owner(gid, gpts[gid])
    if current_owner and requested_owner != current_owner and not _is_owner_identity(user, current_owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can transfer ownership")
    owner, admins, viewers = _normalize_acl_state(requested_owner or current_owner, body.get("admins"), body.get("viewers"))
    body["owner"] = owner or current_owner or user["sub"]
    body["admins"] = admins
    body["viewers"] = viewers
    samples = body.get("samples", [])
    if not isinstance(samples, list) or any(not isinstance(s, str) for s in samples):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples must be list of strings")
    if len(samples) > MAX_SAMPLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples limit exceeded")
    normalize_upload_file_types(body, existing_config)
    normalize_preferred_model(body)
    normalize_visible_models(body, existing_config)
    body["models"] = _assistant_model_catalog(body)
    _validate_agent_runtime_v3_config(gid, body)
    update_custom_gpt(gid, body)
    refresh_gpts()
    return {"gid": gid}


@router.delete("/gpts/{gid}")
async def delete_gpt(gid: str, user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if is_regulation_gpt(gid):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be deleted")
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be deleted")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if not _is_owner_identity(user, _effective_gpt_owner(gid, gpts[gid])) and not is_gpts_manage_allowed(user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    delete_assistant_knowledge_files(gid)
    delete_custom_gpt(gid)
    delete_user_gpt_state_by_gid(gid)
    refresh_gpts()
    return {"gid": gid}


def auth_ok(
    gpt_dict: dict,
    user: str,
    user_id: Optional[str] = None,
    *,
    current_provider: str | None = None,
):
    if current_provider and not is_gpt_visible_to_provider(gpt_dict, current_provider):
        return False
    if user_id and _gpt_owner(gpt_dict) == user_id:
        return True
    if user_id and _gpt_can_view({"sub": user_id, "email": user}, gpt_dict):
        return True
    auth = gpt_dict.get("auth") or {"type": "all"}
    if auth['type'] == "all":
        return True
    if auth['type'] == "white":
        if user in auth.get('user', []):
            return True
    if auth['type'] == "self":
        return False
    return False


def filter_models_for_user(models: list[dict], user: str, user_id: Optional[str] = None) -> list[dict]:
    visible_models: list[dict] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        if auth_ok(item, user, user_id):
            visible_models.append(item)
    return visible_models


def sanitize_models_for_detail(models: list[dict], user: str, user_id: Optional[str] = None) -> list[dict]:
    visible_models = filter_models_for_user(models, user, user_id)
    return [{k: v for k, v in item.items() if k != "auth"} for item in visible_models]


async def resolve_available_gpt_models(user: dict, *, gid: str | None = None) -> dict:
    refresh_gpts()
    target_gid = gid or GPTASSISTANT_GPT_ID
    assistant_config = apply_runtime_gpt_defaults(
        target_gid,
        gpts.get(target_gid, gpts.get(GPTASSISTANT_GPT_ID, {})),
    )
    runtime_models = _assistant_model_catalog(assistant_config)
    visible_models = sanitize_models_for_detail(
        runtime_models,
        user["email"],
        user.get("sub"),
    )
    visible_models = await resolve_model_configs(visible_models)
    visible_models = apply_admin_model_config_overrides(
        GPTASSISTANT_GPT_ID,
        visible_models,
        include_missing=False,
    )
    configured_visible_model_ids = _normalize_visible_model_ids(
        assistant_config.get("visible_model_ids")
    )
    visible_model_ids = [
        item.get("id")
        for item in visible_models
        if isinstance(item, dict) and item.get("id")
    ]
    if not configured_visible_model_ids:
        configured_visible_model_ids = visible_model_ids
    default_model = str(assistant_config.get("default_model") or "").strip()
    if default_model not in configured_visible_model_ids:
        default_model = configured_visible_model_ids[0] if configured_visible_model_ids else ""
    return {
        "default_model": default_model,
        "models": visible_models,
        "visible_model_ids": configured_visible_model_ids,
    }


def normalize_preferred_model(body: dict) -> None:
    preferred_model = body.get("default_model")
    if preferred_model is None:
        return
    if not isinstance(preferred_model, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "default_model must be a string")
    preferred_model = preferred_model.strip()
    if len(preferred_model) > MAX_MODEL_ID_CHARS or not preferred_model.isprintable():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid default_model")
    if preferred_model:
        body["default_model"] = preferred_model
    else:
        body.pop("default_model", None)
