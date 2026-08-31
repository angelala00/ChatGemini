# 接入 bff 统一登录（SSO）指南

适用于与 assistant-bff 同域部署的后端子应用：应用自己不做登录，而是复用 assistant-bff 持有的 SSO 会话来识别用户。

本文档描述 `/api/auth/*` 认证接口的对外接入方式；登录回跳机制的完整契约见 `servers/assistant-bff/app/AGENTS.md` 2.3（共享登录 returnTo 回跳契约）。

## 原理

浏览器的登录会话（cookie）由 assistant-bff 持有。子应用后端收到请求后，把浏览器的 `cookie`、`user-agent`、`x-forwarded-for` 三个 header 原样转发给 bff 的 `/api/auth/userinfo`，bff 校验会话并返回当前用户信息。前端无需单独登录。

```
浏览器 ──(带 cookie)──> 子应用后端 ──(透传 cookie/UA/IP)──> bff /api/auth/userinfo
                                          │
                                          └── 返回用户信息 (sub/name/email/group/...)
```

## 接入步骤

### 1. 配置上游地址

环境变量 `ASSISTANT_BFF_URL`，默认 `http://127.0.0.1:5008`。

### 2. 实现请求头透传 helper

除 cookie 外，还必须透传 `user-agent` 和 `x-forwarded-for`：bff 会依据它们（客户端环境/来源 IP）选择返回的 provider 配置。只带 cookie 时 bff 看到的是后端服务的 httpx 默认 UA 和后端机器 IP，可能导致 provider 获取不符合预期。

```python
from fastapi import Request

def build_bff_headers(request: Request) -> dict[str, str]:
    headers: dict[str, str] = {"cookie": request.headers.get("cookie", "")}

    user_agent = request.headers.get("user-agent")
    if user_agent:
        headers["user-agent"] = user_agent

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for and request.client is not None:
        # 无代理直连时回填客户端 IP，让 bff 仍能看到真实来源
        forwarded_for = request.client.host
    if forwarded_for:
        headers["x-forwarded-for"] = forwarded_for

    return headers
```

### 3. 实现获取当前用户的函数

核心逻辑（FastAPI 示例）：

```python
import os
import httpx
from fastapi import HTTPException, Request

ASSISTANT_BFF_URL = os.getenv("ASSISTANT_BFF_URL", "http://127.0.0.1:5008")

async def get_current_user(request: Request) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{ASSISTANT_BFF_URL}/api/auth/userinfo",
                headers=build_bff_headers(request),  # 透传 cookie / user-agent / x-forwarded-for
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"认证服务不可达: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="未登录或 Session 已过期")

    user = resp.json()
    return {
        "sub": user.get("sub", ""),
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        "group": user.get("group", ""),
    }
```

之后把它挂为路由依赖即可：`@router.get("/api/xxx", dependencies=[Depends(get_current_user)])`。

### 4. （可选）暴露前端登录态检查代理

子应用如需让前端检查登录态，可暴露自己的 `GET /api/auth/status`：转发透传 header 调 bff 的 `/api/auth/userinfo`，200 时返回 `{authenticated, sub, name, email, group, auth_provider}`，非 200 原样透传状态码。注意这是**子应用自己的接口**，与 bff 自身的 `/api/auth/status`（仅返回 `{"name"}`）不是同一个东西。

**不要**在子应用里再代理 `get-provider` / `oauth-login` 来拼前端登录跳转——登录跳转已统一走 assistant-web 承载的 `/login` 页面（见下节）。

## 前端登录跳转（returnTo 回跳契约）

前端遇 401 时不要丢弃当前路径，统一整页跳转 assistant-web 承载的登录页：

```
{ASSISTANT_BFF_URL}/login?returnTo=<encodeURIComponent(pathname+search+hash)>
```

- 登录页 base：assistant-web 自身用同源 base path 拼；其他子应用用与后端同名的前端变量 `ASSISTANT_BFF_URL`（构建时注入，空则回退同源）。该地址需同时承载 assistant-web 页面（同域反代保证）。
- 子应用统一使用同款 helper `src/helpers/loginRedirect.ts`（`buildReturnTo` / `markLoginRetry` / `consumeLoginRetry` / `redirectToLoginIfPossible`）。
- 登录页负责查登录态、解析 provider 并转发到 `/api/auth/oauth-login/{provider}?returnTo=`，登录完成后由后端 302 回原页面；子应用前端无需任何恢复逻辑。
- 死循环保护：跳转前写一次性 sessionStorage 标记 `sso.loginRetry`，重试仍未登录则展示无权限态，不再跳转。

完整契约见 `servers/assistant-bff/app/AGENTS.md` 2.3。

## userinfo 返回字段

bff 返回 200 时，body 包含：

| 字段 | 说明 |
| --- | --- |
| `sub` | 用户唯一标识（登录态唯一键） |
| `email` | 用户邮箱（权限白名单等逻辑基于它） |
| `name` | 显示名（与 `/api/auth/status` 返回的 name 同源） |
| `group` | 用户组（LDAP DN） |
| `auth_provider` | 登录方式（OAuth provider 名） |

## 注意事项

- **透传 `user-agent` 和 `x-forwarded-for`**，不要只带 cookie（原因见步骤 2）。
- **不要自己解析/校验 cookie**，只做原样透传，会话校验完全交给 bff。
- bff 返回非 200 统一按“未登录”处理（返回 401 给前端）；网络异常返回 502。
- 上游调用设置超时（如 5s），避免拖垮自身请求。
- `sub` 是用户唯一标识；`email` 用于权限白名单等业务逻辑，两者不要混用。

## 当前实现状态（截至 2026-08）

- bff 侧 `get_current_user`（`app/auth/auth_login_token.py`）目前为 **mock 实现**，返回固定测试用户，尚未真正校验 SSO session/token；内网生产 OAuth 落地时需替换该依赖，接口契约保持不变。
- `oauth-login/{provider}`、`oauth-callback/{provider}` 同为 mock（会用 Referer origin 拼绝对地址以兼容前后端不同端口的本地开发）；生产实现须按 AGENTS.md 2.3 携带并校验 returnTo。
