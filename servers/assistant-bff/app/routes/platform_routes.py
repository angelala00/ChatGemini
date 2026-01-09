from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
import httpx

from app.base_config import platform_config
from app.auth.auth_routes import get_current_user


router = APIRouter(prefix="/api/platform", tags=["platform"])


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
    async with httpx.AsyncClient(timeout=platform_config.PORTAL_TIMEOUT_SECONDS) as client:
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


async def _fetch_json(request: Request, target_url: str) -> tuple[int, dict]:
    headers = _build_headers(request)
    async with httpx.AsyncClient(timeout=platform_config.PORTAL_TIMEOUT_SECONDS) as client:
        upstream = await client.request(
            request.method,
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


@router.api_route("/gateway/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_gateway(request: Request, path: str) -> Response:
    target_url = _build_target_url("/gateway", path)
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
        "/gateway",
        f"/v1/admin/users/{user_email}/visibility",
    )
    return await _proxy_request(request, target_url)


@router.get("/user/usage")
async def get_user_usage(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    user_email = _get_user_email(user)
    target_url = _build_target_url(
        "/metrics",
        f"/rankings/users/{user_email}/models",
    )
    return await _proxy_request(request, target_url)


@router.get("/user/api-keys")
async def get_user_api_keys(
    request: Request,
    user: dict = Depends(get_current_user),
) -> JSONResponse:
    user_email = _get_user_email(user)
    target_url = _build_target_url("/gateway", "/v1/admin/users")
    status_code, payload = await _fetch_json(request, target_url)
    if status_code >= 400:
        return JSONResponse(status_code=status_code, content=payload)

    users = payload.get("users")
    if isinstance(users, list):
        for entry in users:
            if isinstance(entry, dict) and entry.get("name") == user_email:
                return JSONResponse(content=entry)

    return JSONResponse(
        content={
            "name": user_email,
            "enabled": False,
            "isAdmin": False,
            "tokenCount": 0,
            "tokens": [],
        }
    )


__all__ = ["router"]
