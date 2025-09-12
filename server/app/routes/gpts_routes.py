import os
import time
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, fetch_gpts
import sqlite3
from typing import Tuple

DATA_DIR = os.path.join("/", "data/appFiles/gptassistant/")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pins.db")

router = APIRouter(prefix="/api", tags=["gpts"])

LIMIT_PINNED = 8


def get_db():
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


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
                 auth_ok(value, user['email']) and key != 'gptassistant']
    return gpts_list


@router.patch("/gpts/{gid}/pin")
async def toggle_pin(gid: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    is_pinned = bool(body.get("is_pinned"))

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
        if g and auth_ok(g, user['email']):
            if "logo" in g:
                pinned.append({"gid": gid, "name": g["name"], "logo": g["logo"]})
            else:
                pinned.append({"gid": gid, "name": g["name"]})
    return pinned


@router.get("/gpts/detail/{gid}")
async def get_gpts_detail(gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_gpts_detail user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    if not auth_ok(gpts[gid], user['email']):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    gpts_detail = {k: v for k, v in gpts[gid].items() if k not in {"system_prompt", "model_name", "auth"}}
    return gpts_detail


def auth_ok(gpt_dict: dict, user: str):
    if gpt_dict['auth']['type'] == "all":
        return True
    if gpt_dict['auth']['type'] == "white":
        if user in gpt_dict['auth']['user']:
            return True
    return False
