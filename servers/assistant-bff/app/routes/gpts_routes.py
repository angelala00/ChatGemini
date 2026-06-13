import time
import uuid
from typing import Tuple, Optional
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.admin.access_control import (
    get_feature_flag_value,
    get_feature_flag_string_list,
    is_feature_flag_enabled,
    resolve_user_permissions,
)
from app.auth.auth_routes import GLOBAL_AUTH_PROVIDER, get_current_auth_provider, get_current_user
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, fetch_gpts, refresh_gpts, BUILTIN_GIDS
from app.gpts.model_metadata import resolve_model_configs
from app.base_config import model_config
from app.storage.business_store import (
    delete_custom_gpt,
    delete_user_gpt_state_by_gid,
    ensure_required_pinned_gpts as ensure_required_pinned_gpts_record,
    get_user_config_version,
    insert_custom_gpt,
    list_admin_model_configs,
    is_gpt_pinned,
    list_pinned_gids,
    list_user_pinned_rows,
    set_user_config_version,
    set_user_gpt_pin,
    update_custom_gpt,
    list_file_mappings,
    get_file_mapping,
)
from app.storage.file_lifecycle import delete_file_reference

router = APIRouter(prefix="/api", tags=["gpts"])

LIMIT_PINNED = 8
MAX_SAMPLES = 5
MAX_MODEL_ID_CHARS = 200
GPT_PROVIDER_SCOPE_PROVIDER = "provider"
GPT_PROVIDER_SCOPE_GLOBAL = "global"

GPTS_WHITE_LIST = model_config.GPTS_WHITE_LIST


def is_gpts_feature_allowed(user: dict) -> bool:
    if not is_feature_flag_enabled("gpts_feature_enabled", model_config.GPTS_FEATURE_ENABLED):
        return False
    if not GPTS_WHITE_LIST:
        return True
    return user.get("email") in GPTS_WHITE_LIST or user.get("sub") in GPTS_WHITE_LIST


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


def is_gpt_visible_to_provider(gpt_dict: dict, current_provider: str) -> bool:
    if _get_gpt_provider_scope(gpt_dict) == GPT_PROVIDER_SCOPE_PROVIDER:
        return _get_gpt_auth_provider(gpt_dict) == current_provider
    return True


def ensure_owned_custom_gpt(gid: str, user: dict) -> dict:
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if gid in BUILTIN_GIDS or gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
    current_provider = get_current_auth_provider(user)
    gpt_item = gpts[gid]
    if gpt_item.get("owner") != user.get("sub") or not is_gpt_visible_to_provider(
        gpt_item, current_provider
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
    return gpt_item


def delete_assistant_knowledge_files(gid: str) -> None:
    for file_id, entry in list_file_mappings(gid).items():
        if entry.get("purpose") != "assistant_knowledge":
            continue
        delete_file_reference(file_id, entry)


def is_required_pinned_gid(gid: str) -> bool:
    gpt = gpts.get(gid)
    return bool(gpt and gpt.get("required_pinned"))


def get_required_pinned_gids() -> tuple[str, ...]:
    return tuple(
        gid
        for gid, gpt in gpts.items()
        if isinstance(gpt, dict) and gpt.get("required_pinned")
    )


def ensure_required_pinned_gpts(user_id: str) -> None:
    ensure_required_pinned_gpts_record(user_id, get_required_pinned_gids())


def is_gpt_pinned_for_user(user_id: str, gid: str) -> bool:
    if is_required_pinned_gid(gid):
        ensure_required_pinned_gpts(user_id)
    return is_gpt_pinned(user_id, gid)


def can_access_gpt(user: dict, gid: str) -> bool:
    if gid == "gptassistant":
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
    if not is_gpts_feature_allowed(user):
        return is_gpt_pinned_for_user(user_id, gid)
    return False


def get_sidebar_gpts(user: dict) -> list[dict]:
    """Return the left-rail agent entries for the current user.

    Compatibility rule:
    - users with the global GPTS feature keep seeing their pinned/favorite agents here;
    - users without that feature see every agent they can directly access.

    This keeps gray-released users on the left rail without exposing the full gallery.
    """
    refresh_gpts()
    user_email = user.get("email") or ""
    user_id = user.get("sub") or user.get("email") or ""
    if is_gpts_feature_allowed(user):
        pinned_rows = list_user_pinned_rows(user_id) if user_id else []
        pinned: list[dict] = []
        required_gids = set(get_required_pinned_gids())

        for index, row in enumerate(pinned_rows):
            gid = row["gpts_id"]
            gpt_item = gpts.get(gid)
            if not gpt_item or not auth_ok(
                gpt_item,
                user_email,
                user_id,
                current_provider=get_current_auth_provider(user),
            ):
                continue

            item = {
                "gid": gid,
                "name": gpt_item.get("name") or gpt_item.get("title") or gid,
                "is_pinned": True,
                "is_required_pinned": is_required_pinned_gid(gid),
                "_order": index,
            }
            if "logo" in gpt_item:
                item["logo"] = gpt_item["logo"]
            pinned.append(item)

        pinned.sort(key=lambda item: (0 if item["gid"] in required_gids else 1, item["_order"]))
        for item in pinned:
            item.pop("_order", None)
        return pinned[:LIMIT_PINNED]

    visible_items: list[dict] = []
    pinned_ids = set(list_pinned_gids(user_id)) if user_id else set()

    for gid, value in fetch_gpts().items():
        if gid == "gptassistant":
            continue
        if not auth_ok(
            value,
            user_email,
            user_id,
            current_provider=get_current_auth_provider(user),
        ):
            continue

        visible_items.append(
            {
                "gid": gid,
                **{k: v for k, v in value.items() if k not in {"system_prompt", "model_name", "auth"}},
                "is_pinned": gid in pinned_ids or is_required_pinned_gid(gid),
                "is_required_pinned": is_required_pinned_gid(gid),
            }
        )

    visible_items.sort(
        key=lambda item: (
            0 if item["is_required_pinned"] else 1 if item["is_pinned"] else 2,
            str(item.get("name") or "").lower(),
            str(item.get("gid") or ""),
        )
    )
    return visible_items


def apply_runtime_model_visibility(
    gid: str,
    models: list[dict],
) -> list[dict]:
    if gid != "gptassistant":
        return models
    visible_model_ids = set(get_feature_flag_string_list("default_visible_models"))
    if not visible_model_ids:
        return models
    filtered = [
        item
        for item in models
        if isinstance(item, dict) and str(item.get("id") or "").strip() in visible_model_ids
    ]
    return filtered or models


def apply_admin_model_config_overrides(
    gid: str,
    models: list[dict],
    *,
    include_missing: bool = True,
) -> list[dict]:
    if gid != "gptassistant":
        return models

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
        allowed_upload_types = admin_config.get("allowed_upload_types")
        if isinstance(allowed_upload_types, list):
            merged["upload_file_types"] = allowed_upload_types
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
            overridden.append(model)
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
    gid: str,
    config: dict,
) -> dict:
    if gid != "gptassistant":
        return config
    next_config = dict(config)
    configured_default_model = get_feature_flag_value("default_model")
    if isinstance(configured_default_model, str) and configured_default_model.strip():
        next_config["default_model"] = configured_default_model.strip()
    current_default_reasoning = bool(next_config.get("default_reasoning", True))
    next_config["default_reasoning"] = is_feature_flag_enabled(
        "default_reasoning_enabled",
        current_default_reasoning,
    )
    return next_config


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
async def get_available_gpt_models(user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    return await resolve_available_gpt_models(user)


@router.get("/gpts")
async def get_gpts(user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    gpt_logger.info(f"path=get_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    user_id = user.get("sub") or user.get("email") or ""
    pinned_ids = list_pinned_gids(user_id)
    current_provider = get_current_auth_provider(user)

    gpts_list = [{"gid": key, **{k: v for k, v in value.items() if k not in {"system_prompt", "model_name", "auth"}},
                  "is_pinned": key in pinned_ids or is_required_pinned_gid(key),
                  "is_required_pinned": is_required_pinned_gid(key)} for key, value in fetch_gpts().items() if
                 auth_ok(value, user['email'], user['sub'], current_provider=current_provider) and key != 'gptassistant']
    return gpts_list


@router.patch("/gpts/{gid}/pin")
async def toggle_pin(gid: str, request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    body = await request.json()
    is_pinned = bool(body.get("is_pinned"))
    if is_required_pinned_gid(gid) and not is_pinned:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "required pinned GPTS cannot be unpinned")
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(404, "GPTS not found or not visible")
    set_user_gpt_pin(user["sub"], gid, is_pinned=is_pinned)

    return {"gpts_id": gid, "is_pinned": is_pinned}


# Version configuration
CONFIG_VERSION = "v0.10.0"


def parse_version(v: str) -> Tuple[int, ...]:
    """Parse a semantic version string like 'v0.10.0' into a tuple."""
    v = v.lstrip("v")
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return (0,)


@router.get("/gpts/pined")
async def gpts_pined(user: dict = Depends(get_current_user)):
    user_id, user_email = get_user_identity(user)
    gpt_logger.info(f"path=gpts_pined user={user_email} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    cfg = get_user_config_version(user_id)
    need_init = True
    if cfg:
        need_init = parse_version(cfg) < parse_version(CONFIG_VERSION)
    if need_init:
        ensure_required_pinned_gpts(user_id)
        set_user_config_version(user_id, CONFIG_VERSION)
    ensure_required_pinned_gpts(user_id)
    return get_sidebar_gpts(user)


@router.get("/gpts/created")
async def gpts_created(user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    gpt_logger.info(f"path=gpts_created user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    current_provider = get_current_auth_provider(user)
    created = []
    for gid, data in gpts.items():
        if gid in BUILTIN_GIDS:
            continue
        if data.get("owner") != user['sub']:
            continue
        if not is_gpt_visible_to_provider(data, current_provider):
            continue
        item = {"gid": gid, "name": data["name"]}
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
    if gpt_item.get("owner") != user['sub']:
        exclude_fields.update({"system_prompt", "auth"})

    gpts_detail = {k: v for k, v in gpt_item.items() if k not in exclude_fields}
    if isinstance(gpts_detail.get("models"), list):
        runtime_models = apply_admin_model_config_overrides(gid, gpts_detail["models"])
        runtime_visible_models = apply_runtime_model_visibility(gid, runtime_models)
        visible_models = sanitize_models_for_detail(runtime_visible_models, user["email"], user["sub"])
        visible_models = await resolve_model_configs(visible_models)
        visible_models = apply_admin_model_config_overrides(
            gid,
            visible_models,
            include_missing=False,
        )
        gpts_detail["models"] = visible_models
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
    normalize_preferred_model(body)
    insert_custom_gpt(gid, body)
    refresh_gpts()
    return {"gid": gid}


@router.put("/gpts/{gid}")
async def update_gpt(gid: str, request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be modified")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if gpts[gid].get("owner") != user['sub']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    body = await request.json()
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
    samples = body.get("samples", [])
    if not isinstance(samples, list) or any(not isinstance(s, str) for s in samples):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples must be list of strings")
    if len(samples) > MAX_SAMPLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "samples limit exceeded")
    body["owner"] = gpts[gid].get("owner", user['sub'])
    normalize_preferred_model(body)
    update_custom_gpt(gid, body)
    refresh_gpts()
    return {"gid": gid}


@router.delete("/gpts/{gid}")
async def delete_gpt(gid: str, user: dict = Depends(get_current_user)):
    ensure_gpts_manage_allowed(user)
    refresh_gpts()
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be deleted")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if gpts[gid].get("owner") != user['sub']:
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
    if user_id and gpt_dict.get("owner") == user_id:
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


async def resolve_available_gpt_models(user: dict) -> dict:
    refresh_gpts()
    assistant_config = apply_runtime_gpt_defaults(
        "gptassistant",
        gpts.get("gptassistant", {}),
    )
    runtime_models = apply_admin_model_config_overrides(
        "gptassistant",
        assistant_config.get("models", []),
    )
    runtime_visible_models = apply_runtime_model_visibility("gptassistant", runtime_models)
    visible_models = sanitize_models_for_detail(
        runtime_visible_models,
        user["email"],
        user.get("sub"),
    )
    visible_models = await resolve_model_configs(visible_models)
    visible_models = apply_admin_model_config_overrides(
        "gptassistant",
        visible_models,
        include_missing=False,
    )
    visible_model_ids = {
        item.get("id")
        for item in visible_models
        if isinstance(item, dict)
    }
    default_model = assistant_config.get("default_model", "")
    if default_model not in visible_model_ids:
        default_model = visible_models[0].get("id", "") if visible_models else ""
    return {
        "default_model": default_model,
        "models": visible_models,
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
