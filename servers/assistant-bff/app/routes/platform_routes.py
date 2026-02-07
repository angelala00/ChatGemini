from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
import httpx

from app.base_config import platform_config
from app.auth.auth_routes import get_current_user


router = APIRouter(prefix="/api/platform", tags=["platform"])
USER_TOKEN_LIMIT = 2
PROJECT_TOKEN_LIMIT = 5


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
    return await _proxy_request(request, target_url)


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
    user_email = _get_user_email(user)
    target_url = _build_target_url("/access", "/db")
    status_code, payload = await _fetch_json(request, target_url)
    if status_code >= 400:
        return JSONResponse(status_code=status_code, content=payload)

    payload, error_response = await _ensure_user_registered(request, user, payload)
    if error_response is not None:
        return error_response

    users = payload.get("users") if isinstance(payload, dict) else None
    projects = payload.get("projects") if isinstance(payload, dict) else None
    tokens = payload.get("tokens") if isinstance(payload, dict) else None
    if not isinstance(users, dict) or not isinstance(tokens, dict):
        return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": "上游返回数据缺失"})

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

    token_entries = []
    enabled = False
    for token_value, entry in tokens.items():
        if not isinstance(entry, dict):
            continue
        if entry.get("user") == user_email:
            token_entries.append(
                {
                    "token": token_value,
                    "enabled": bool(entry.get("enabled", True)),
                    "ownerType": "user",
                }
            )
        elif isinstance(entry.get("project"), str) and entry.get("project") in owned_projects:
            project_id = entry.get("project")
            token_entries.append(
                {
                    "token": token_value,
                    "enabled": bool(entry.get("enabled", True)),
                    "ownerType": "project",
                    "projectId": project_id,
                    "projectName": owned_projects.get(project_id, {}).get("name") or project_id,
                }
            )
        if token_entries and token_entries[-1].get("enabled"):
            enabled = True

    project_list = [
        {
            "id": project_id,
            "name": entry.get("name") or project_id,
            "department": entry.get("department"),
        }
        for project_id, entry in owned_projects.items()
        if isinstance(entry, dict)
    ]

    return JSONResponse(
        content={
            "id": user_email,
            "displayName": display_name,
            "enabled": enabled,
            "isAdmin": False,
            "tokenCount": len(token_entries),
            "tokens": token_entries,
            "projects": project_list,
            "limits": {"userMax": USER_TOKEN_LIMIT, "projectMax": PROJECT_TOKEN_LIMIT},
        }
    )


@router.post("/user/tokens")
async def create_user_token(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    user_email = _get_user_email(user)
    payload = await request.json()
    owner_type = payload.get("ownerType")
    project_id = payload.get("projectId")

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
        existing = sum(
            1
            for entry in tokens.values()
            if isinstance(entry, dict) and entry.get("project") == project_id
        )
        if existing >= PROJECT_TOKEN_LIMIT:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": f"项目 API Key 上限为 {PROJECT_TOKEN_LIMIT}"},
            )
        create_payload = {"project": project_id, "createdBy": user_email}
    else:
        existing = sum(
            1
            for entry in tokens.values()
            if isinstance(entry, dict) and entry.get("user") == user_email
        )
        if existing >= USER_TOKEN_LIMIT:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": f"个人 API Key 上限为 {USER_TOKEN_LIMIT}"},
            )
        create_payload = {"user": user_email, "createdBy": user_email}

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
    _get_user_email(user)
    target_url = _build_target_url(
        "/access",
        f"/tokens/{token}/enabled",
    )
    return await _proxy_request(request, target_url)


__all__ = ["router"]
