from __future__ import annotations

import importlib
import json
from typing import Any


class _LazyCore:
    def __getattr__(self, name: str):
        module = importlib.import_module("app.storage.business_store")
        return getattr(module, name)


_core = _LazyCore()


def load_custom_gpts() -> dict[str, dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        rows = conn.execute("SELECT gid, config, assistant_kind, handler_key FROM agents").fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _core._normalize_row(row)
        payload = item.get("config")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                continue
        if isinstance(payload, dict):
            normalized = _core._normalize_custom_gpt_payload(payload)
            assistant_kind = str(item.get("assistant_kind") or "").strip()
            handler_key = str(item.get("handler_key") or "").strip()
            if assistant_kind:
                normalized["assistant_kind"] = assistant_kind
            if handler_key:
                normalized["handler_key"] = handler_key
            if str(item["gid"]) == "regulationassistant":
                defaults = _core._regulation_acl_defaults()
                normalized["owner"] = str(normalized.get("owner") or defaults["owner"] or "").strip()
                normalized["admins"] = _core._normalize_identity_list(normalized.get("admins")) or defaults["admins"]
                normalized["viewers"] = _core._normalize_identity_list(normalized.get("viewers")) or defaults["viewers"]
            result[str(item["gid"])] = normalized
    return result


def insert_custom_gpt(gid: str, config: dict[str, Any]) -> None:
    _core.ensure_initialized()
    payload = json.dumps(config, ensure_ascii=False)
    metadata = _core._custom_gpt_metadata_from_config(config)
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO agents(gid, config, assistant_kind, handler_key)
                VALUES(%s, %s::jsonb, %s, %s)
                """,
                (gid, payload, metadata["assistant_kind"], metadata["handler_key"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO agents(gid, config, assistant_kind, handler_key)
                VALUES(?, ?, ?, ?)
                """,
                (gid, payload, metadata["assistant_kind"], metadata["handler_key"]),
            )
        conn.commit()


def update_custom_gpt(gid: str, config: dict[str, Any]) -> None:
    _core.ensure_initialized()
    payload = json.dumps(config, ensure_ascii=False)
    metadata = _core._custom_gpt_metadata_from_config(config)
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                UPDATE agents
                   SET config=%s::jsonb,
                       assistant_kind=%s,
                       handler_key=%s
                 WHERE gid=%s
                """,
                (payload, metadata["assistant_kind"], metadata["handler_key"], gid),
            )
        else:
            conn.execute(
                """
                UPDATE agents
                   SET config=?,
                       assistant_kind=?,
                       handler_key=?
                 WHERE gid=?
                """,
                (payload, metadata["assistant_kind"], metadata["handler_key"], gid),
            )
        conn.commit()


def delete_custom_gpt(gid: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute("DELETE FROM agents WHERE gid=%s", (gid,))
        else:
            conn.execute("DELETE FROM agents WHERE gid=?", (gid,))
        conn.commit()


def list_user_gpt_pin_states(user_id: str) -> dict[str, dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            rows = conn.execute(
                """
                SELECT gpts_id, is_pinned, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=%s
                """,
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT gpts_id, is_pinned, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=?
                """,
                (user_id,),
            ).fetchall()
    states: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _core._normalize_row(row)
        gid = str(item.get("gpts_id") or "").strip()
        if not gid:
            continue
        states[gid] = {
            "is_pinned": _core._coerce_bool(item.get("is_pinned")),
            "pinned_at": str(item.get("pinned_at") or ""),
        }
    return states


def list_pinned_gids(user_id: str) -> set[str]:
    return {
        gid
        for gid, state in list_user_gpt_pin_states(user_id).items()
        if bool(state.get("is_pinned"))
    }


def is_gpt_pinned(user_id: str, gid: str) -> bool:
    state = list_user_gpt_pin_states(user_id).get(gid)
    return bool(state and state.get("is_pinned"))


def set_user_gpt_pin(user_id: str, gid: str, *, is_pinned: bool) -> None:
    _core.ensure_initialized()
    pinned_at = _core._now_iso()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO user_gpts_state(user_id, gpts_id, is_pinned, pinned_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, gpts_id) DO UPDATE SET
                    is_pinned=EXCLUDED.is_pinned,
                    pinned_at=EXCLUDED.pinned_at
                """,
                (user_id, gid, bool(is_pinned), pinned_at),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_gpts_state(user_id, gpts_id, is_pinned, pinned_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, gpts_id) DO UPDATE SET
                    is_pinned=excluded.is_pinned,
                    pinned_at=excluded.pinned_at
                """,
                (user_id, gid, 1 if is_pinned else 0, pinned_at),
            )
        conn.commit()


def list_user_pinned_rows(user_id: str) -> list[dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            rows = conn.execute(
                """
                SELECT gpts_id, is_pinned, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=%s AND is_pinned=TRUE
                 ORDER BY pinned_at ASC
                """,
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT gpts_id, is_pinned, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=? AND is_pinned=1
                 ORDER BY pinned_at ASC
                """,
                (user_id,),
            ).fetchall()
    return [_core._normalize_row(row) for row in rows]


def get_user_config_version(user_id: str) -> str | None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            row = conn.execute(
                "SELECT version FROM user_config_version WHERE user_id=%s",
                (user_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT version FROM user_config_version WHERE user_id=?",
                (user_id,),
            ).fetchone()
    if not row:
        return None
    return str(_core._normalize_row(row).get("version") or "")


def set_user_config_version(user_id: str, version: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO user_config_version(user_id, version)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE SET version=EXCLUDED.version
                """,
                (user_id, version),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_config_version(user_id, version)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET version=excluded.version
                """,
                (user_id, version),
            )
        conn.commit()


def delete_user_gpt_state_by_gid(gid: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute("DELETE FROM user_gpts_state WHERE gpts_id=%s", (gid,))
        else:
            conn.execute("DELETE FROM user_gpts_state WHERE gpts_id=?", (gid,))
        conn.commit()
