import os
import sqlite3
from fastapi import APIRouter, Header, HTTPException, Request

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pins.db")

FAKE_GPTS = [
    {"id": "g1", "name": "SQL助手"},
    {"id": "g2", "name": "报表生成器"},
    {"id": "g3", "name": "法务审查"},
    {"id": "g4", "name": "市场分析"},
]
ID2GPTS = {g["id"]: g for g in FAKE_GPTS}
LIMIT_PINNED = 8

router = APIRouter()

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
            """
        )
    finally:
        conn.close()

init_db()

def require_user(uid: str | None) -> str:
    if not uid:
        raise HTTPException(401, "Missing X-User-ID")
    return uid

@router.patch("/gpts/{gpts_id}/pin")
async def toggle_pin(gpts_id: str, request: Request, x_user_id: str | None = Header(None)):
    user_id = require_user(x_user_id)
    body = await request.json()
    is_pinned = bool(body.get("is_pinned"))

    if gpts_id not in ID2GPTS:
        raise HTTPException(404, "GPTS not found or not visible")

    conn = get_db()
    try:
        if is_pinned:
            conn.execute(
                """INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                   VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                   ON CONFLICT(user_id, gpts_id) DO UPDATE SET
                     pinned_at=excluded.pinned_at""",
                (user_id, gpts_id),
            )
        else:
            conn.execute(
                "DELETE FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
                (user_id, gpts_id),
            )
    finally:
        conn.close()

    return {"gpts_id": gpts_id, "is_pinned": is_pinned}

@router.get("/sidebar")
def get_sidebar(x_user_id: str | None = Header(None)):
    user_id = require_user(x_user_id)
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT gpts_id, pinned_at
               FROM user_gpts_state
               WHERE user_id=?
               ORDER BY pinned_at DESC
               LIMIT ?""",
            (user_id, LIMIT_PINNED),
        ).fetchall()
    finally:
        conn.close()

    pinned = []
    for r in rows:
        gid = r["gpts_id"]
        g = ID2GPTS.get(gid)
        if g:
            pinned.append({"id": gid, "name": g["name"]})
    return {"pinned": pinned, "limits": {"pinned": LIMIT_PINNED}}

@router.get("/gpts")
def list_gpts(x_user_id: str | None = Header(None), query: str | None = None):
    user_id = require_user(x_user_id)
    conn = get_db()
    try:
        pinned_ids = {
            r["gpts_id"]
            for r in conn.execute(
                "SELECT gpts_id FROM user_gpts_state WHERE user_id=?",
                (user_id,),
            ).fetchall()
        }
    finally:
        conn.close()

    items = []
    for g in FAKE_GPTS:
        if query and query.lower() not in g["name"].lower():
            continue
        items.append({**g, "is_pinned": g["id"] in pinned_ids})
    return {"items": items}
