import time
import json
import uuid
from typing import Tuple, Optional
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, fetch_gpts, refresh_gpts, BUILTIN_GIDS
from app.gpts.model_metadata import resolve_model_configs
from app.db import get_db
from app.base_config import model_config

router = APIRouter(prefix="/api", tags=["gpts"])

LIMIT_PINNED = 8
MAX_SAMPLES = 5

GPTS_WHITE_LIST = model_config.GPTS_WHITE_LIST


def is_gpts_feature_allowed(user: dict) -> bool:
    if not model_config.GPTS_FEATURE_ENABLED:
        return False
    if not GPTS_WHITE_LIST:
        return True
    return user.get("email") in GPTS_WHITE_LIST or user.get("sub") in GPTS_WHITE_LIST


def ensure_gpts_feature_allowed(user: dict) -> None:
    if not is_gpts_feature_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GPTS feature not enabled")


def is_required_pinned_gid(gid: str) -> bool:
    gpt = gpts.get(gid)
    return bool(gpt and gpt.get("required_pinned"))


def get_required_pinned_gids() -> tuple[str, ...]:
    return tuple(
        gid
        for gid, gpt in gpts.items()
        if isinstance(gpt, dict) and gpt.get("required_pinned")
    )


def ensure_required_pinned_gpts(conn, user_id: str) -> None:
    for gid in get_required_pinned_gids():
        conn.execute(
            """INSERT OR IGNORE INTO user_gpts_state(user_id, gpts_id, pinned_at)
                 VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
            (user_id, gid),
        )


def is_gpt_pinned_for_user(user_id: str, gid: str) -> bool:
    conn = get_db()
    try:
        if is_required_pinned_gid(gid):
            ensure_required_pinned_gpts(conn, user_id)
        row = conn.execute(
            "SELECT 1 FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
            (user_id, gid),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def can_access_gpt(user: dict, gid: str) -> bool:
    if gid == "gptassistant":
        return True
    if is_gpts_feature_allowed(user):
        return True
    user_id = user.get("sub")
    if not user_id:
        return False
    return is_gpt_pinned_for_user(user_id, gid)


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
    return {"allowed": is_gpts_feature_allowed(user)}


def init_db():
    conn = get_db()
    try:
        conn.executescript(
            """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS user_gpts_state (
              user_id   TEXT NOT NULL,
              gpts_id   TEXT NOT NULL,
              pinned_at TEXT NOT NULL,
              PRIMARY KEY (user_id, gpts_id)
            );
            CREATE INDEX IF NOT EXISTS idx_user_pinned
              ON user_gpts_state(user_id, pinned_at DESC);
            CREATE TABLE IF NOT EXISTS user_config_version (
              user_id TEXT PRIMARY KEY,
              version TEXT NOT NULL
            );
            """
        )
    finally:
        conn.close()


init_db()


@router.get("/gpts")
async def get_gpts(user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    gpt_logger.info(f"path=get_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    conn = get_db()
    try:
        pinned_ids = {
            r["gpts_id"]
            for r in conn.execute(
                "SELECT gpts_id FROM user_gpts_state WHERE user_id=?",
                (user['sub'],),
            ).fetchall()
        }
    finally:
        conn.close()

    gpts_list = [{"gid": key, **{k: v for k, v in value.items() if k not in {"system_prompt", "model_name", "auth"}},
                  "is_pinned": key in pinned_ids or is_required_pinned_gid(key),
                  "is_required_pinned": is_required_pinned_gid(key)} for key, value in fetch_gpts().items() if
                 auth_ok(value, user['email'], user['sub']) and key != 'gptassistant']
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

    conn = get_db()

    try:
        if is_pinned:
            conn.execute(
                "DELETE FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
                (user['sub'], gid),
            )
            conn.execute(
                """INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                   VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                (user['sub'], gid),
            )
        else:
            conn.execute(
                "DELETE FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
                (user['sub'], gid),
            )
    finally:
        conn.close()

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
    conn = get_db()
    try:
        cfg = conn.execute(
            "SELECT version FROM user_config_version WHERE user_id=?",
            (user_id,),
        ).fetchone()
        need_init = True
        if cfg:
            need_init = parse_version(cfg["version"]) < parse_version(CONFIG_VERSION)
        if need_init:
            ensure_required_pinned_gpts(conn, user_id)
            conn.execute(
                """INSERT OR REPLACE INTO user_config_version(user_id, version)
                     VALUES(?, ?)""",
                (user_id, CONFIG_VERSION),
            )
        ensure_required_pinned_gpts(conn, user_id)
        rows = conn.execute(
            """SELECT gpts_id, pinned_at
               FROM user_gpts_state
               WHERE user_id=?
               ORDER BY pinned_at ASC""",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    pinned = []
    required_gids = set(get_required_pinned_gids())
    for index, r in enumerate(rows):
        gid = r["gpts_id"]
        g = gpts.get(gid)
        if g and auth_ok(g, user_email, user_id):
            item = {
                "gid": gid,
                "name": g.get("name") or g.get("title") or gid,
                "is_required_pinned": is_required_pinned_gid(gid),
                "_order": index,
            }
            if "logo" in g:
                item["logo"] = g["logo"]
            pinned.append(item)
    pinned.sort(key=lambda item: (0 if item["gid"] in required_gids else 1, item["_order"]))
    for item in pinned:
        item.pop("_order", None)
    return pinned[:LIMIT_PINNED]


@router.get("/gpts/created")
async def gpts_created(user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    gpt_logger.info(f"path=gpts_created user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    created = []
    for gid, data in gpts.items():
        if gid in BUILTIN_GIDS:
            continue
        if data.get("owner") != user['sub']:
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

    gpt_item = gpts[gid]
    if not auth_ok(gpt_item, user['email'], user['sub']):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")

    exclude_fields = {"model_name"}
    if gpt_item.get("owner") != user['sub']:
        exclude_fields.update({"system_prompt", "auth"})

    gpts_detail = {k: v for k, v in gpt_item.items() if k not in exclude_fields}
    if isinstance(gpts_detail.get("models"), list):
        visible_models = sanitize_models_for_detail(gpts_detail["models"], user["email"], user["sub"])
        visible_models = await resolve_model_configs(visible_models)
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


@router.post("/gpts")
async def create_gpt(request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
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
    auth = body.get("auth", {"type": "all"})
    if auth.get("type") == "white":
        users = auth.get("user", [])
        if not isinstance(users, list) or any(not isinstance(u, str) for u in users):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "auth.user must be list of strings")
    elif auth.get("type") not in {"all", "self"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid auth type")
    body["auth"] = auth
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO custom_gpts(gid, config) VALUES(?, ?)",
            (gid, json.dumps(body)),
        )
    finally:
        conn.close()
    refresh_gpts()
    return {"gid": gid}


@router.put("/gpts/{gid}")
async def update_gpt(gid: str, request: Request, user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    refresh_gpts()
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be modified")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if gpts[gid].get("owner") != user['sub']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    body = await request.json()
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
    conn = get_db()
    try:
        conn.execute(
            "UPDATE custom_gpts SET config=? WHERE gid=?",
            (json.dumps(body), gid),
        )
    finally:
        conn.close()
    refresh_gpts()
    return {"gid": gid}


@router.delete("/gpts/{gid}")
async def delete_gpt(gid: str, user: dict = Depends(get_current_user)):
    ensure_gpts_feature_allowed(user)
    refresh_gpts()
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be deleted")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if gpts[gid].get("owner") != user['sub']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    conn = get_db()
    try:
        conn.execute("DELETE FROM custom_gpts WHERE gid=?", (gid,))
        conn.execute("DELETE FROM user_gpts_state WHERE gpts_id=?", (gid,))
    finally:
        conn.close()
    refresh_gpts()
    return {"gid": gid}


def auth_ok(gpt_dict: dict, user: str, user_id: Optional[str] = None):
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
