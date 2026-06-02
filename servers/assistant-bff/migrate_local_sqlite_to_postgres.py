#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.base_config import model_config
from app.storage import business_store


KERNEL_HISTORY_PREFIX = "llm_kernel:gptassistant:"


def _candidate_source_paths() -> list[Path]:
    data_dir = Path(model_config.FILE_BASE) / "gptassistant"
    return [
        data_dir / "business-dev.db",
        data_dir / "pins.db",
        Path(__file__).resolve().parent / "app.db",
    ]


def _sqlite_table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return row is not None


def _sqlite_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {
        str(row["name"])
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _load_sqlite_rows(conn: sqlite3.Connection, table_name: str) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(f"SELECT * FROM {table_name}").fetchall()]


def _normalize_history_payload(value: Any) -> list[Any]:
    if isinstance(value, str):
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            return []
        return payload if isinstance(payload, list) else []
    if isinstance(value, list):
        return value
    return []


def _normalize_timestamp(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _strip_kernel_prefix(conversation_id: str) -> tuple[str, str]:
    if conversation_id.startswith(KERNEL_HISTORY_PREFIX):
        return conversation_id[len(KERNEL_HISTORY_PREFIX):], "gptassistant"
    return conversation_id, ""


def _upsert_session_history_row(
    conn,
    *,
    table_name: str,
    conversation_id: str,
    history_payload: str,
    updated_at: str,
    dry_run: bool,
) -> None:
    if dry_run:
        return
    conn.execute(
        f"""
        INSERT INTO {table_name}(conversation_id, history, updated_at)
        VALUES (%s, %s::jsonb, %s::timestamptz)
        ON CONFLICT (conversation_id) DO UPDATE
           SET history=EXCLUDED.history,
               updated_at=EXCLUDED.updated_at
         WHERE {table_name}.updated_at IS NULL
            OR {table_name}.updated_at < EXCLUDED.updated_at
        """,
        (conversation_id, history_payload, updated_at),
    )


def _upsert_session_meta_row(
    conn,
    *,
    conversation_id: str,
    user_id: str,
    user_email: str,
    gid: str,
    title: str,
    created_at: str,
    updated_at: str,
    dry_run: bool,
) -> None:
    if dry_run:
        return
    conn.execute(
        """
        INSERT INTO session_history_meta(
            conversation_id, user_id, user_email, gid, title, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz)
        ON CONFLICT (conversation_id) DO UPDATE
           SET user_id=EXCLUDED.user_id,
               user_email=EXCLUDED.user_email,
               gid=EXCLUDED.gid,
               title=CASE
                   WHEN COALESCE(EXCLUDED.title, '') <> '' THEN EXCLUDED.title
                   ELSE session_history_meta.title
               END,
               updated_at=EXCLUDED.updated_at
         WHERE session_history_meta.updated_at IS NULL
            OR session_history_meta.updated_at < EXCLUDED.updated_at
        """,
        (conversation_id, user_id, user_email, gid, title, created_at, updated_at),
    )


def _migrate_session_history_tables(
    source_path: Path,
    target_conn,
    *,
    dry_run: bool,
) -> dict[str, int]:
    summary = {
        "session_history_rows": 0,
        "session_history_client_rows": 0,
        "session_history_meta_rows": 0,
        "session_history_meta_backfilled": 0,
    }
    source_conn = sqlite3.connect(source_path)
    source_conn.row_factory = sqlite3.Row
    try:
        source_mtime = source_path.stat().st_mtime
        fallback_timestamp = datetime.fromtimestamp(
            source_mtime,
            tz=timezone.utc,
        ).isoformat()

        if _sqlite_table_exists(source_conn, "session_history"):
            columns = _sqlite_columns(source_conn, "session_history")
            identity_index = business_store._merged_session_identity_index()
            source_meta_rows: dict[str, dict[str, Any]] = {}
            if _sqlite_table_exists(source_conn, "session_history_meta"):
                for row in _load_sqlite_rows(source_conn, "session_history_meta"):
                    source_meta_rows[str(row.get("conversation_id") or "")] = row

            for row in _load_sqlite_rows(source_conn, "session_history"):
                conversation_id = str(row.get("conversation_id") or "").strip()
                if not conversation_id:
                    continue
                history_payload = row.get("history")
                updated_at = _normalize_timestamp(row.get("updated_at") if "updated_at" in columns else None, fallback_timestamp)
                normalized_history = _normalize_history_payload(history_payload)
                _upsert_session_history_row(
                    target_conn,
                    table_name="session_history",
                    conversation_id=conversation_id,
                    history_payload=business_store._encode_history_payload(normalized_history),
                    updated_at=updated_at,
                    dry_run=dry_run,
                )
                summary["session_history_rows"] += 1

                source_meta = source_meta_rows.get(conversation_id)
                if source_meta:
                    _upsert_session_meta_row(
                        target_conn,
                        conversation_id=conversation_id,
                        user_id=str(source_meta.get("user_id") or "").strip(),
                        user_email=str(source_meta.get("user_email") or "").strip(),
                        gid=str(source_meta.get("gid") or "gptassistant").strip() or "gptassistant",
                        title=str(source_meta.get("title") or "").strip(),
                        created_at=_normalize_timestamp(source_meta.get("created_at"), updated_at),
                        updated_at=_normalize_timestamp(source_meta.get("updated_at"), updated_at),
                        dry_run=dry_run,
                    )
                    summary["session_history_meta_rows"] += 1
                    continue

                base_conversation_id, inferred_gid = _strip_kernel_prefix(conversation_id)
                identity = identity_index.get(base_conversation_id)
                if not identity:
                    continue
                title = business_store._derive_session_title_from_history(normalized_history)
                if not title:
                    title = base_conversation_id
                _upsert_session_meta_row(
                    target_conn,
                    conversation_id=base_conversation_id,
                    user_id=str(identity.get("user_id") or "").strip(),
                    user_email=str(identity.get("user_email") or "").strip(),
                    gid=inferred_gid or str(identity.get("gid") or "gptassistant").strip() or "gptassistant",
                    title=title,
                    created_at=updated_at,
                    updated_at=updated_at,
                    dry_run=dry_run,
                )
                summary["session_history_meta_backfilled"] += 1

        if _sqlite_table_exists(source_conn, "session_history_client"):
            columns = _sqlite_columns(source_conn, "session_history_client")
            for row in _load_sqlite_rows(source_conn, "session_history_client"):
                conversation_id = str(row.get("conversation_id") or "").strip()
                if not conversation_id:
                    continue
                updated_at = _normalize_timestamp(row.get("updated_at") if "updated_at" in columns else None, fallback_timestamp)
                normalized_history = _normalize_history_payload(row.get("history"))
                _upsert_session_history_row(
                    target_conn,
                    table_name="session_history_client",
                    conversation_id=conversation_id,
                    history_payload=business_store._encode_history_payload(normalized_history),
                    updated_at=updated_at,
                    dry_run=dry_run,
                )
                summary["session_history_client_rows"] += 1
    finally:
        source_conn.close()

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate local sqlite session history into Postgres business storage.",
    )
    parser.add_argument(
        "--source-db",
        action="append",
        dest="source_dbs",
        help="Path to a source sqlite database. Can be repeated.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect source rows and print counts without writing to Postgres.",
    )
    args = parser.parse_args()

    if not model_config.POSTGRES_DSN.strip():
        raise RuntimeError("POSTGRES_DSN is required")
    if not model_config.SESSION_HISTORY_ENCRYPTION_KEY.strip():
        raise RuntimeError("SESSION_HISTORY_ENCRYPTION_KEY is required")

    try:
        import psycopg
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("psycopg is required to run this migration script") from exc

    source_paths = [Path(item).expanduser().resolve() for item in (args.source_dbs or [])]
    if not source_paths:
        source_paths = [path.resolve() for path in _candidate_source_paths() if path.exists()]
    else:
        source_paths = [path for path in source_paths if path.exists()]

    if not source_paths:
        print("No sqlite source database found; nothing to migrate.")
        return 0

    original_backend = model_config.BUSINESS_STORAGE_BACKEND
    model_config.BUSINESS_STORAGE_BACKEND = "postgres"
    business_store._INITIALIZED = False
    business_store.init_business_storage()

    totals = {
        "session_history_rows": 0,
        "session_history_client_rows": 0,
        "session_history_meta_rows": 0,
        "session_history_meta_backfilled": 0,
    }

    try:
        with psycopg.connect(model_config.POSTGRES_DSN) as target_conn:
            for source_path in source_paths:
                summary = _migrate_session_history_tables(
                    source_path,
                    target_conn,
                    dry_run=args.dry_run,
                )
                if not args.dry_run:
                    target_conn.commit()
                print(
                    f"[migrated] source={source_path} "
                    f"session_history={summary['session_history_rows']} "
                    f"session_history_client={summary['session_history_client_rows']} "
                    f"source_meta={summary['session_history_meta_rows']} "
                    f"backfilled_meta={summary['session_history_meta_backfilled']}"
                )
                for key, value in summary.items():
                    totals[key] += value
    finally:
        model_config.BUSINESS_STORAGE_BACKEND = original_backend
        business_store._INITIALIZED = False

    print(
        "[done] "
        f"session_history={totals['session_history_rows']} "
        f"session_history_client={totals['session_history_client_rows']} "
        f"source_meta={totals['session_history_meta_rows']} "
        f"backfilled_meta={totals['session_history_meta_backfilled']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
