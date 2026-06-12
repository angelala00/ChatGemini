#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth.auth_routes import DEFAULT_AUTH_PROVIDER
from app.base_config import model_config
from app.storage import business_store
from app.storage import object_store


KERNEL_HISTORY_PREFIX = "llm_kernel:gptassistant:"
PROGRESS_EVERY = 100
BATCH_SIZE = 500
OBJECT_MIGRATION_STATE_STATUS_COMPLETED = "completed"
OBJECT_MIGRATION_STATE_STATUS_MISSING = "missing"


def _log(message: str) -> None:
    print(message, flush=True)


def _migration_node_id() -> str:
    return model_config.SQLITE_MIGRATION_NODE_ID.strip()


def _candidate_source_paths() -> list[Path]:
    return business_store.sqlite_business_source_paths()


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


def _iter_sqlite_rows(conn: sqlite3.Connection, table_name: str):
    for row in conn.execute(f"SELECT * FROM {table_name}"):
        yield dict(row)


def _sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    return [
        str(row["name"])
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    ]


def _sqlite_table_count(conn: sqlite3.Connection, table_name: str) -> int:
    row = conn.execute(f"SELECT COUNT(*) AS total FROM {table_name}").fetchone()
    return int(row["total"] or 0)


def _source_fingerprint(source_path: Path) -> tuple[int, int, str]:
    stat = source_path.stat()
    digest = hashlib.sha256()
    with source_path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return int(stat.st_size), int(stat.st_mtime_ns), digest.hexdigest()


def _ensure_migration_state_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sqlite_migration_state (
          node_id TEXT NOT NULL,
          source_path TEXT PRIMARY KEY,
          source_size BIGINT NOT NULL,
          source_mtime_ns BIGINT NOT NULL,
          source_sha256 TEXT,
          completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          summary JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    conn.execute("ALTER TABLE sqlite_migration_state ADD COLUMN IF NOT EXISTS node_id TEXT")
    conn.execute("ALTER TABLE sqlite_migration_state ADD COLUMN IF NOT EXISTS source_sha256 TEXT")
    conn.execute(
        """
        UPDATE sqlite_migration_state
           SET node_id=%s
         WHERE node_id IS NULL OR node_id=''
        """,
        (_migration_node_id(),),
    )
    row = conn.execute(
        """
        SELECT 1
          FROM information_schema.table_constraints
         WHERE table_name='sqlite_migration_state'
           AND constraint_type='PRIMARY KEY'
           AND constraint_name='sqlite_migration_state_pkey'
        """
    ).fetchone()
    if row:
        conn.execute("ALTER TABLE sqlite_migration_state DROP CONSTRAINT sqlite_migration_state_pkey")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sqlite_migration_state_node_source
          ON sqlite_migration_state(node_id, source_path)
        """
    )
    conn.execute(
        """
        DO $$
        BEGIN
          ALTER TABLE sqlite_migration_state
            ADD CONSTRAINT sqlite_migration_state_pkey PRIMARY KEY
            USING INDEX idx_sqlite_migration_state_node_source;
        EXCEPTION
          WHEN duplicate_table THEN NULL;
          WHEN duplicate_object THEN NULL;
        END $$;
        """
    )


def _ensure_object_migration_state_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS file_object_migration_state (
          node_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          source_path TEXT NOT NULL,
          source_size BIGINT,
          source_mtime_ns BIGINT,
          source_sha256 TEXT,
          status TEXT NOT NULL,
          target_bucket TEXT NOT NULL DEFAULT '',
          target_object_key TEXT NOT NULL DEFAULT '',
          completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          error TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (node_id, file_id)
        )
        """
    )


def _is_source_already_migrated(conn, source_path: Path) -> bool:
    source_size, source_mtime_ns, source_sha256 = _source_fingerprint(source_path)
    row = conn.execute(
        """
        SELECT source_size, source_mtime_ns, source_sha256
          FROM sqlite_migration_state
         WHERE node_id=%s AND source_path=%s
        """,
        (_migration_node_id(), str(source_path)),
    ).fetchone()
    if not row:
        return False
    if row[2]:
        return str(row[2]) == source_sha256
    return (
        int(row[0]) == source_size
        and int(row[1]) == source_mtime_ns
    )


def _mark_source_migrated(conn, source_path: Path, summary: dict[str, int]) -> None:
    source_size, source_mtime_ns, source_sha256 = _source_fingerprint(source_path)
    conn.execute(
        """
        INSERT INTO sqlite_migration_state(
            node_id, source_path, source_size, source_mtime_ns, source_sha256, completed_at, summary
        ) VALUES (%s, %s, %s, %s, %s, NOW(), %s::jsonb)
        ON CONFLICT (node_id, source_path) DO UPDATE SET
            source_size=EXCLUDED.source_size,
            source_mtime_ns=EXCLUDED.source_mtime_ns,
            source_sha256=EXCLUDED.source_sha256,
            completed_at=EXCLUDED.completed_at,
            summary=EXCLUDED.summary
        """,
        (
            _migration_node_id(),
            str(source_path),
            source_size,
            source_mtime_ns,
            source_sha256,
            json.dumps(summary, ensure_ascii=False),
        ),
    )


def _log_table_progress(source_path: Path, table_name: str, current: int, total: int) -> None:
    if current == 1 or current == total or current % PROGRESS_EVERY == 0:
        _log(f"[migrating] source={source_path} table={table_name} rows={current}/{total}")


def _file_sha256(source_path: Path) -> str:
    digest = hashlib.sha256()
    with source_path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_pg_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return row
    return dict(row)


def _load_object_migration_state(conn, *, file_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT file_id, source_path, source_size, source_mtime_ns, source_sha256,
               status, target_bucket, target_object_key
          FROM file_object_migration_state
         WHERE node_id=%s AND file_id=%s
        """,
        (_migration_node_id(), file_id),
    ).fetchone()
    normalized = _normalize_pg_row(row)
    return normalized or None


def _record_object_migration_state(
    conn,
    *,
    file_id: str,
    source_path: str,
    source_size: int | None,
    source_mtime_ns: int | None,
    source_sha256: str | None,
    status: str,
    target_bucket: str = "",
    target_object_key: str = "",
    error: str = "",
) -> None:
    conn.execute(
        """
        INSERT INTO file_object_migration_state(
            node_id, file_id, source_path, source_size, source_mtime_ns, source_sha256,
            status, target_bucket, target_object_key, completed_at, error
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
        ON CONFLICT (node_id, file_id) DO UPDATE SET
            source_path=EXCLUDED.source_path,
            source_size=EXCLUDED.source_size,
            source_mtime_ns=EXCLUDED.source_mtime_ns,
            source_sha256=EXCLUDED.source_sha256,
            status=EXCLUDED.status,
            target_bucket=EXCLUDED.target_bucket,
            target_object_key=EXCLUDED.target_object_key,
            completed_at=EXCLUDED.completed_at,
            error=EXCLUDED.error
        """,
        (
            _migration_node_id(),
            file_id,
            source_path,
            source_size,
            source_mtime_ns,
            source_sha256,
            status,
            target_bucket,
            target_object_key,
            error[:500],
        ),
    )


def _same_object_state(
    state: dict[str, Any] | None,
    *,
    source_path: str,
    source_size: int | None,
    source_mtime_ns: int | None,
) -> bool:
    if not state:
        return False
    return (
        str(state.get("source_path") or "") == source_path
        and int(state.get("source_size") or -1) == int(source_size if source_size is not None else -1)
        and int(state.get("source_mtime_ns") or -1) == int(source_mtime_ns if source_mtime_ns is not None else -1)
    )


def _inspect_source_db(source_path: Path) -> None:
    source_conn = sqlite3.connect(source_path)
    source_conn.row_factory = sqlite3.Row
    try:
        print(f"[inspect] source={source_path}")
        tables = _sqlite_tables(source_conn)
        if not tables:
            print("[inspect] tables=(none)")
            return
        for table_name in tables:
            columns = sorted(_sqlite_columns(source_conn, table_name))
            count = _sqlite_table_count(source_conn, table_name)
            print(
                f"[inspect] table={table_name} rows={count} "
                f"columns={','.join(columns)}"
            )
    finally:
        source_conn.close()


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


def _flush_session_history_batch(
    conn,
    *,
    table_name: str,
    rows: list[tuple[str, str, str]],
    dry_run: bool,
) -> None:
    if dry_run or not rows:
        rows.clear()
        return
    with conn.cursor() as cursor:
        cursor.executemany(
            f"""
            INSERT INTO {table_name}(conversation_id, history, updated_at)
            VALUES (%s, %s::jsonb, %s::timestamptz)
            ON CONFLICT (conversation_id) DO UPDATE
               SET history=EXCLUDED.history,
                   updated_at=EXCLUDED.updated_at
             WHERE {table_name}.updated_at IS NULL
                OR {table_name}.updated_at < EXCLUDED.updated_at
            """,
            rows,
        )
    rows.clear()


def _flush_session_meta_batch(
    conn,
    *,
    rows: list[tuple[str, str, str, str, str, str, str, str]],
    dry_run: bool,
) -> None:
    if dry_run or not rows:
        rows.clear()
        return
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO session_history_meta(
                conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz)
            ON CONFLICT (conversation_id) DO UPDATE
               SET user_id=EXCLUDED.user_id,
                   user_email=EXCLUDED.user_email,
                   auth_provider=EXCLUDED.auth_provider,
                   gid=EXCLUDED.gid,
                   title=CASE
                       WHEN COALESCE(EXCLUDED.title, '') <> '' THEN EXCLUDED.title
                       ELSE session_history_meta.title
                   END,
                   updated_at=EXCLUDED.updated_at
             WHERE session_history_meta.updated_at IS NULL
                OR session_history_meta.updated_at < EXCLUDED.updated_at
            """,
            rows,
        )
    rows.clear()


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
    history_batch: list[tuple[str, str, str]] = []
    history_client_batch: list[tuple[str, str, str]] = []
    meta_batch: list[tuple[str, str, str, str, str, str, str, str]] = []
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
            source_meta_columns: set[str] = set()
            if _sqlite_table_exists(source_conn, "session_history_meta"):
                source_meta_columns = _sqlite_columns(source_conn, "session_history_meta")
                for row in _load_sqlite_rows(source_conn, "session_history_meta"):
                    source_meta_rows[str(row.get("conversation_id") or "")] = row

            total_rows = _sqlite_table_count(source_conn, "session_history")
            _log(f"[migrating] source={source_path} table=session_history rows=0/{total_rows}")
            for row in _iter_sqlite_rows(source_conn, "session_history"):
                _log_table_progress(source_path, "session_history", summary["session_history_rows"] + 1, total_rows)
                conversation_id = str(row.get("conversation_id") or "").strip()
                if not conversation_id:
                    continue
                history_payload = row.get("history")
                updated_at = _normalize_timestamp(row.get("updated_at") if "updated_at" in columns else None, fallback_timestamp)
                normalized_history = _normalize_history_payload(history_payload)
                history_batch.append(
                    (
                        conversation_id,
                        business_store._encode_history_payload(normalized_history),
                        updated_at,
                    )
                )
                if len(history_batch) >= BATCH_SIZE:
                    _flush_session_history_batch(
                        target_conn,
                        table_name="session_history",
                        rows=history_batch,
                        dry_run=dry_run,
                    )
                summary["session_history_rows"] += 1

                source_meta = source_meta_rows.get(conversation_id)
                if source_meta:
                    meta_batch.append(
                        (
                            conversation_id,
                            str(source_meta.get("user_id") or "").strip(),
                            str(source_meta.get("user_email") or "").strip(),
                            (
                                str(source_meta.get("auth_provider") or "").strip()
                                if "auth_provider" in source_meta_columns
                                else ""
                            ) or DEFAULT_AUTH_PROVIDER,
                            str(source_meta.get("gid") or "gptassistant").strip() or "gptassistant",
                            str(source_meta.get("title") or "").strip(),
                            _normalize_timestamp(source_meta.get("created_at"), updated_at),
                            _normalize_timestamp(source_meta.get("updated_at"), updated_at),
                        )
                    )
                    if len(meta_batch) >= BATCH_SIZE:
                        _flush_session_meta_batch(target_conn, rows=meta_batch, dry_run=dry_run)
                    summary["session_history_meta_rows"] += 1
                    continue

                base_conversation_id, inferred_gid = _strip_kernel_prefix(conversation_id)
                identity = identity_index.get(base_conversation_id)
                if not identity:
                    continue
                title = business_store._derive_session_title_from_history(normalized_history)
                if not title:
                    title = base_conversation_id
                meta_batch.append(
                    (
                        base_conversation_id,
                        str(identity.get("user_id") or "").strip(),
                        str(identity.get("user_email") or "").strip(),
                        DEFAULT_AUTH_PROVIDER,
                        inferred_gid or str(identity.get("gid") or "gptassistant").strip() or "gptassistant",
                        title,
                        updated_at,
                        updated_at,
                    )
                )
                if len(meta_batch) >= BATCH_SIZE:
                    _flush_session_meta_batch(target_conn, rows=meta_batch, dry_run=dry_run)
                summary["session_history_meta_backfilled"] += 1
            _flush_session_history_batch(
                target_conn,
                table_name="session_history",
                rows=history_batch,
                dry_run=dry_run,
            )
            _flush_session_meta_batch(target_conn, rows=meta_batch, dry_run=dry_run)

        if _sqlite_table_exists(source_conn, "session_history_client"):
            columns = _sqlite_columns(source_conn, "session_history_client")
            total_rows = _sqlite_table_count(source_conn, "session_history_client")
            _log(f"[migrating] source={source_path} table=session_history_client rows=0/{total_rows}")
            for row in _iter_sqlite_rows(source_conn, "session_history_client"):
                _log_table_progress(
                    source_path,
                    "session_history_client",
                    summary["session_history_client_rows"] + 1,
                    total_rows,
                )
                conversation_id = str(row.get("conversation_id") or "").strip()
                if not conversation_id:
                    continue
                updated_at = _normalize_timestamp(row.get("updated_at") if "updated_at" in columns else None, fallback_timestamp)
                normalized_history = _normalize_history_payload(row.get("history"))
                history_client_batch.append(
                    (
                        conversation_id,
                        business_store._encode_history_payload(normalized_history),
                        updated_at,
                    )
                )
                if len(history_client_batch) >= BATCH_SIZE:
                    _flush_session_history_batch(
                        target_conn,
                        table_name="session_history_client",
                        rows=history_client_batch,
                        dry_run=dry_run,
                    )
                summary["session_history_client_rows"] += 1
            _flush_session_history_batch(
                target_conn,
                table_name="session_history_client",
                rows=history_client_batch,
                dry_run=dry_run,
            )
    finally:
        source_conn.close()

    return summary


def _migrate_file_mapping_table(
    source_path: Path,
    target_conn,
    *,
    dry_run: bool,
) -> dict[str, int]:
    summary = {
        "file_mapping_rows": 0,
        "file_mapping_inserted": 0,
        "file_mapping_skipped": 0,
    }
    source_conn = sqlite3.connect(source_path)
    source_conn.row_factory = sqlite3.Row
    try:
        if not _sqlite_table_exists(source_conn, "file_mapping"):
            return summary
        columns = _sqlite_columns(source_conn, "file_mapping")
        if not (
            business_store.FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns)
            or business_store.LEGACY_FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns)
        ):
            print(
                f"[skipped] source={source_path} table=file_mapping "
                f"reason=unsupported_columns columns={','.join(sorted(columns))}"
            )
            return summary
        total_rows = _sqlite_table_count(source_conn, "file_mapping")
        _log(f"[migrating] source={source_path} table=file_mapping rows=0/{total_rows}")
        for row in _iter_sqlite_rows(source_conn, "file_mapping"):
            summary["file_mapping_rows"] += 1
            _log_table_progress(source_path, "file_mapping", summary["file_mapping_rows"], total_rows)
            normalized = business_store._normalize_sqlite_file_mapping_row(row, columns)
            if normalized is None:
                summary["file_mapping_skipped"] += 1
                continue
            if dry_run:
                continue
            result = target_conn.execute(
                """
                INSERT INTO file_mapping(
                    file_id, filename, file_extension, content_type, bucket,
                    object_key, storage_backend, size_bytes, upload_time, gid,
                    owner_user_id, owner_user_email
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s)
                ON CONFLICT (file_id) DO NOTHING
                RETURNING file_id
                """,
                (
                    normalized.get("file_id"),
                    normalized.get("filename"),
                    normalized.get("file_extension"),
                    normalized.get("content_type"),
                    normalized.get("bucket"),
                    normalized.get("object_key"),
                    normalized.get("storage_backend"),
                    normalized.get("size_bytes"),
                    normalized.get("upload_time") or datetime.now(timezone.utc).isoformat(),
                    normalized.get("gid") or "gptassistant",
                    normalized.get("owner_user_id"),
                    normalized.get("owner_user_email"),
                ),
            ).fetchone()
            if result:
                summary["file_mapping_inserted"] += 1
            else:
                summary["file_mapping_skipped"] += 1
    finally:
        source_conn.close()
    return summary


def _flush_custom_gpts_batch(
    conn,
    *,
    rows: list[tuple[str, str]],
    dry_run: bool,
) -> None:
    if dry_run or not rows:
        rows.clear()
        return
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO custom_gpts(gid, config)
            VALUES (%s, %s::jsonb)
            ON CONFLICT (gid) DO UPDATE SET config=EXCLUDED.config
            """,
            rows,
        )
    rows.clear()


def _flush_user_gpts_state_batch(
    conn,
    *,
    rows: list[tuple[str, str, str]],
    dry_run: bool,
) -> None:
    if dry_run or not rows:
        rows.clear()
        return
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
            VALUES (%s, %s, %s::timestamptz)
            ON CONFLICT (user_id, gpts_id) DO NOTHING
            """,
            rows,
        )
    rows.clear()


def _flush_user_config_version_batch(
    conn,
    *,
    rows: list[tuple[str, str]],
    dry_run: bool,
) -> None:
    if dry_run or not rows:
        rows.clear()
        return
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO user_config_version(user_id, version)
            VALUES (%s, %s)
            ON CONFLICT (user_id) DO UPDATE SET version=EXCLUDED.version
            """,
            rows,
        )
    rows.clear()


def _migrate_light_business_tables(
    source_path: Path,
    target_conn,
    *,
    dry_run: bool,
) -> dict[str, int]:
    summary = {
        "custom_gpts": 0,
        "user_gpts_state": 0,
        "user_config_version": 0,
    }
    source_conn = sqlite3.connect(source_path)
    source_conn.row_factory = sqlite3.Row
    custom_gpts_batch: list[tuple[str, str]] = []
    user_gpts_state_batch: list[tuple[str, str, str]] = []
    user_config_version_batch: list[tuple[str, str]] = []
    try:
        if _sqlite_table_exists(source_conn, "custom_gpts"):
            total_rows = _sqlite_table_count(source_conn, "custom_gpts")
            _log(f"[migrating] source={source_path} table=custom_gpts rows=0/{total_rows}")
            for row in _iter_sqlite_rows(source_conn, "custom_gpts"):
                gid = str(row.get("gid") or "").strip()
                config = row.get("config")
                if not gid or not isinstance(config, str) or not config.strip():
                    continue
                summary["custom_gpts"] += 1
                _log_table_progress(source_path, "custom_gpts", summary["custom_gpts"], total_rows)
                custom_gpts_batch.append((gid, config))
                if len(custom_gpts_batch) >= BATCH_SIZE:
                    _flush_custom_gpts_batch(target_conn, rows=custom_gpts_batch, dry_run=dry_run)
            _flush_custom_gpts_batch(target_conn, rows=custom_gpts_batch, dry_run=dry_run)

        if _sqlite_table_exists(source_conn, "user_gpts_state"):
            total_rows = _sqlite_table_count(source_conn, "user_gpts_state")
            _log(f"[migrating] source={source_path} table=user_gpts_state rows=0/{total_rows}")
            for row in _iter_sqlite_rows(source_conn, "user_gpts_state"):
                user_id = str(row.get("user_id") or "").strip()
                gpts_id = str(row.get("gpts_id") or "").strip()
                pinned_at = str(row.get("pinned_at") or "").strip() or datetime.now(timezone.utc).isoformat()
                if not user_id or not gpts_id:
                    continue
                summary["user_gpts_state"] += 1
                _log_table_progress(source_path, "user_gpts_state", summary["user_gpts_state"], total_rows)
                user_gpts_state_batch.append((user_id, gpts_id, pinned_at))
                if len(user_gpts_state_batch) >= BATCH_SIZE:
                    _flush_user_gpts_state_batch(target_conn, rows=user_gpts_state_batch, dry_run=dry_run)
            _flush_user_gpts_state_batch(target_conn, rows=user_gpts_state_batch, dry_run=dry_run)

        if _sqlite_table_exists(source_conn, "user_config_version"):
            total_rows = _sqlite_table_count(source_conn, "user_config_version")
            _log(f"[migrating] source={source_path} table=user_config_version rows=0/{total_rows}")
            for row in _iter_sqlite_rows(source_conn, "user_config_version"):
                user_id = str(row.get("user_id") or "").strip()
                version = str(row.get("version") or "").strip()
                if not user_id or not version:
                    continue
                summary["user_config_version"] += 1
                _log_table_progress(source_path, "user_config_version", summary["user_config_version"], total_rows)
                user_config_version_batch.append((user_id, version))
                if len(user_config_version_batch) >= BATCH_SIZE:
                    _flush_user_config_version_batch(
                        target_conn,
                        rows=user_config_version_batch,
                        dry_run=dry_run,
                    )
            _flush_user_config_version_batch(target_conn, rows=user_config_version_batch, dry_run=dry_run)
    finally:
        source_conn.close()
    return summary


def _migrate_filesystem_objects_to_minio(
    target_conn,
    *,
    dry_run: bool,
) -> dict[str, int]:
    summary = {
        "object_rows": 0,
        "object_uploaded": 0,
        "object_relinked": 0,
        "object_skipped": 0,
        "object_missing": 0,
    }
    if model_config.OBJECT_STORAGE_BACKEND != "minio":
        return summary

    _ensure_object_migration_state_table(target_conn)
    last_file_id = ""
    while True:
        rows = target_conn.execute(
            """
            SELECT file_id, filename, file_extension, content_type, bucket, object_key,
                   storage_backend, size_bytes, upload_time
              FROM file_mapping
             WHERE storage_backend='filesystem'
               AND file_id > %s
             ORDER BY file_id
             LIMIT %s
            """,
            (last_file_id, BATCH_SIZE),
        ).fetchall()
        if not rows:
            break

        for row in rows:
            item = _normalize_pg_row(row)
            file_id = str(item.get("file_id") or "").strip()
            if not file_id:
                continue
            last_file_id = file_id
            summary["object_rows"] += 1
            if summary["object_rows"] == 1 or summary["object_rows"] % PROGRESS_EVERY == 0:
                _log(
                    f"[migrating] table=file_objects rows={summary['object_rows']} "
                    f"file_id={file_id}"
                )

            source_path = str(item.get("object_key") or "").strip()
            if not source_path:
                summary["object_skipped"] += 1
                continue

            source = Path(source_path)
            state = _load_object_migration_state(target_conn, file_id=file_id)
            if not source.exists():
                if state and _same_object_state(
                    state,
                    source_path=source_path,
                    source_size=None,
                    source_mtime_ns=None,
                ) and str(state.get("status") or "") == OBJECT_MIGRATION_STATE_STATUS_MISSING:
                    summary["object_missing"] += 1
                    continue
                if not dry_run:
                    _record_object_migration_state(
                        target_conn,
                        file_id=file_id,
                        source_path=source_path,
                        source_size=None,
                        source_mtime_ns=None,
                        source_sha256=None,
                        status=OBJECT_MIGRATION_STATE_STATUS_MISSING,
                        error="source file missing",
                    )
                summary["object_missing"] += 1
                continue

            stat = source.stat()
            source_size = int(stat.st_size)
            source_mtime_ns = int(stat.st_mtime_ns)
            if state and _same_object_state(
                state,
                source_path=source_path,
                source_size=source_size,
                source_mtime_ns=source_mtime_ns,
            ) and str(state.get("status") or "") == OBJECT_MIGRATION_STATE_STATUS_COMPLETED:
                target_bucket = str(state.get("target_bucket") or "")
                target_object_key = str(state.get("target_object_key") or "")
                if target_bucket and target_object_key and not dry_run:
                    target_conn.execute(
                        """
                        UPDATE file_mapping
                           SET bucket=%s,
                               object_key=%s,
                               storage_backend='minio',
                               size_bytes=%s
                         WHERE file_id=%s
                        """,
                        (target_bucket, target_object_key, source_size, file_id),
                    )
                summary["object_relinked"] += 1
                continue

            if dry_run:
                summary["object_uploaded"] += 1
                continue

            source_sha256 = _file_sha256(source)
            uploaded = object_store.store_local_file(
                file_id=file_id,
                filename=str(item.get("filename") or file_id),
                source_path=source,
                content_type=str(item.get("content_type") or "").strip() or None,
                upload_time=str(item.get("upload_time") or "").strip() or None,
            )
            target_conn.execute(
                """
                UPDATE file_mapping
                   SET bucket=%s,
                       object_key=%s,
                       storage_backend=%s,
                       size_bytes=%s
                 WHERE file_id=%s
                """,
                (
                    str(uploaded.get("bucket") or ""),
                    str(uploaded.get("object_key") or ""),
                    str(uploaded.get("storage_backend") or "minio"),
                    int(uploaded.get("size_bytes") or source_size),
                    file_id,
                ),
            )
            _record_object_migration_state(
                target_conn,
                file_id=file_id,
                source_path=source_path,
                source_size=source_size,
                source_mtime_ns=source_mtime_ns,
                source_sha256=source_sha256,
                status=OBJECT_MIGRATION_STATE_STATUS_COMPLETED,
                target_bucket=str(uploaded.get("bucket") or ""),
                target_object_key=str(uploaded.get("object_key") or ""),
            )
            summary["object_uploaded"] += 1

        if not dry_run:
            target_conn.commit()

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
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Print sqlite source tables, columns, and row counts without requiring Postgres.",
    )
    args = parser.parse_args()

    source_paths = [Path(item).expanduser().resolve() for item in (args.source_dbs or [])]
    if not source_paths:
        source_paths = [path.resolve() for path in _candidate_source_paths() if path.exists()]
    else:
        source_paths = [path for path in source_paths if path.exists()]

    if not source_paths:
        if model_config.OBJECT_STORAGE_BACKEND != "minio":
            print("No sqlite source database found; nothing to migrate.")
            return 0

    if args.inspect:
        if not source_paths:
            print("[inspect] no sqlite source database found")
        for source_path in source_paths:
            _inspect_source_db(source_path)
        return 0

    if not model_config.POSTGRES_DSN.strip():
        raise RuntimeError("POSTGRES_DSN is required")
    if not _migration_node_id():
        raise RuntimeError("SQLITE_MIGRATION_NODE_ID is required")
    if not model_config.SESSION_HISTORY_ENCRYPTION_KEY.strip():
        raise RuntimeError("SESSION_HISTORY_ENCRYPTION_KEY is required")

    try:
        import psycopg
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("psycopg is required to run this migration script") from exc

    original_backend = model_config.BUSINESS_STORAGE_BACKEND
    original_skip_startup_migration = os.environ.get("ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION")
    model_config.BUSINESS_STORAGE_BACKEND = "postgres"
    os.environ["ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION"] = "1"
    business_store._INITIALIZED = False
    business_store.init_business_storage()

    totals = {
        "session_history_rows": 0,
        "session_history_client_rows": 0,
        "session_history_meta_rows": 0,
        "session_history_meta_backfilled": 0,
        "file_mapping_rows": 0,
        "file_mapping_inserted": 0,
        "file_mapping_skipped": 0,
        "custom_gpts": 0,
        "user_gpts_state": 0,
        "user_config_version": 0,
        "object_rows": 0,
        "object_uploaded": 0,
        "object_relinked": 0,
        "object_skipped": 0,
        "object_missing": 0,
    }

    try:
        with psycopg.connect(model_config.POSTGRES_DSN) as target_conn:
            _ensure_migration_state_table(target_conn)
            if not args.dry_run:
                target_conn.commit()
            for source_path in source_paths:
                if not args.dry_run and _is_source_already_migrated(target_conn, source_path):
                    _log(f"[skipped] source={source_path} reason=already_migrated")
                    continue
                _log(f"[migrating] source={source_path} status=started")
                summary = _migrate_session_history_tables(
                    source_path,
                    target_conn,
                    dry_run=args.dry_run,
                )
                file_mapping_summary = _migrate_file_mapping_table(
                    source_path,
                    target_conn,
                    dry_run=args.dry_run,
                )
                light_business_summary = _migrate_light_business_tables(
                    source_path,
                    target_conn,
                    dry_run=args.dry_run,
                )
                source_total = {
                    **summary,
                    **file_mapping_summary,
                    **light_business_summary,
                }
                if not args.dry_run:
                    _mark_source_migrated(target_conn, source_path, source_total)
                if not args.dry_run:
                    target_conn.commit()
                _log(
                    f"[migrated] source={source_path} "
                    f"session_history={summary['session_history_rows']} "
                    f"session_history_client={summary['session_history_client_rows']} "
                    f"source_meta={summary['session_history_meta_rows']} "
                    f"backfilled_meta={summary['session_history_meta_backfilled']} "
                    f"file_mapping={file_mapping_summary['file_mapping_rows']} "
                    f"file_mapping_inserted={file_mapping_summary['file_mapping_inserted']} "
                    f"file_mapping_skipped={file_mapping_summary['file_mapping_skipped']} "
                    f"custom_gpts={light_business_summary['custom_gpts']} "
                    f"user_gpts_state={light_business_summary['user_gpts_state']} "
                    f"user_config_version={light_business_summary['user_config_version']}"
                )
                for key, value in summary.items():
                    totals[key] += value
                for key, value in file_mapping_summary.items():
                    totals[key] += value
                for key, value in light_business_summary.items():
                    totals[key] += value
            object_summary = _migrate_filesystem_objects_to_minio(
                target_conn,
                dry_run=args.dry_run,
            )
            if object_summary["object_rows"] > 0:
                _log(
                    "[migrated] table=file_objects "
                    f"rows={object_summary['object_rows']} "
                    f"uploaded={object_summary['object_uploaded']} "
                    f"relinked={object_summary['object_relinked']} "
                    f"skipped={object_summary['object_skipped']} "
                    f"missing={object_summary['object_missing']}"
                )
            for key, value in object_summary.items():
                totals[key] += value
    finally:
        model_config.BUSINESS_STORAGE_BACKEND = original_backend
        if original_skip_startup_migration is None:
            os.environ.pop("ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION", None)
        else:
            os.environ["ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION"] = original_skip_startup_migration
        business_store._INITIALIZED = False

    print(
        "[done] "
        f"session_history={totals['session_history_rows']} "
        f"session_history_client={totals['session_history_client_rows']} "
        f"source_meta={totals['session_history_meta_rows']} "
        f"backfilled_meta={totals['session_history_meta_backfilled']} "
        f"file_mapping={totals['file_mapping_rows']} "
        f"file_mapping_inserted={totals['file_mapping_inserted']} "
        f"file_mapping_skipped={totals['file_mapping_skipped']} "
        f"custom_gpts={totals['custom_gpts']} "
        f"user_gpts_state={totals['user_gpts_state']} "
        f"user_config_version={totals['user_config_version']} "
        f"object_rows={totals['object_rows']} "
        f"object_uploaded={totals['object_uploaded']} "
        f"object_relinked={totals['object_relinked']} "
        f"object_skipped={totals['object_skipped']} "
        f"object_missing={totals['object_missing']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
