import time
import json
import uuid
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, fetch_gpts, refresh_gpts, BUILTIN_GIDS
from typing import Tuple, Optional
from app.db import get_db

router = APIRouter(prefix="/api", tags=["gpts"])

LIMIT_PINNED = 8
MAX_SAMPLES = 5


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
                  "is_pinned": key in pinned_ids} for key, value in fetch_gpts().items() if
                 auth_ok(value, user['email'], user['sub']) and key != 'gptassistant']
    return gpts_list


@router.patch("/gpts/{gid}/pin")
async def toggle_pin(gid: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    is_pinned = bool(body.get("is_pinned"))
    refresh_gpts()
    if gid not in gpts:
        raise HTTPException(404, "GPTS not found or not visible")

    conn = get_db()

    try:
        if is_pinned:
            conn.execute(
                """INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                   VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                   ON CONFLICT(user_id, gpts_id) DO UPDATE SET
                     pinned_at=excluded.pinned_at""",
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
# GPTS that should be automatically pinned for new versions
DEFAULT_PIN_GPTS = "regulationassistant"


def parse_version(v: str) -> Tuple[int, ...]:
    """Parse a semantic version string like 'v0.10.0' into a tuple."""
    v = v.lstrip("v")
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return (0,)


@router.get("/gpts/pined")
async def gpts_pined(user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=gpts_pined user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    refresh_gpts()
    conn = get_db()
    user_id = user['sub']
    try:
        cfg = conn.execute(
            "SELECT version FROM user_config_version WHERE user_id=?",
            (user_id,),
        ).fetchone()
        need_init = True
        if cfg:
            need_init = parse_version(cfg["version"]) < parse_version(CONFIG_VERSION)
        if need_init:
            conn.execute(
                """INSERT OR IGNORE INTO user_gpts_state(user_id, gpts_id, pinned_at)
                     VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                (user_id, DEFAULT_PIN_GPTS),
            )
            conn.execute(
                """INSERT INTO user_config_version(user_id, version)
                     VALUES(?, ?)
                     ON CONFLICT(user_id) DO UPDATE SET version=excluded.version""",
                (user_id, CONFIG_VERSION),
            )
        rows = conn.execute(
            """SELECT gpts_id, pinned_at
               FROM user_gpts_state
               WHERE user_id=?
               ORDER BY pinned_at ASC
               LIMIT ?""",
            (user['sub'], LIMIT_PINNED),
        ).fetchall()
    finally:
        conn.close()

    pinned = []
    for r in rows:
        gid = r["gpts_id"]
        g = gpts.get(gid)
        if g and auth_ok(g, user['email'], user['sub']):
            if "logo" in g:
                pinned.append({"gid": gid, "name": g["name"], "logo": g["logo"]})
            else:
                pinned.append({"gid": gid, "name": g["name"]})
    return pinned


@router.get("/gpts/created")
async def gpts_created(user: dict = Depends(get_current_user)):
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

    gpt_item = gpts[gid]
    if not auth_ok(gpt_item, user['email'], user['sub']):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")

    exclude_fields = {"model_name", "auth"}
    if gpt_item.get("owner") != user['sub']:
        exclude_fields.add("system_prompt")

    gpts_detail = {k: v for k, v in gpt_item.items() if k not in exclude_fields}
    return gpts_detail


@router.post("/gpts")
async def create_gpt(request: Request, user: dict = Depends(get_current_user)):
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
    if "auth" not in body:
        body["auth"] = {"type": "all"}
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
    refresh_gpts()
    if gid in BUILTIN_GIDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "builtin gpts cannot be modified")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if gpts[gid].get("owner") != user['sub']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    body = await request.json()
    if "auth" not in body:
        body["auth"] = {"type": "all"}
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
    if gpt_dict['auth']['type'] == "all":
        return True
    if gpt_dict['auth']['type'] == "white":
        if user in gpt_dict['auth']['user']:
            return True
    return False
