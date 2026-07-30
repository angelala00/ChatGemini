from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
import httpx
from urllib.parse import quote

from app.base_config import platform_config, model_config
from app.auth.auth_routes import get_current_user


router = APIRouter(prefix="/api/platform", tags=["platform"])
USER_TOKEN_LIMIT = 2
PROJECT_TOKEN_LIMIT = 5


def _count_owner_tokens_in_space(
    tokens: dict,
    owner_field: str,
    owner_id: str,
    space_id: str,
    default_space_id: str | None,
) -> int:
    count = 0
    for entry in tokens.values():
        if not isinstance(entry, dict) or entry.get(owner_field) != owner_id:
            continue
        entry_space_id = entry.get("space_id")
        if not isinstance(entry_space_id, str) or not entry_space_id.strip():
            entry_space_id = default_space_id
        if entry_space_id == space_id:
            count += 1
    return count


def _build_target_url(prefix: str, path: str) -> str:
    base = platform_config.PORTAL_BASE_URL
    if not base:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PLATFORM_PORTAL_BASE_URL 未配置",
        )
    normalized_path = path.lstrip("/")
    return f"{base}{prefix}/{normalized_path}"


def _build_headers(request: Request) -> dict[str, str]:
    if not platform_config.PORTAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PLATFORM_PORTAL_TOKEN 未配置",
        )
    token_value = platform_config.PORTAL_TOKEN
    if not token_value.lower().startswith("bearer "):
        token_value = f"Bearer {token_value}"
    headers = {"Authorization": token_value}
    content_type = request.headers.get("content-type")
    if content_type:
        headers["Content-Type"] = content_type
    accept = request.headers.get("accept")
    if accept:
        headers["Accept"] = accept
    return headers


async def _proxy_request(request: Request, target_url: str) -> Response:
    headers = _build_headers(request)
    body = await request.body()
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.request(
            request.method,
            target_url,
            params=dict(request.query_params),
            content=body if body else None,
            headers=headers,
        )
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )


def _get_user_email(user: dict) -> str:
    user_email = user.get("email") or user.get("sub")
    if not isinstance(user_email, str) or not user_email.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或用户信息缺失",
        )
    return user_email.strip()


def _extract_department_name(user: dict) -> str | None:
    group = user.get("group")
    if not isinstance(group, str) or not group.strip():
        return None
    ou_values: list[str] = []
    for part in group.split(","):
        part = part.strip()
        if part.upper().startswith("OU="):
            value = part[3:].strip()
            if value:
                ou_values.append(value)
    if not ou_values:
        return None
    if len(ou_values) >= 2:
        return ou_values[1]
    return ou_values[0]


async def _fetch_json(request: Request, target_url: str, method: str | None = None) -> tuple[int, dict]:
    headers = _build_headers(request)
    request_method = method or request.method
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.request(
            request_method,
            target_url,
            params=dict(request.query_params),
            headers=headers,
        )
    if upstream.status_code >= 400:
        return upstream.status_code, {
            "detail": upstream.text or "上游请求失败",
        }
    try:
        return upstream.status_code, upstream.json()
    except ValueError:
        return status.HTTP_502_BAD_GATEWAY, {"detail": "上游返回非 JSON 数据"}


async def _fetch_json_with_params(
    request: Request,
    target_url: str,
    params: dict[str, str],
    method: str | None = None,
) -> tuple[int, dict]:
    headers = _build_headers(request)
    request_method = method or request.method
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.request(
            request_method,
            target_url,
            params=params,
            headers=headers,
        )
    if upstream.status_code >= 400:
        return upstream.status_code, {
            "detail": upstream.text or "上游请求失败",
        }
    try:
        return upstream.status_code, upstream.json()
    except ValueError:
        return status.HTTP_502_BAD_GATEWAY, {"detail": "上游返回非 JSON 数据"}


async def _load_effective_spaces(
    request: Request,
    subject_type: str,
    subject_id: str,
) -> tuple[list[dict] | None, JSONResponse | None]:
    target_url = _build_target_url(
        "/effective-services",
        f"/{subject_type}/{quote(subject_id, safe='')}/spaces",
    )
    status_code, payload = await _fetch_json(request, target_url, method="GET")
    if status_code >= 400:
        return None, JSONResponse(status_code=status_code, content=payload)
    raw_spaces = payload.get("spaces") if isinstance(payload, dict) else None
    if not isinstance(raw_spaces, list):
        return None, JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "上游 Space 数据缺失"},
        )
    spaces: list[dict] = []
    for item in raw_spaces:
        if not isinstance(item, dict):
            continue
        space = item.get("space")
        if not isinstance(space, dict) or not isinstance(space.get("id"), str):
            continue
        spaces.append(
            {
                "id": space["id"],
                "label": space.get("label") or space["id"],
                "regionId": space.get("regionId"),
                "available": bool(item.get("available")),
                "status": item.get("status") or "unavailable",
                "siteCount": int(item.get("siteCount") or 0),
                "modelCount": int(item.get("modelCount") or 0),
                "isDefault": bool(space.get("isDefault")),
            }
        )
    return spaces, None


async def _load_user_api_key_summary(
    request: Request,
    user: dict,
) -> tuple[dict | None, JSONResponse | None]:
    user_email = _get_user_email(user)
    target_url = _build_target_url("/access", "/db")
    status_code, access_db = await _fetch_json(request, target_url, method="GET")
    if status_code >= 400:
        return None, JSONResponse(status_code=status_code, content=access_db)

    access_db, error_response = await _ensure_user_registered(request, user, access_db)
    if error_response is not None:
        return None, error_response

    access_tokens_url = _build_target_url("/access", "/tokens")
    access_tokens_status, access_tokens_payload = await _fetch_json(request, access_tokens_url, method="GET")
    if access_tokens_status >= 400:
        return None, JSONResponse(status_code=access_tokens_status, content=access_tokens_payload)

    access_token_entries = access_tokens_payload.get("tokens") if isinstance(access_tokens_payload, dict) else None
    access_token_by_value: dict[str, dict] = {}
    if isinstance(access_token_entries, list):
        for item in access_token_entries:
            if not isinstance(item, dict):
                continue
            token_value = item.get("token")
            if isinstance(token_value, str) and token_value:
                access_token_by_value[token_value] = item

    users = access_db.get("users") if isinstance(access_db, dict) else None
    projects = access_db.get("projects") if isinstance(access_db, dict) else None
    tokens = access_db.get("tokens") if isinstance(access_db, dict) else None
    if not isinstance(users, dict) or not isinstance(tokens, dict):
        return None, JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "上游返回数据缺失"},
        )

    user_entry = users.get(user_email) if isinstance(users, dict) else None
    display_name = None
    if isinstance(user_entry, dict):
        display_name = user_entry.get("displayName") or None

    owned_projects: dict[str, dict] = {}
    if isinstance(projects, dict):
        for project_id, entry in projects.items():
            if not isinstance(entry, dict):
                continue
            owners = entry.get("owners")
            if isinstance(owners, list) and user_email in owners:
                owned_projects[project_id] = entry

    user_spaces, spaces_error = await _load_effective_spaces(
        request, "user", user_email
    )
    if spaces_error is not None:
        return None, spaces_error
    project_spaces: dict[str, list[dict]] = {}
    for project_id in owned_projects:
        spaces, spaces_error = await _load_effective_spaces(
            request, "project", project_id
        )
        if spaces_error is not None:
            return None, spaces_error
        project_spaces[project_id] = spaces or []

    token_entries = []
    enabled = False
    for token_value, entry in tokens.items():
        if not isinstance(entry, dict):
            continue
        access_token_entry = access_token_by_value.get(token_value, {})
        owner_payload = None
        if entry.get("user") == user_email:
            owner_payload = {
                "ownerType": "user",
            }
            owner_spaces = user_spaces or []
        elif isinstance(entry.get("project"), str) and entry.get("project") in owned_projects:
            project_id = entry.get("project")
            owner_payload = {
                "ownerType": "project",
                "projectId": project_id,
                "projectName": owned_projects.get(project_id, {}).get("name") or project_id,
            }
            owner_spaces = project_spaces.get(project_id, [])
        if owner_payload is None:
            continue
        space_id = entry.get("space_id")
        space_label = None
        if isinstance(space_id, str):
            if not any(item.get("id") == space_id for item in owner_spaces):
                continue
            space_label = next(
                (
                    item.get("label")
                    for item in owner_spaces
                    if item.get("id") == space_id
                ),
                space_id,
            )
        token_payload = {
            "token": token_value,
            "tokenId": access_token_entry.get("tokenId") or entry.get("id"),
            "enabled": bool(access_token_entry.get("enabled", entry.get("enabled", True))),
            "diagnosticsAuthorized": bool(access_token_entry.get("diagnosticsAuthorized", False)),
            "diagnosticsActive": bool(access_token_entry.get("diagnosticsActive", False)),
            "diagnosticsExpiresAt": access_token_entry.get("diagnosticsExpiresAt"),
            "note": access_token_entry.get("note") or entry.get("note"),
            "spaceId": space_id,
            "spaceLabel": space_label,
            **owner_payload,
        }
        token_entries.append(token_payload)
        if token_payload["enabled"]:
            enabled = True

    project_list = [
        {
            "id": project_id,
            "name": entry.get("name") or project_id,
            "department": entry.get("department"),
            "spaces": project_spaces.get(project_id, []),
        }
        for project_id, entry in owned_projects.items()
        if isinstance(entry, dict)
    ]

    # Check if user is in any whitelist to grant isAdmin-like privileges in frontend
    is_admin = False
    if user_email in model_config.GPTS_WHITE_LIST or user_email in model_config.VOICE_LAB_WHITE_LIST:
        is_admin = True

    return {
        "id": user_email,
        "displayName": display_name,
        "enabled": enabled,
        "isAdmin": is_admin,
        "tokenCount": len(token_entries),
        "tokens": token_entries,
        "spaces": user_spaces or [],
        "projects": project_list,
        "limits": {
            "userMax": USER_TOKEN_LIMIT,
            "projectMax": PROJECT_TOKEN_LIMIT,
            "scope": "space",
        },
    }, None


async def _ensure_user_token_access(
    request: Request,
    user: dict,
    token_id: str,
    *,
    require_diagnostics_authorized: bool = False,
) -> tuple[dict | None, JSONResponse | None]:
    summary, error_response = await _load_user_api_key_summary(request, user)
    if error_response is not None:
        return None, error_response
    tokens = summary.get("tokens") if isinstance(summary, dict) else None
    if not isinstance(tokens, list):
        return None, JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "上游返回数据缺失"},
        )
    for item in tokens:
        if not isinstance(item, dict):
            continue
        if item.get("tokenId") != token_id:
            continue
        if require_diagnostics_authorized and not item.get("diagnosticsAuthorized"):
            return None, JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "该 API Key 未授权调试功能"},
            )
        return item, None
    return None, JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "API Key 不存在或无权限访问"},
    )


async def _ensure_user_token_value_access(
    request: Request,
    user: dict,
    token: str,
) -> JSONResponse | None:
    user_email = _get_user_email(user)
    target_url = _build_target_url("/access", "/db")
    status_code, access_db = await _fetch_json(request, target_url, method="GET")
    if status_code >= 400:
        return JSONResponse(status_code=status_code, content=access_db)
    tokens = access_db.get("tokens") if isinstance(access_db, dict) else None
    projects = access_db.get("projects") if isinstance(access_db, dict) else None
    entry = tokens.get(token) if isinstance(tokens, dict) else None
    allowed = isinstance(entry, dict) and entry.get("user") == user_email
    project_id = entry.get("project") if isinstance(entry, dict) else None
    if not allowed and isinstance(project_id, str) and isinstance(projects, dict):
        project = projects.get(project_id)
        owners = project.get("owners") if isinstance(project, dict) else None
        allowed = isinstance(owners, list) and user_email in owners
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "API Key 不存在或无权限访问"},
        )
    return None


def _filter_query_params(request: Request, excluded: set[str]) -> dict[str, str]:
    return {key: value for key, value in request.query_params.items() if key not in excluded}


async def _ensure_user_registered(
    request: Request,
    user: dict,
    access_db: dict,
) -> tuple[dict | None, JSONResponse | None]:
    users = access_db.get("users") if isinstance(access_db, dict) else None
    user_email = _get_user_email(user)
    if isinstance(users, dict) and user_email in users:
        return access_db, None

    departments = access_db.get("departments") if isinstance(access_db, dict) else None
    department_name = _extract_department_name(user)
    department_id = None
    if isinstance(departments, dict) and department_name:
        for dep_id, dep_entry in departments.items():
            if isinstance(dep_entry, dict) and dep_entry.get("name") == department_name:
                department_id = dep_id
                break

    if not department_id and isinstance(departments, dict) and len(departments) == 1:
        department_id = next(iter(departments))
    if not department_id:
        detail = "用户未注册且无法解析部门"
        if department_name:
            detail = f"{detail}（{department_name}）"
        return None, JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": detail},
        )
    if not isinstance(departments, dict) or department_id not in departments:
        return None, JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "部门不存在，请联系管理员"},
        )

    display_name = user.get("name") or user_email
    target_url = _build_target_url("/access", "/users")
    headers = _build_headers(request)
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.post(
            target_url,
            headers=headers,
            json={"id": user_email, "department": department_id, "displayName": display_name},
        )
    if upstream.status_code >= 400:
        return None, JSONResponse(
            status_code=upstream.status_code,
            content={"detail": upstream.text or "自动注册失败"},
        )

    refresh_url = _build_target_url("/access", "/db")
    status_code, refreshed = await _fetch_json(request, refresh_url, method="GET")
    if status_code >= 400:
        return None, JSONResponse(status_code=status_code, content=refreshed)
    return refreshed, None


@router.api_route("/gateway/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_gateway(request: Request, path: str) -> Response:
    target_url = _build_target_url("/gateway/admin", path)
    return await _proxy_request(request, target_url)


@router.api_route("/metrics/{path:path}", methods=["GET", "POST"])
async def proxy_metrics(request: Request, path: str) -> Response:
    target_url = _build_target_url("/metrics", path)
    return await _proxy_request(request, target_url)


@router.get("/user/visibility")
async def get_user_visibility(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    user_email = _get_user_email(user)
    target_url = _build_target_url(
        "/gateway/admin",
        f"/users/{user_email}/visibility/public",
    )
    
    # Check if user is in any whitelist to grant isAdmin-like privileges in frontend
    is_admin = False
    if user_email in model_config.GPTS_WHITE_LIST or user_email in model_config.VOICE_LAB_WHITE_LIST:
        is_admin = True
    
    headers = _build_headers(request)
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.get(
            target_url,
            headers=headers,
        )
    
    if upstream.status_code == 200:
        try:
            payload = upstream.json()
            if isinstance(payload, dict):
                payload["isAdmin"] = is_admin
                return JSONResponse(content=payload)
        except Exception:
            pass
            
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )


@router.get("/user/usage")
async def get_user_usage(
    request: Request,
    user: dict = Depends(get_current_user),
    include_projects: bool = Query(False, alias="includeProjects"),
) -> Response:
    user_email = _get_user_email(user)
    params = _filter_query_params(request, {"includeProjects"})
    target_url = _build_target_url("/metrics", f"/rankings/users/{user_email}/models")
    status_code, payload = await _fetch_json_with_params(request, target_url, params, method="GET")
    if status_code >= 400:
        return JSONResponse(status_code=status_code, content=payload)
    if not include_projects:
        return JSONResponse(status_code=status_code, content=payload)
    if not isinstance(payload, dict):
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "上游返回数据缺失"},
        )

    access_url = _build_target_url("/access", "/db")
    access_status, access_db = await _fetch_json(request, access_url)
    if access_status >= 400:
        return JSONResponse(status_code=access_status, content=access_db)
    access_db, error_response = await _ensure_user_registered(request, user, access_db)
    if error_response is not None:
        return error_response

    projects = access_db.get("projects") if isinstance(access_db, dict) else None
    owned_projects: dict[str, dict] = {}
    if isinstance(projects, dict):
        for project_id, entry in projects.items():
            if not isinstance(entry, dict):
                continue
            owners = entry.get("owners")
            if isinstance(owners, list) and user_email in owners:
                owned_projects[project_id] = entry

    project_usages: list[dict] = []
    for project_id, entry in owned_projects.items():
        project_name = entry.get("name") or project_id
        project_url = _build_target_url(
            "/metrics",
            f"/rankings/users/project:{project_id}/models",
        )
        project_status, project_payload = await _fetch_json_with_params(
            request,
            project_url,
            params,
            method="GET",
        )
        if project_status >= 400:
            detail = project_payload.get("detail") if isinstance(project_payload, dict) else None
            project_usages.append(
                {
                    "id": project_id,
                    "name": project_name,
                    "usage": None,
                    "error": detail or "项目用量加载失败",
                }
            )
        else:
            project_usages.append(
                {
                    "id": project_id,
                    "name": project_name,
                    "usage": project_payload,
                }
            )

    payload = dict(payload)
    payload["projects"] = project_usages
    return JSONResponse(status_code=status_code, content=payload)


@router.get("/user/api-keys")
async def get_user_api_keys(
    request: Request,
    user: dict = Depends(get_current_user),
) -> JSONResponse:
    payload, error_response = await _load_user_api_key_summary(request, user)
    if error_response is not None:
        return error_response
    return JSONResponse(content=payload)


@router.post("/user/tokens")
async def create_user_token(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    user_email = _get_user_email(user)
    payload = await request.json()
    owner_type = payload.get("ownerType")
    project_id = payload.get("projectId")
    space_id = payload.get("spaceId")
    note = payload.get("note")
    if owner_type not in {"user", "project"}:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "API Key 归属类型无效"},
        )
    if isinstance(space_id, str):
        space_id = space_id.strip() or None
    else:
        space_id = None

    target_url = _build_target_url("/access", "/db")
    status_code, access_db = await _fetch_json(request, target_url, method="GET")
    if status_code >= 400:
        return JSONResponse(status_code=status_code, content=access_db)
    access_db, error_response = await _ensure_user_registered(request, user, access_db)
    if error_response is not None:
        return error_response
    users = access_db.get("users") if isinstance(access_db, dict) else None
    projects = access_db.get("projects") if isinstance(access_db, dict) else None
    tokens = access_db.get("tokens") if isinstance(access_db, dict) else None
    if not isinstance(users, dict) or not isinstance(tokens, dict):
        return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": "上游返回数据缺失"})

    if owner_type == "project":
        if not isinstance(project_id, str) or not project_id.strip():
            return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "缺少项目 ID"})
        project_id = project_id.strip()
        if not isinstance(projects, dict) or project_id not in projects:
            return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "项目不存在"})
        project_entry = projects.get(project_id)
        owners = project_entry.get("owners") if isinstance(project_entry, dict) else None
        if not isinstance(owners, list) or user_email not in owners:
            return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": "无项目权限"})
        create_payload = {"project": project_id, "createdBy": user_email}
        if isinstance(note, str) and note.strip():
            create_payload["note"] = note.strip()
        subject_type = "project"
        subject_id = project_id
    else:
        create_payload = {"user": user_email, "createdBy": user_email}
        if isinstance(note, str) and note.strip():
            create_payload["note"] = note.strip()
        subject_type = "user"
        subject_id = user_email

    spaces, spaces_error = await _load_effective_spaces(
        request, subject_type, subject_id
    )
    if spaces_error is not None:
        return spaces_error
    selected_space = (
        next(
            (item for item in spaces or [] if item.get("id") == space_id),
            None,
        )
        if space_id is not None
        else next(
            (item for item in spaces or [] if item.get("isDefault")),
            None,
        )
    )
    if selected_space is None:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": (
                    "该主体未获得所选服务空间的使用权限"
                    if space_id is not None
                    else "平台默认服务空间不可用"
                )
            },
        )
    space_id = selected_space["id"]
    if not selected_space.get("available"):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": (
                    "所选服务空间当前不可用："
                    f"{selected_space.get('status') or 'unknown'}"
                )
            },
        )
    default_space = next(
        (item for item in spaces or [] if item.get("isDefault")),
        None,
    )
    default_space_id = (
        default_space.get("id") if isinstance(default_space, dict) else None
    )
    owner_field = "project" if owner_type == "project" else "user"
    token_limit = (
        PROJECT_TOKEN_LIMIT if owner_type == "project" else USER_TOKEN_LIMIT
    )
    existing = _count_owner_tokens_in_space(
        tokens,
        owner_field,
        subject_id,
        space_id,
        default_space_id,
    )
    if existing >= token_limit:
        owner_label = "项目" if owner_type == "project" else "个人"
        space_label = selected_space.get("label") or space_id
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": (
                    f"{owner_label}在服务空间 {space_label} 下的 "
                    f"API Key 上限为 {token_limit}"
                )
            },
        )
    create_payload["spaceId"] = space_id

    target_url = _build_target_url("/access", "/tokens")
    headers = _build_headers(request)
    async with httpx.AsyncClient(
        timeout=platform_config.PORTAL_TIMEOUT_SECONDS,
        trust_env=platform_config.PORTAL_TRUST_ENV,
    ) as client:
        upstream = await client.post(target_url, headers=headers, json=create_payload)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )


@router.patch("/user/tokens/{token}/enabled")
async def update_user_token_enabled(
    request: Request,
    token: str,
    user: dict = Depends(get_current_user),
) -> Response:
    error_response = await _ensure_user_token_value_access(request, user, token)
    if error_response is not None:
        return error_response
    target_url = _build_target_url(
        "/access",
        f"/tokens/{token}/enabled",
    )
    return await _proxy_request(request, target_url)


@router.patch("/user/tokens/{token}/note")
async def update_user_token_note(
    request: Request,
    token: str,
    user: dict = Depends(get_current_user),
) -> Response:
    error_response = await _ensure_user_token_value_access(request, user, token)
    if error_response is not None:
        return error_response
    target_url = _build_target_url(
        "/access",
        f"/tokens/{token}/note",
    )
    return await _proxy_request(request, target_url)


@router.delete("/user/tokens/{token}")
async def delete_user_token(
    request: Request,
    token: str,
    user: dict = Depends(get_current_user),
) -> Response:
    error_response = await _ensure_user_token_value_access(request, user, token)
    if error_response is not None:
        return error_response
    target_url = _build_target_url("/access", f"/tokens/{token}")
    return await _proxy_request(request, target_url)


@router.post("/user/diagnostics/tokens/{token_id}/activate")
async def activate_user_token_diagnostics(
    request: Request,
    token_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    _, error_response = await _ensure_user_token_access(
        request,
        user,
        token_id,
        require_diagnostics_authorized=True,
    )
    if error_response is not None:
        return error_response
    target_url = _build_target_url("/diagnostics", f"/tokens/{token_id}/activate")
    return await _proxy_request(request, target_url)


@router.post("/user/diagnostics/tokens/{token_id}/deactivate")
async def deactivate_user_token_diagnostics(
    request: Request,
    token_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    _, error_response = await _ensure_user_token_access(
        request,
        user,
        token_id,
        require_diagnostics_authorized=True,
    )
    if error_response is not None:
        return error_response
    target_url = _build_target_url("/diagnostics", f"/tokens/{token_id}/deactivate")
    return await _proxy_request(request, target_url)


@router.get("/user/diagnostics/logs")
async def get_user_diagnostics_logs(
    request: Request,
    token_id: str = Query(..., alias="tokenId"),
    range_value: str | None = Query(None, alias="range"),
    limit: int | None = Query(None, alias="limit"),
    event: str | None = Query(None, alias="event"),
    user: dict = Depends(get_current_user),
) -> Response:
    _, error_response = await _ensure_user_token_access(
        request,
        user,
        token_id,
        require_diagnostics_authorized=True,
    )
    if error_response is not None:
        return error_response
    params: dict[str, str] = {"token_id": token_id}
    if range_value:
        params["range"] = range_value
    if limit is not None:
        params["limit"] = str(limit)
    if event:
        params["event"] = event
    target_url = _build_target_url("/diagnostics", "/logs")
    status_code, payload = await _fetch_json_with_params(request, target_url, params, method="GET")
    return JSONResponse(status_code=status_code, content=payload)


__all__ = ["router"]
