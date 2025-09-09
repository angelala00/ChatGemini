import os
import sqlite3
from fastapi import APIRouter, Header, HTTPException, Request

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pins.db")

# Version configuration
CONFIG_VERSION = "v0.10.0"
# GPTS that should be automatically pinned for new versions
DEFAULT_PIN_GPTS = "g4"

FAKE_GPTS = [
    {
        "id": "g1",
        "name": "SQL助手",
        "desc": "处理 SQL 相关问题",
        "samples": [
            {
                "title": "查询销量前十的商品",
                "description": "示例 SQL",
                "prompt": "查询销量前十的商品",
            },
            {
                "title": "统计每日新增用户",
                "description": "示例 SQL",
                "prompt": "统计每日新增用户数量",
            },
        ],
    },
    {
        "id": "g2",
        "name": "报表生成器",
        "desc": "自动生成数据报表",
        "samples": [
            {
                "title": "生成季度销售报表",
                "description": "示例报表",
                "prompt": "生成季度销售报表",
            },
            {
                "title": "制作库存汇总表",
                "description": "示例报表",
                "prompt": "制作库存汇总表",
            },
        ],
    },
    {
        "id": "g3",
        "name": "法务审查",
        "desc": "快速审查合同条款",
        "samples": [
            {
                "title": "审查合同风险",
                "description": "发现潜在风险",
                "prompt": "审查合同中的潜在风险",
            },
            {
                "title": "检查保密条款",
                "description": "关注关键条款",
                "prompt": "检查合同中的保密条款",
            },
        ],
    },
    {
        "id": "g4",
        "name": "市场分析",
        "desc": "洞察市场趋势",
        "samples": [
            {
                "title": "分析竞争对手",
                "description": "市场调研",
                "prompt": "分析主要竞争对手的市场份额",
            },
            {
                "title": "预测产品需求",
                "description": "趋势分析",
                "prompt": "预测下季度产品需求",
            },
        ],
    },
    {
        "id": "g5",
        "name": "ECharts 画图助手",
        "desc": "用 ECharts 绘制可视化图表",
        "logo": "/gpts/echarts.svg",
        "samples": [
            {
                "title": "绘制饼图",
                "description": "展示分类占比",
                "prompt": "使用ECharts绘制销售占比饼图",
            },
            {
                "title": "生成折线图",
                "description": "展示趋势",
                "prompt": "使用ECharts生成月度趋势折线图",
            },
        ],
    },
    {
        "id": "g6",
        "name": "PPT 大纲生成助手",
        "desc": "自动生成演示文稿大纲",
        "logo": "/gpts/ppt.svg",
        "samples": [
            {
                "title": "创业计划书大纲",
                "description": "自动生成",
                "prompt": "生成创业计划书PPT大纲",
            },
            {
                "title": "项目汇报大纲",
                "description": "自动生成",
                "prompt": "生成项目汇报PPT大纲",
            },
        ],
    },
    {
        "id": "g7",
        "name": "制度问答助手",
        "desc": "解答制度相关问题",
        "logo": "/gpts/policy.svg",
        "samples": [
            {
                "title": "请假制度",
                "description": "了解公司制度",
                "prompt": "公司请假制度是什么？",
            },
            {
                "title": "报销流程",
                "description": "了解公司制度",
                "prompt": "公司报销流程如何进行？",
            },
        ],
    },
]
ID2GPTS = {g["id"]: g for g in FAKE_GPTS}
LIMIT_PINNED = 8


def parse_version(v: str) -> tuple[int, ...]:
    """Parse a semantic version string like 'v0.10.0' into a tuple."""
    v = v.lstrip("v")
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return (0,)

HOME_CARDS = {
    "favorites": [
        {
            "icon": "🔍",
            "title": "学术搜索",
            "desc": "检索学术问题和参考文献",
            "from": "来自 Kimi",
        },
        {
            "icon": "📊",
            "title": "PPT 助手",
            "desc": "轻松制作演示文稿",
            "from": "来自 Kimi",
        },
        {
            "icon": "💼",
            "title": "Kimi 专业版",
            "desc": "更精准的搜索助手",
            "from": "来自 Kimi",
        },
    ],
    "recommended": [
        {
            "icon": "💡",
            "title": "AI 创意助手",
            "desc": "激发灵感的创作工具",
            "from": "来自 Kimi",
        },
        {
            "icon": "📚",
            "title": "知识问答",
            "desc": "快速获取专业答案",
            "from": "来自 Kimi",
        },
    ],
}

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
            CREATE TABLE IF NOT EXISTS user_config_version (
              user_id TEXT PRIMARY KEY,
              version TEXT NOT NULL
            );
            """
        )
    finally:
        conn.close()


init_db()


def require_user(uid: str | None) -> str:
    """Return a user id or fall back to a default demo user."""
    return uid or "demo-user"


@router.get("/gpts/home")
def get_home_cards():
    return HOME_CARDS

@router.patch("/gpts/{gpts_id}/pin")
async def toggle_pin(gpts_id: str, request: Request, x_user_id: str | None = Header(None)):
    """Pin or unpin a GPTS for the current user."""
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

    return {"is_pinned": is_pinned}


@router.get("/gpts/pined")
def get_sidebar(x_user_id: str | None = Header(None)):
    """Return pinned GPTS for the current user."""
    user_id = require_user(x_user_id)
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
               ORDER BY pinned_at
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
            pinned.append({"gid": gid, "name": g["name"], "logo": g.get("logo", "")})
    return pinned


@router.get("/gpts")
def list_gpts(x_user_id: str | None = Header(None), query: str | None = None):
    """Return all available GPTS with their pinned status."""
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
    for index, g in enumerate(FAKE_GPTS):
        if query and query.lower() not in g["name"].lower():
            continue
        items.append(
            {
                "gid": g["id"],
                "name": g["name"],
                "sub_title": g.get("desc", ""),
                "logo": g.get("logo", ""),
                "is_pinned": g["id"] in pinned_ids,
                "index": index,
            }
        )
    return items


@router.get("/gpts/detail/{gpts_id}")
def get_gpts_detail(gpts_id: str, x_user_id: str | None = Header(None)):
    """Return detail of a single GPTS by id."""
    require_user(x_user_id)  # Ensure DB initialisation for this user
    gpts = ID2GPTS.get(gpts_id)
    if not gpts:
        raise HTTPException(404, "GPTS not found or not visible")

    return {
        "gid": gpts_id,
        "title": gpts["name"],
        "name": gpts["name"],
        "sub_title": gpts.get("desc", ""),
        "samples": gpts.get("samples", []),
        "logo": gpts.get("logo", ""),
        "file_upload_enabled": True,
        "default_model": "mock-model",
        "models": ["mock-model"],
    }
