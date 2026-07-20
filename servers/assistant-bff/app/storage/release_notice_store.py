from __future__ import annotations

from typing import Any

from app.storage import business_store as _core


def list_user_release_notice_states(user_id: str) -> dict[str, int]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            rows = conn.execute(
                """
                SELECT release_id, seen_stage
                  FROM user_release_notice_state
                 WHERE user_id=%s
                """,
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT release_id, seen_stage
                  FROM user_release_notice_state
                 WHERE user_id=?
                """,
                (user_id,),
            ).fetchall()

    states: dict[str, int] = {}
    for row in rows:
        item: dict[str, Any] = _core._normalize_row(row)
        release_id = str(item.get("release_id") or "").strip()
        if release_id:
            states[release_id] = max(0, min(3, int(item.get("seen_stage") or 0)))
    return states


def advance_user_release_notice_stage(
    user_id: str,
    release_id: str,
    seen_stage: int,
) -> int:
    _core.ensure_initialized()
    updated_at = _core._now_iso()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO user_release_notice_state(user_id, release_id, seen_stage, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, release_id) DO UPDATE SET
                    seen_stage=GREATEST(user_release_notice_state.seen_stage, EXCLUDED.seen_stage),
                    updated_at=CASE
                        WHEN EXCLUDED.seen_stage > user_release_notice_state.seen_stage
                        THEN EXCLUDED.updated_at
                        ELSE user_release_notice_state.updated_at
                    END
                """,
                (user_id, release_id, seen_stage, updated_at),
            )
            row = conn.execute(
                """
                SELECT seen_stage
                  FROM user_release_notice_state
                 WHERE user_id=%s AND release_id=%s
                """,
                (user_id, release_id),
            ).fetchone()
        else:
            conn.execute(
                """
                INSERT INTO user_release_notice_state(user_id, release_id, seen_stage, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, release_id) DO UPDATE SET
                    seen_stage=MAX(user_release_notice_state.seen_stage, excluded.seen_stage),
                    updated_at=CASE
                        WHEN excluded.seen_stage > user_release_notice_state.seen_stage
                        THEN excluded.updated_at
                        ELSE user_release_notice_state.updated_at
                    END
                """,
                (user_id, release_id, seen_stage, updated_at),
            )
            row = conn.execute(
                """
                SELECT seen_stage
                  FROM user_release_notice_state
                 WHERE user_id=? AND release_id=?
                """,
                (user_id, release_id),
            ).fetchone()
        conn.commit()

    item = _core._normalize_row(row)
    return max(0, min(3, int(item.get("seen_stage") or 0)))
