from __future__ import annotations

import json
import mimetypes
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Iterator

from app.auth.provider import DEFAULT_AUTH_PROVIDER
from app.base_config import model_config

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:  # pragma: no cover - optional dependency in sqlite dev mode
    psycopg = None
    dict_row = None

try:
    from psycopg_pool import ConnectionPool
except Exception:  # pragma: no cover - optional dependency in sqlite dev mode
    ConnectionPool = None

DATA_DIR = os.path.join("", f"{model_config.FILE_BASE}/gptassistant")
DEV_DB_PATH = os.path.join(DATA_DIR, "business-dev.db")
_INITIALIZED = False
_INITIALIZE_LOCK = Lock()
_FERNET: Any = None
_POSTGRES_POOL: Any = None
_POSTGRES_POOL_DSN = ""
FILE_MAPPING_REQUIRED_COLUMNS = {
    "file_id",
    "filename",
    "file_extension",
    "content_type",
    "bucket",
    "object_key",
    "storage_backend",
    "size_bytes",
    "upload_time",
    "gid",
}
LEGACY_FILE_MAPPING_REQUIRED_COLUMNS = {
    "file_id",
    "filename",
    "fileExtension",
    "path",
    "uploadTime",
}


def sqlite_business_source_paths() -> list[Path]:
    data_dir = Path(model_config.FILE_BASE) / "gptassistant"
    return [
        data_dir / "business-dev.db",
        data_dir / "pins.db",
        Path(__file__).resolve().parents[2] / "app.db",
    ]


def business_storage_backend() -> str:
    return model_config.BUSINESS_STORAGE_BACKEND


def _use_postgres() -> bool:
    return business_storage_backend() == "postgres"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _connect() -> Iterator[Any]:
    if _use_postgres():
        pool = _get_postgres_pool()
        with pool.connection() as conn:
            yield conn
        return
    else:
        os.makedirs(DATA_DIR, exist_ok=True)
        conn = sqlite3.connect(DEV_DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _get_postgres_pool() -> Any:
    global _POSTGRES_POOL, _POSTGRES_POOL_DSN
    if psycopg is None:
        raise RuntimeError("psycopg is required when BUSINESS_STORAGE_BACKEND=postgres")
    if ConnectionPool is None:
        raise RuntimeError("psycopg_pool is required when BUSINESS_STORAGE_BACKEND=postgres")
    dsn = model_config.POSTGRES_DSN
    if not dsn:
        raise RuntimeError("POSTGRES_DSN is required when BUSINESS_STORAGE_BACKEND=postgres")
    if _POSTGRES_POOL is not None and _POSTGRES_POOL_DSN == dsn:
        return _POSTGRES_POOL
    if _POSTGRES_POOL is not None:
        _POSTGRES_POOL.close()
    max_size = max(1, int(model_config.POSTGRES_POOL_MAX_SIZE))
    min_size = max(0, min(int(model_config.POSTGRES_POOL_MIN_SIZE), max_size))
    _POSTGRES_POOL = ConnectionPool(
        conninfo=dsn,
        min_size=min_size,
        max_size=max_size,
        kwargs={"row_factory": dict_row},
    )
    _POSTGRES_POOL_DSN = dsn
    return _POSTGRES_POOL


def close_business_storage() -> None:
    global _POSTGRES_POOL, _POSTGRES_POOL_DSN
    if _POSTGRES_POOL is not None:
        _POSTGRES_POOL.close()
    _POSTGRES_POOL = None
    _POSTGRES_POOL_DSN = ""


def _normalize_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return row
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return dict(row)


def _load_json_field(value: Any, *, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return fallback


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _dump_json_field(value: Any, *, fallback: Any) -> str:
    target = fallback if value is None else value
    return json.dumps(target, ensure_ascii=False)


def _history_encryption_enabled() -> bool:
    return bool(model_config.SESSION_HISTORY_ENCRYPTION_KEY.strip())


def _get_history_fernet() -> Any | None:
    global _FERNET
    if not _history_encryption_enabled():
        return None
    if _FERNET is not None:
        return _FERNET
    try:
        from cryptography.fernet import Fernet
    except Exception as exc:
        raise RuntimeError(
            "cryptography is required when SESSION_HISTORY_ENCRYPTION_KEY is configured"
        ) from exc
    key = model_config.SESSION_HISTORY_ENCRYPTION_KEY.strip().encode("utf-8")
    _FERNET = Fernet(key)
    return _FERNET


def _encode_history_payload(history: list[Any]) -> str:
    payload = json.dumps(history, ensure_ascii=False)
    fernet = _get_history_fernet()
    if fernet is None:
        return payload
    ciphertext = fernet.encrypt(payload.encode("utf-8")).decode("utf-8")
    return json.dumps(
        {
            "__encrypted__": True,
            "alg": "fernet",
            "v": 1,
            "ciphertext": ciphertext,
        },
        ensure_ascii=False,
    )


def _decode_history_payload(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value

    payload: Any = value
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []

    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and payload.get("__encrypted__") is True:
        ciphertext = payload.get("ciphertext")
        if not isinstance(ciphertext, str) or not ciphertext.strip():
            return []
        fernet = _get_history_fernet()
        if fernet is None:
            raise RuntimeError("SESSION_HISTORY_ENCRYPTION_KEY is required to decrypt session history")
        try:
            from cryptography.fernet import InvalidToken
        except Exception as exc:
            raise RuntimeError(
                "cryptography is required when SESSION_HISTORY_ENCRYPTION_KEY is configured"
            ) from exc
        try:
            decrypted = fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise RuntimeError("Failed to decrypt session history with SESSION_HISTORY_ENCRYPTION_KEY") from exc
        try:
            decoded = json.loads(decrypted)
        except json.JSONDecodeError:
            return []
        return decoded if isinstance(decoded, list) else []

    return []


def _normalize_title_text(value: str, *, limit: int = 80) -> str:
    normalized = " ".join((value or "").split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def _extract_message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = _extract_message_text(item)
            if text:
                parts.append(text)
        return " ".join(parts).strip()
    if isinstance(content, dict):
        if isinstance(content.get("text"), str):
            return content["text"].strip()
        if isinstance(content.get("content"), (str, list, dict)):
            return _extract_message_text(content.get("content"))
        return ""
    return ""


def _derive_session_title_from_history(history: list[Any]) -> str:
    for item in history:
        if not isinstance(item, dict):
            continue
        if item.get("role") != "user":
            continue
        text = _extract_message_text(item.get("content"))
        if text:
            return _normalize_title_text(text)
    return ""


def _parse_iso_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _trace_dir_candidates() -> list[Path]:
    candidates: list[Path] = []
    try:
        from app import tracing

        candidates.append(Path(tracing.TRACE_DIR))
    except Exception:
        pass
    return candidates


def _usage_identity_index() -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    try:
        from app.metrics.events import iter_usage_events

        for item in iter_usage_events():
            if not isinstance(item, dict):
                continue
            conversation_id = str(item.get("conversation_id") or "").strip()
            user_id = str(item.get("user_id") or "").strip()
            if not conversation_id or not user_id:
                continue
            existing = index.get(conversation_id)
            started_at = _parse_iso_datetime(item.get("started_at")) or datetime.min.replace(tzinfo=timezone.utc)
            if existing:
                existing_at = _parse_iso_datetime(existing.get("_timestamp")) or datetime.min.replace(tzinfo=timezone.utc)
                if existing_at > started_at:
                    continue
            index[conversation_id] = {
                "user_id": user_id,
                "user_email": str(item.get("user_email") or "").strip(),
                "gid": str(item.get("gid") or "gptassistant").strip() or "gptassistant",
                "_timestamp": started_at.isoformat(),
            }
    except Exception:
        return index
    return index


def _trace_identity_index() -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for trace_dir in _trace_dir_candidates():
        if not trace_dir.exists():
            continue
        for path in trace_dir.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(payload, dict):
                continue
            trace = payload.get("trace")
            if not isinstance(trace, dict):
                continue
            conversation_id = str(trace.get("conversation_id") or "").strip()
            user_id = str(trace.get("user_id") or "").strip()
            if not conversation_id or not user_id:
                continue
            started_at = _parse_iso_datetime(trace.get("started_at")) or datetime.min.replace(tzinfo=timezone.utc)
            existing = index.get(conversation_id)
            if existing:
                existing_at = _parse_iso_datetime(existing.get("_timestamp")) or datetime.min.replace(tzinfo=timezone.utc)
                if existing_at > started_at:
                    continue
            index[conversation_id] = {
                "user_id": user_id,
                "user_email": str(trace.get("user_email") or "").strip(),
                "gid": str(trace.get("gid") or "gptassistant").strip() or "gptassistant",
                "_timestamp": started_at.isoformat(),
            }
    return index


def _merged_session_identity_index() -> dict[str, dict[str, Any]]:
    index = _trace_identity_index()
    for conversation_id, item in _usage_identity_index().items():
        existing = index.get(conversation_id)
        if not existing:
            index[conversation_id] = item
            continue
        existing_at = _parse_iso_datetime(existing.get("_timestamp")) or datetime.min.replace(tzinfo=timezone.utc)
        item_at = _parse_iso_datetime(item.get("_timestamp")) or datetime.min.replace(tzinfo=timezone.utc)
        if item_at >= existing_at:
            index[conversation_id] = item
    return index


def _backfill_session_history_meta_from_existing_history() -> None:
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                """
                SELECT h.conversation_id, h.history, h.updated_at
                  FROM session_history h
             LEFT JOIN session_history_meta m
                    ON m.conversation_id = h.conversation_id
                 WHERE m.conversation_id IS NULL
                   AND h.conversation_id NOT LIKE 'llm_kernel:gptassistant:%'
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT h.conversation_id, h.history, h.updated_at
                  FROM session_history h
             LEFT JOIN session_history_meta m
                    ON m.conversation_id = h.conversation_id
                 WHERE m.conversation_id IS NULL
                   AND h.conversation_id NOT LIKE 'llm_kernel:gptassistant:%'
                """
            ).fetchall()

    if not rows:
        return

    identity_index = _merged_session_identity_index()
    for row in rows:
        item = _normalize_row(row)
        conversation_id = str(item.get("conversation_id") or "").strip()
        if not conversation_id:
            continue
        identity = identity_index.get(conversation_id)
        if not identity:
            continue
        history_payload = item.get("history")
        if isinstance(history_payload, str):
            try:
                history = json.loads(history_payload)
            except json.JSONDecodeError:
                history = []
        elif isinstance(history_payload, list):
            history = history_payload
        else:
            history = []
        title = _derive_session_title_from_history(history)
        if not title:
            title = conversation_id
        _upsert_session_history_meta_raw(
            conversation_id=conversation_id,
            user_id=str(identity.get("user_id") or "").strip(),
            user_email=str(identity.get("user_email") or "").strip(),
            gid=str(identity.get("gid") or "gptassistant").strip() or "gptassistant",
            title=title,
            auth_provider=DEFAULT_AUTH_PROVIDER,
        )


def _ensure_session_history_meta_auth_provider_column() -> None:
    provider = DEFAULT_AUTH_PROVIDER
    with _connect() as conn:
        if _use_postgres():
            conn.execute("ALTER TABLE session_history_meta ADD COLUMN IF NOT EXISTS auth_provider TEXT")
            conn.execute(
                """
                UPDATE session_history_meta
                   SET auth_provider=%s
                 WHERE auth_provider IS NULL OR auth_provider=''
                """,
                (provider,),
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_provider_updated
                  ON session_history_meta(user_id, auth_provider, updated_at DESC)
                """
            )
        else:
            columns = _sqlite_columns(conn, "session_history_meta")
            if "auth_provider" not in columns:
                conn.execute("ALTER TABLE session_history_meta ADD COLUMN auth_provider TEXT")
            conn.execute(
                """
                UPDATE session_history_meta
                   SET auth_provider=?
                 WHERE auth_provider IS NULL OR auth_provider=''
                """,
                (provider,),
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_provider_updated
                  ON session_history_meta(user_id, auth_provider, updated_at DESC)
                """
            )
        conn.commit()


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


def _normalize_sqlite_file_mapping_row(item: dict[str, Any], columns: set[str]) -> dict[str, Any] | None:
    if FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns):
        return {
            "file_id": item.get("file_id"),
            "filename": item.get("filename"),
            "file_extension": item.get("file_extension"),
            "content_type": item.get("content_type"),
            "bucket": item.get("bucket"),
            "object_key": item.get("object_key"),
            "storage_backend": item.get("storage_backend"),
            "size_bytes": item.get("size_bytes"),
            "upload_time": item.get("upload_time") or _now_iso(),
            "gid": item.get("gid") or "gptassistant",
        }
    if LEGACY_FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns):
        object_key = str(item.get("path") or "").strip()
        filename = str(item.get("filename") or "").strip()
        content_type, _ = mimetypes.guess_type(filename or object_key)
        size_bytes = None
        if object_key:
            try:
                size_bytes = Path(object_key).stat().st_size
            except OSError:
                size_bytes = None
        return {
            "file_id": item.get("file_id"),
            "filename": filename,
            "file_extension": item.get("fileExtension"),
            "content_type": content_type,
            "bucket": "",
            "object_key": object_key,
            "storage_backend": "filesystem",
            "size_bytes": size_bytes,
            "upload_time": item.get("uploadTime") or _now_iso(),
            "gid": item.get("gid") or "gptassistant",
        }
    return None


def _migrate_sqlite_file_mapping_source_to_postgres(source_path: Path) -> dict[str, int]:
    try:
        sqlite_conn = sqlite3.connect(source_path)
        sqlite_conn.row_factory = sqlite3.Row
        try:
            if not _sqlite_table_exists(sqlite_conn, "file_mapping"):
                return {"total": 0, "inserted": 0, "skipped": 0}
            columns = _sqlite_columns(sqlite_conn, "file_mapping")
            if not (
                FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns)
                or LEGACY_FILE_MAPPING_REQUIRED_COLUMNS.issubset(columns)
            ):
                print(
                    f"sqlite_file_mapping_migration_skipped source={source_path} "
                    f"reason=unsupported_columns columns={','.join(sorted(columns))}"
                )
                return {"total": 0, "inserted": 0, "skipped": 0}
            rows = sqlite_conn.execute("SELECT * FROM file_mapping").fetchall()
        finally:
            sqlite_conn.close()
    except sqlite3.Error as exc:
        print(f"sqlite_file_mapping_migration_skipped source={source_path} error={exc}")
        return {"total": 0, "inserted": 0, "skipped": 0}
    if not rows:
        return {"total": 0, "inserted": 0, "skipped": 0}

    inserted = 0
    skipped = 0
    with _connect() as conn:
        for row in rows:
            item = _normalize_row(row)
            normalized = _normalize_sqlite_file_mapping_row(item, columns)
            if normalized is None:
                skipped += 1
                continue
            result = conn.execute(
                """
                INSERT INTO file_mapping(
                    file_id, filename, file_extension, content_type, bucket,
                    object_key, storage_backend, size_bytes, upload_time, gid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    normalized.get("upload_time") or _now_iso(),
                    normalized.get("gid") or "gptassistant",
                ),
            ).fetchone()
            if result:
                inserted += 1
            else:
                skipped += 1
        conn.commit()
    return {"total": len(rows), "inserted": inserted, "skipped": skipped}


def _migrate_sqlite_file_mapping_to_postgres_if_needed() -> None:
    if not _use_postgres():
        return
    totals = {"total": 0, "inserted": 0, "skipped": 0}
    migrated_sources: list[str] = []
    for source_path in sqlite_business_source_paths():
        if not source_path.exists():
            continue
        summary = _migrate_sqlite_file_mapping_source_to_postgres(source_path)
        if summary["total"] <= 0:
            continue
        migrated_sources.append(str(source_path))
        totals["total"] += summary["total"]
        totals["inserted"] += summary["inserted"]
        totals["skipped"] += summary["skipped"]
    if not migrated_sources:
        return
    print(
        "sqlite_file_mapping_migration_done "
        f"sources={migrated_sources} total={totals['total']} "
        f"inserted={totals['inserted']} skipped={totals['skipped']}"
    )


def _migrate_sqlite_light_business_tables_source_to_postgres(source_path: Path) -> dict[str, int]:
    summary = {
        "custom_gpts": 0,
        "user_gpts_state": 0,
        "user_config_version": 0,
    }
    try:
        sqlite_conn = sqlite3.connect(source_path)
        sqlite_conn.row_factory = sqlite3.Row
        try:
            with _connect() as conn:
                if _sqlite_table_exists(sqlite_conn, "custom_gpts"):
                    for row in sqlite_conn.execute("SELECT gid, config FROM custom_gpts").fetchall():
                        item = _normalize_row(row)
                        gid = str(item.get("gid") or "").strip()
                        config = item.get("config")
                        if not gid or not isinstance(config, str) or not config.strip():
                            continue
                        conn.execute(
                            """
                            INSERT INTO custom_gpts(gid, config)
                            VALUES (%s, %s::jsonb)
                            ON CONFLICT (gid) DO UPDATE SET config=EXCLUDED.config
                            """,
                            (gid, config),
                        )
                        summary["custom_gpts"] += 1

                if _sqlite_table_exists(sqlite_conn, "user_gpts_state"):
                    for row in sqlite_conn.execute(
                        "SELECT user_id, gpts_id, pinned_at FROM user_gpts_state"
                    ).fetchall():
                        item = _normalize_row(row)
                        user_id = str(item.get("user_id") or "").strip()
                        gpts_id = str(item.get("gpts_id") or "").strip()
                        pinned_at = str(item.get("pinned_at") or "").strip() or _now_iso()
                        if not user_id or not gpts_id:
                            continue
                        conn.execute(
                            """
                            INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (user_id, gpts_id) DO NOTHING
                            """,
                            (user_id, gpts_id, pinned_at),
                        )
                        summary["user_gpts_state"] += 1

                if _sqlite_table_exists(sqlite_conn, "user_config_version"):
                    for row in sqlite_conn.execute(
                        "SELECT user_id, version FROM user_config_version"
                    ).fetchall():
                        item = _normalize_row(row)
                        user_id = str(item.get("user_id") or "").strip()
                        version = str(item.get("version") or "").strip()
                        if not user_id or not version:
                            continue
                        conn.execute(
                            """
                            INSERT INTO user_config_version(user_id, version)
                            VALUES (%s, %s)
                            ON CONFLICT (user_id) DO UPDATE SET version=EXCLUDED.version
                            """,
                            (user_id, version),
                        )
                        summary["user_config_version"] += 1
                conn.commit()
        finally:
            sqlite_conn.close()
    except sqlite3.Error as exc:
        print(f"sqlite_light_business_migration_skipped source={source_path} error={exc}")
        return summary
    return summary


def _migrate_sqlite_light_business_tables_to_postgres_if_needed() -> None:
    if not _use_postgres():
        return
    totals = {
        "custom_gpts": 0,
        "user_gpts_state": 0,
        "user_config_version": 0,
    }
    migrated_sources: list[str] = []
    for source_path in sqlite_business_source_paths():
        if not source_path.exists():
            continue
        summary = _migrate_sqlite_light_business_tables_source_to_postgres(source_path)
        if not any(summary.values()):
            continue
        migrated_sources.append(str(source_path))
        for key, value in summary.items():
            totals[key] += value
    if not migrated_sources:
        return
    print(
        "sqlite_light_business_migration_done "
        f"sources={migrated_sources} custom_gpts={totals['custom_gpts']} "
        f"user_gpts_state={totals['user_gpts_state']} "
        f"user_config_version={totals['user_config_version']}"
    )


def ensure_initialized() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INITIALIZE_LOCK:
        if _INITIALIZED:
            return
        init_business_storage()


def _load_seed_gptassistant_model_configs() -> list[dict[str, Any]]:
    global _INITIALIZED

    previous_initialized = _INITIALIZED
    _INITIALIZED = True
    try:
        import app.gpts  # noqa: F401  # Ensure built-in GPT modules register on import.
        from app.gpts.config_gpts import fetch_gpts

        assistant_config = fetch_gpts().get("gptassistant") or {}
    finally:
        _INITIALIZED = previous_initialized

    models = assistant_config.get("models")
    if not isinstance(models, list):
        return []

    allowed_upload_types = assistant_config.get("upload_file_types")
    if not isinstance(allowed_upload_types, list):
        allowed_upload_types = []

    seeded_items: list[dict[str, Any]] = []
    for index, model in enumerate(models):
        if not isinstance(model, dict):
            continue

        model_id = str(model.get("id") or model.get("model_name") or "").strip()
        if not model_id:
            continue

        auth_config = model.get("auth") or {}
        visibility_scope = "all"
        visibility_users: list[str] = []
        if isinstance(auth_config, dict) and auth_config.get("type") == "white":
            visibility_scope = "whitelist"
            raw_users = auth_config.get("user")
            if isinstance(raw_users, list):
                visibility_users = [str(item).strip() for item in raw_users if str(item).strip()]

        description = model.get("description")
        metadata: dict[str, Any] = {"seeded_from": "gptassistant_builtin"}
        if isinstance(description, str) and description.strip():
            metadata["description"] = description.strip()

        seeded_items.append(
            {
                "model_id": model_id,
                "display_name": str(model.get("name") or model_id),
                "provider_model_name": str(model.get("model_name") or model_id),
                "sort_order": (index + 1) * 100,
                "enabled": True,
                "supports_reasoning": bool(model.get("supports_reasoning", False)),
                "supports_tool_calling": bool(model.get("supports_tool_calling", False)),
                "supports_native_image_input": bool(model.get("supports_native_image_input", False)),
                "reasoning_default_enabled": bool(model.get("reasoning_default_enabled", False)),
                "reasoning_parser_mode": model.get("reasoning_parser_mode"),
                "reasoning_parameter_format": (
                    (model.get("compat") or {}).get("reasoning_parameter_format")
                    if isinstance(model.get("compat"), dict)
                    else None
                ),
                "allowed_upload_types": allowed_upload_types,
                "visibility_scope": visibility_scope,
                "visibility_users": visibility_users,
                "metadata": metadata,
            }
        )

    return seeded_items


def _seed_admin_model_configs_if_empty() -> None:
    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS total FROM admin_model_configs").fetchone()
        count = int((_normalize_row(row).get("total") or 0) if row else 0)
        if count > 0:
            return

        seeded_items = _load_seed_gptassistant_model_configs()
        if not seeded_items:
            return

        now = _now_iso()
        if _use_postgres():
            for item in seeded_items:
                conn.execute(
                    """
                    INSERT INTO admin_model_configs(
                        model_id, display_name, provider_model_name, sort_order, enabled,
                        supports_reasoning, supports_tool_calling, supports_native_image_input,
                        reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                        allowed_upload_types, visibility_scope, visibility_users, metadata,
                        created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s, %s)
                    ON CONFLICT (model_id) DO NOTHING
                    """,
                    (
                        item["model_id"],
                        item["display_name"],
                        item["provider_model_name"],
                        item["sort_order"],
                        item["enabled"],
                        item["supports_reasoning"],
                        item["supports_tool_calling"],
                        item["supports_native_image_input"],
                        item["reasoning_default_enabled"],
                        item["reasoning_parser_mode"],
                        item["reasoning_parameter_format"],
                        _dump_json_field(item["allowed_upload_types"], fallback=[]),
                        item["visibility_scope"],
                        _dump_json_field(item["visibility_users"], fallback=[]),
                        _dump_json_field(item["metadata"], fallback={}),
                        now,
                        now,
                    ),
                )
        else:
            for item in seeded_items:
                conn.execute(
                    """
                    INSERT INTO admin_model_configs(
                        model_id, display_name, provider_model_name, sort_order, enabled,
                        supports_reasoning, supports_tool_calling, supports_native_image_input,
                        reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                        allowed_upload_types, visibility_scope, visibility_users, metadata,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(model_id) DO NOTHING
                    """,
                    (
                        item["model_id"],
                        item["display_name"],
                        item["provider_model_name"],
                        item["sort_order"],
                        1 if item["enabled"] else 0,
                        1 if item["supports_reasoning"] else 0,
                        1 if item["supports_tool_calling"] else 0,
                        1 if item["supports_native_image_input"] else 0,
                        1 if item["reasoning_default_enabled"] else 0,
                        item["reasoning_parser_mode"],
                        item["reasoning_parameter_format"],
                        _dump_json_field(item["allowed_upload_types"], fallback=[]),
                        item["visibility_scope"],
                        _dump_json_field(item["visibility_users"], fallback=[]),
                        _dump_json_field(item["metadata"], fallback={}),
                        now,
                        now,
                    ),
                )
        conn.commit()


def _load_seed_admin_user_permissions() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for user_key in sorted(model_config.GPTS_WHITE_LIST):
        normalized = str(user_key).strip()
        if not normalized:
            continue
        for permission_code in (
            "admin.access",
            "gpts.manage",
            "models.manage",
            "permissions.manage",
            "feature_flags.manage",
        ):
            items.append(
                {
                    "user_key": normalized,
                    "permission_code": permission_code,
                    "enabled": True,
                    "remark": "seeded from GPTS_WHITE_LIST",
                }
            )

    for user_key in sorted(model_config.VOICE_LAB_WHITE_LIST):
        normalized = str(user_key).strip()
        if not normalized:
            continue
        items.append(
            {
                "user_key": normalized,
                "permission_code": "voice_lab.access",
                "enabled": True,
                "remark": "seeded from VOICE_LAB_WHITE_LIST",
            }
        )

    return items


def _seed_admin_user_permissions_if_empty() -> None:
    seeded_items = _load_seed_admin_user_permissions()
    if not seeded_items:
        return

    with _connect() as conn:
        now = _now_iso()
        if _use_postgres():
            for item in seeded_items:
                conn.execute(
                    """
                    INSERT INTO admin_user_permissions(
                        user_key, permission_code, enabled, remark, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_key, permission_code) DO NOTHING
                    """,
                    (
                        item["user_key"],
                        item["permission_code"],
                        item["enabled"],
                        item["remark"],
                        now,
                        now,
                    ),
                )
        else:
            for item in seeded_items:
                conn.execute(
                    """
                    INSERT INTO admin_user_permissions(
                        user_key, permission_code, enabled, remark, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_key, permission_code) DO NOTHING
                    """,
                    (
                        item["user_key"],
                        item["permission_code"],
                        1 if item["enabled"] else 0,
                        item["remark"],
                        now,
                        now,
                    ),
                )
        conn.commit()


def _load_seed_admin_feature_flags() -> list[dict[str, Any]]:
    global _INITIALIZED

    previous_initialized = _INITIALIZED
    _INITIALIZED = True
    try:
        import app.gpts  # noqa: F401
        from app.gpts.config_gpts import fetch_gpts

        assistant_config = fetch_gpts().get("gptassistant") or {}
    finally:
        _INITIALIZED = previous_initialized

    models = assistant_config.get("models")
    visible_model_ids: list[str] = []
    if isinstance(models, list):
        for item in models:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or item.get("model_name") or "").strip()
            if model_id and model_id not in visible_model_ids:
                visible_model_ids.append(model_id)

    return [
        {
            "config_key": "gpts_feature_enabled",
            "config_value": bool(model_config.GPTS_FEATURE_ENABLED),
            "value_type": "boolean",
            "description": "Enable GPTS feature",
        },
        {
            "config_key": "default_model",
            "config_value": str(assistant_config.get("default_model") or ""),
            "value_type": "string",
            "description": "Default model for the main assistant",
        },
        {
            "config_key": "default_visible_models",
            "config_value": visible_model_ids,
            "value_type": "json",
            "description": "Visible models for the main assistant",
        },
        {
            "config_key": "default_reasoning_enabled",
            "config_value": bool(assistant_config.get("default_reasoning", False)),
            "value_type": "boolean",
            "description": "Default reasoning toggle for the main assistant",
        },
    ]


def _should_backfill_feature_flag(
    current_item: dict[str, Any] | None,
    seeded_item: dict[str, Any],
) -> bool:
    if current_item is None:
        return True

    config_key = seeded_item["config_key"]
    current_value = current_item.get("config_value")

    if config_key == "default_model":
        return not (isinstance(current_value, str) and current_value.strip())
    if config_key == "default_visible_models":
        if not isinstance(current_value, list):
            return True
        return len([item for item in current_value if isinstance(item, str) and item.strip()]) == 0
    if config_key == "default_reasoning_enabled":
        return not isinstance(current_value, bool)
    if config_key == "gpts_feature_enabled":
        return not isinstance(current_value, bool)

    return False


def _seed_admin_feature_flags_if_empty() -> None:
    seeded_items = _load_seed_admin_feature_flags()
    if not seeded_items:
        return

    with _connect() as conn:
        existing_rows = conn.execute(
            """
            SELECT config_key, config_value, value_type, description, updated_at, updated_by
              FROM admin_feature_flags
            """
        ).fetchall()
        existing_items = {
            item.get("config_key"): {
                "config_key": item.get("config_key"),
                "config_value": _load_json_field(
                    item.get("config_value"),
                    fallback=item.get("config_value"),
                ),
                "value_type": item.get("value_type"),
                "description": item.get("description"),
                "updated_at": str(item.get("updated_at") or ""),
                "updated_by": item.get("updated_by"),
            }
            for item in (_normalize_row(row) for row in existing_rows)
        }
        now = _now_iso()
        if _use_postgres():
            for item in seeded_items:
                if _should_backfill_feature_flag(existing_items.get(item["config_key"]), item):
                    conn.execute(
                        """
                        INSERT INTO admin_feature_flags(
                            config_key, config_value, value_type, description, updated_at, updated_by
                        ) VALUES (%s, %s::jsonb, %s, %s, %s, %s)
                        ON CONFLICT (config_key) DO UPDATE SET
                            config_value=EXCLUDED.config_value,
                            value_type=EXCLUDED.value_type,
                            description=EXCLUDED.description,
                            updated_at=EXCLUDED.updated_at,
                            updated_by=EXCLUDED.updated_by
                        """,
                        (
                            item["config_key"],
                            _dump_json_field(item["config_value"], fallback=None),
                            item["value_type"],
                            item["description"],
                            now,
                            "system-seed",
                        ),
                    )
        else:
            for item in seeded_items:
                if _should_backfill_feature_flag(existing_items.get(item["config_key"]), item):
                    conn.execute(
                        """
                        INSERT INTO admin_feature_flags(
                            config_key, config_value, value_type, description, updated_at, updated_by
                        ) VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(config_key) DO UPDATE SET
                            config_value=excluded.config_value,
                            value_type=excluded.value_type,
                            description=excluded.description,
                            updated_at=excluded.updated_at,
                            updated_by=excluded.updated_by
                        """,
                        (
                            item["config_key"],
                            _dump_json_field(item["config_value"], fallback=None),
                            item["value_type"],
                            item["description"],
                            now,
                            "system-seed",
                        ),
                    )
        conn.commit()


def init_business_storage() -> None:
    global _INITIALIZED
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_history_meta (
                  conversation_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  gid TEXT NOT NULL DEFAULT 'gptassistant',
                  title TEXT,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_updated
                  ON session_history_meta(user_id, updated_at DESC)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_history (
                  conversation_id TEXT PRIMARY KEY,
                  history JSONB NOT NULL,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_history_client (
                  conversation_id TEXT PRIMARY KEY,
                  history JSONB NOT NULL,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_gpts (
                  gid TEXT PRIMARY KEY,
                  config JSONB NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_gpts_state (
                  user_id TEXT NOT NULL,
                  gpts_id TEXT NOT NULL,
                  pinned_at TIMESTAMPTZ NOT NULL,
                  PRIMARY KEY (user_id, gpts_id)
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_pinned
                  ON user_gpts_state(user_id, pinned_at DESC)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_config_version (
                  user_id TEXT PRIMARY KEY,
                  version TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS file_mapping (
                  file_id TEXT PRIMARY KEY,
                  filename TEXT NOT NULL,
                  file_extension TEXT NOT NULL,
                  content_type TEXT,
                  bucket TEXT NOT NULL,
                  object_key TEXT NOT NULL,
                  storage_backend TEXT NOT NULL,
                  size_bytes BIGINT,
                  upload_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  gid TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_gid ON file_mapping(gid)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_model_configs (
                  id BIGSERIAL PRIMARY KEY,
                  model_id TEXT NOT NULL UNIQUE,
                  display_name TEXT NOT NULL,
                  provider_model_name TEXT NOT NULL,
                  sort_order INTEGER NOT NULL DEFAULT 1000,
                  enabled BOOLEAN NOT NULL DEFAULT TRUE,
                  supports_reasoning BOOLEAN NOT NULL DEFAULT FALSE,
                  supports_tool_calling BOOLEAN NOT NULL DEFAULT FALSE,
                  supports_native_image_input BOOLEAN NOT NULL DEFAULT FALSE,
                  reasoning_default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                  reasoning_parser_mode TEXT,
                  reasoning_parameter_format TEXT,
                  allowed_upload_types JSONB NOT NULL DEFAULT '[]'::jsonb,
                  visibility_scope TEXT NOT NULL DEFAULT 'all',
                  visibility_users JSONB NOT NULL DEFAULT '[]'::jsonb,
                  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_admin_model_configs_enabled_sort
                  ON admin_model_configs(enabled, sort_order)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_user_permissions (
                  id BIGSERIAL PRIMARY KEY,
                  user_key TEXT NOT NULL,
                  permission_code TEXT NOT NULL,
                  enabled BOOLEAN NOT NULL DEFAULT TRUE,
                  remark TEXT,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  UNIQUE (user_key, permission_code)
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_lookup
                  ON admin_user_permissions(user_key, permission_code, enabled)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_feature_flags (
                  config_key TEXT PRIMARY KEY,
                  config_value JSONB NOT NULL,
                  value_type TEXT NOT NULL,
                  description TEXT,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_by TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                  id BIGSERIAL PRIMARY KEY,
                  actor_key TEXT NOT NULL,
                  actor_email TEXT,
                  action TEXT NOT NULL,
                  resource_type TEXT NOT NULL,
                  resource_key TEXT NOT NULL,
                  before_state JSONB,
                  after_state JSONB,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
                  ON admin_audit_logs(created_at DESC)
                """
            )
        else:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS session_history_meta (
                  conversation_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  gid TEXT NOT NULL DEFAULT 'gptassistant',
                  title TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_updated
                  ON session_history_meta(user_id, updated_at DESC);
                CREATE TABLE IF NOT EXISTS session_history (
                  conversation_id TEXT PRIMARY KEY,
                  history TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS session_history_client (
                  conversation_id TEXT PRIMARY KEY,
                  history TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS custom_gpts (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_gpts_state (
                  user_id TEXT NOT NULL,
                  gpts_id TEXT NOT NULL,
                  pinned_at TEXT NOT NULL,
                  PRIMARY KEY (user_id, gpts_id)
                );
                CREATE INDEX IF NOT EXISTS idx_user_pinned
                  ON user_gpts_state(user_id, pinned_at DESC);
                CREATE TABLE IF NOT EXISTS user_config_version (
                  user_id TEXT PRIMARY KEY,
                  version TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS file_mapping (
                  file_id TEXT PRIMARY KEY,
                  filename TEXT NOT NULL,
                  file_extension TEXT NOT NULL,
                  content_type TEXT,
                  bucket TEXT NOT NULL,
                  object_key TEXT NOT NULL,
                  storage_backend TEXT NOT NULL,
                  size_bytes INTEGER,
                  upload_time TEXT NOT NULL,
                  gid TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_file_mapping_gid ON file_mapping(gid);
                CREATE TABLE IF NOT EXISTS admin_model_configs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  model_id TEXT NOT NULL UNIQUE,
                  display_name TEXT NOT NULL,
                  provider_model_name TEXT NOT NULL,
                  sort_order INTEGER NOT NULL DEFAULT 1000,
                  enabled INTEGER NOT NULL DEFAULT 1,
                  supports_reasoning INTEGER NOT NULL DEFAULT 0,
                  supports_tool_calling INTEGER NOT NULL DEFAULT 0,
                  supports_native_image_input INTEGER NOT NULL DEFAULT 0,
                  reasoning_default_enabled INTEGER NOT NULL DEFAULT 0,
                  reasoning_parser_mode TEXT,
                  reasoning_parameter_format TEXT,
                  allowed_upload_types TEXT NOT NULL DEFAULT '[]',
                  visibility_scope TEXT NOT NULL DEFAULT 'all',
                  visibility_users TEXT NOT NULL DEFAULT '[]',
                  metadata TEXT NOT NULL DEFAULT '{}',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_admin_model_configs_enabled_sort
                  ON admin_model_configs(enabled, sort_order);
                CREATE TABLE IF NOT EXISTS admin_user_permissions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_key TEXT NOT NULL,
                  permission_code TEXT NOT NULL,
                  enabled INTEGER NOT NULL DEFAULT 1,
                  remark TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  UNIQUE (user_key, permission_code)
                );
                CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_lookup
                  ON admin_user_permissions(user_key, permission_code, enabled);
                CREATE TABLE IF NOT EXISTS admin_feature_flags (
                  config_key TEXT PRIMARY KEY,
                  config_value TEXT NOT NULL,
                  value_type TEXT NOT NULL,
                  description TEXT,
                  updated_at TEXT NOT NULL,
                  updated_by TEXT
                );
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  actor_key TEXT NOT NULL,
                  actor_email TEXT,
                  action TEXT NOT NULL,
                  resource_type TEXT NOT NULL,
                  resource_key TEXT NOT NULL,
                  before_state TEXT,
                  after_state TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
                  ON admin_audit_logs(created_at DESC);
                """
            )
        conn.commit()
    _seed_admin_model_configs_if_empty()
    _seed_admin_user_permissions_if_empty()
    _seed_admin_feature_flags_if_empty()
    _ensure_session_history_meta_auth_provider_column()
    _migrate_sqlite_file_mapping_to_postgres_if_needed()
    _migrate_sqlite_light_business_tables_to_postgres_if_needed()
    _backfill_session_history_meta_from_existing_history()
    _INITIALIZED = True


def business_storage_health() -> dict[str, Any]:
    details: dict[str, Any] = {
        "backend": business_storage_backend(),
        "healthy": False,
    }
    try:
        ensure_initialized()
        with _connect() as conn:
            conn.execute("SELECT 1").fetchone()
        if _use_postgres():
            details["dsn_configured"] = bool(model_config.POSTGRES_DSN)
        else:
            details["db_path"] = DEV_DB_PATH
        details["healthy"] = True
    except Exception as exc:  # pragma: no cover - defensive health probe
        details["error"] = str(exc)
    return details


def load_session_history(conversation_id: str) -> list[Any]:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                "SELECT history FROM session_history WHERE conversation_id=%s",
                (conversation_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT history FROM session_history WHERE conversation_id=?",
                (conversation_id,),
            ).fetchone()
    if not row:
        return []
    history = _normalize_row(row).get("history")
    return _decode_history_payload(history)


def load_session_client_history(conversation_id: str) -> list[Any]:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                "SELECT history FROM session_history_client WHERE conversation_id=%s",
                (conversation_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT history FROM session_history_client WHERE conversation_id=?",
                (conversation_id,),
            ).fetchone()
    if not row:
        return []
    history = _normalize_row(row).get("history")
    return _decode_history_payload(history)


def get_session_history_meta(conversation_id: str) -> dict[str, Any] | None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                """
                SELECT conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                  FROM session_history_meta
                 WHERE conversation_id=%s
                """,
                (conversation_id,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                  FROM session_history_meta
                 WHERE conversation_id=?
                """,
                (conversation_id,),
            ).fetchone()
    if not row:
        return None
    item = _normalize_row(row)
    return {
        "conversation_id": str(item.get("conversation_id") or ""),
        "user_id": str(item.get("user_id") or ""),
        "user_email": str(item.get("user_email") or ""),
        "auth_provider": str(item.get("auth_provider") or DEFAULT_AUTH_PROVIDER),
        "gid": str(item.get("gid") or "gptassistant"),
        "title": str(item.get("title") or ""),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
    }


def list_session_history_meta(*, user_id: str, auth_provider: str, limit: int = 100) -> list[dict[str, Any]]:
    ensure_initialized()
    normalized_limit = max(1, min(limit, 500))
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                """
                SELECT conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                  FROM session_history_meta
                 WHERE user_id=%s AND auth_provider=%s
                 ORDER BY updated_at DESC
                 LIMIT %s
                """,
                (user_id, auth_provider, normalized_limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                  FROM session_history_meta
                 WHERE user_id=? AND auth_provider=?
                 ORDER BY updated_at DESC
                 LIMIT ?
                """,
                (user_id, auth_provider, normalized_limit),
            ).fetchall()
    return [
        {
            "conversation_id": str(item.get("conversation_id") or ""),
            "user_id": str(item.get("user_id") or ""),
            "user_email": str(item.get("user_email") or ""),
            "auth_provider": str(item.get("auth_provider") or DEFAULT_AUTH_PROVIDER),
            "gid": str(item.get("gid") or "gptassistant"),
            "title": str(item.get("title") or ""),
            "created_at": str(item.get("created_at") or ""),
            "updated_at": str(item.get("updated_at") or ""),
        }
        for item in (_normalize_row(row) for row in rows)
    ]


def _upsert_session_history_meta_raw(
    *,
    conversation_id: str,
    user_id: str,
    user_email: str,
    auth_provider: str,
    gid: str,
    title: str,
) -> None:
    normalized_title = title.strip()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO session_history_meta(
                    conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (conversation_id) DO UPDATE
                   SET user_id=EXCLUDED.user_id,
                       user_email=EXCLUDED.user_email,
                       auth_provider=EXCLUDED.auth_provider,
                       gid=EXCLUDED.gid,
                       title=CASE
                           WHEN COALESCE(session_history_meta.title, '') = '' AND COALESCE(EXCLUDED.title, '') <> ''
                           THEN EXCLUDED.title
                           ELSE session_history_meta.title
                       END,
                       updated_at=NOW()
                """,
                (conversation_id, user_id, user_email, auth_provider, gid, normalized_title),
            )
        else:
            now_iso = _now_iso()
            conn.execute(
                """
                INSERT INTO session_history_meta(
                    conversation_id, user_id, user_email, auth_provider, gid, title, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE
                   SET user_id=excluded.user_id,
                       user_email=excluded.user_email,
                       auth_provider=excluded.auth_provider,
                       gid=excluded.gid,
                       title=CASE
                           WHEN IFNULL(session_history_meta.title, '') = '' AND IFNULL(excluded.title, '') <> ''
                           THEN excluded.title
                           ELSE session_history_meta.title
                       END,
                       updated_at=excluded.updated_at
                """,
                (
                    conversation_id,
                    user_id,
                    user_email,
                    auth_provider,
                    gid,
                    normalized_title,
                    now_iso,
                    now_iso,
                ),
            )
        conn.commit()


def upsert_session_history_meta(
    *,
    conversation_id: str,
    user_id: str,
    user_email: str,
    auth_provider: str,
    gid: str,
    title: str,
) -> None:
    ensure_initialized()
    _upsert_session_history_meta_raw(
        conversation_id=conversation_id,
        user_id=user_id,
        user_email=user_email,
        auth_provider=auth_provider,
        gid=gid,
        title=title,
    )


def update_session_history_title(conversation_id: str, title: str) -> None:
    ensure_initialized()
    normalized_title = title.strip()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                UPDATE session_history_meta
                   SET title=%s,
                       updated_at=NOW()
                 WHERE conversation_id=%s
                """,
                (normalized_title, conversation_id),
            )
        else:
            conn.execute(
                """
                UPDATE session_history_meta
                   SET title=?,
                       updated_at=?
                 WHERE conversation_id=?
                """,
                (normalized_title, _now_iso(), conversation_id),
            )
        conn.commit()


def save_session_history(conversation_id: str, history: list[Any]) -> None:
    ensure_initialized()
    payload = _encode_history_payload(history)
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO session_history(conversation_id, history, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (conversation_id) DO UPDATE
                   SET history=EXCLUDED.history,
                       updated_at=NOW()
                """,
                (conversation_id, payload),
            )
        else:
            now_iso = _now_iso()
            conn.execute(
                """
                INSERT INTO session_history(conversation_id, history, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE
                   SET history=excluded.history,
                       updated_at=excluded.updated_at
                """,
                (conversation_id, payload, now_iso),
            )
        conn.commit()


def save_session_client_history(conversation_id: str, history: list[Any]) -> None:
    ensure_initialized()
    payload = _encode_history_payload(history)
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO session_history_client(conversation_id, history, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (conversation_id) DO UPDATE
                   SET history=EXCLUDED.history,
                       updated_at=NOW()
                """,
                (conversation_id, payload),
            )
        else:
            now_iso = _now_iso()
            conn.execute(
                """
                INSERT INTO session_history_client(conversation_id, history, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE
                   SET history=excluded.history,
                       updated_at=excluded.updated_at
                """,
                (conversation_id, payload, now_iso),
            )
        conn.commit()


def delete_session_history(conversation_id: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "DELETE FROM session_history_meta WHERE conversation_id=%s",
                (conversation_id,),
            )
            conn.execute(
                "DELETE FROM session_history_client WHERE conversation_id=%s",
                (conversation_id,),
            )
            conn.execute(
                "DELETE FROM session_history WHERE conversation_id=%s",
                (conversation_id,),
            )
        else:
            conn.execute(
                "DELETE FROM session_history_meta WHERE conversation_id=?",
                (conversation_id,),
            )
            conn.execute(
                "DELETE FROM session_history_client WHERE conversation_id=?",
                (conversation_id,),
            )
            conn.execute(
                "DELETE FROM session_history WHERE conversation_id=?",
                (conversation_id,),
            )
        conn.commit()


def load_custom_gpts() -> dict[str, dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute("SELECT gid, config FROM custom_gpts").fetchall()
        else:
            rows = conn.execute("SELECT gid, config FROM custom_gpts").fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _normalize_row(row)
        payload = item.get("config")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                continue
        if isinstance(payload, dict):
            result[str(item["gid"])] = payload
    return result


def insert_custom_gpt(gid: str, config: dict[str, Any]) -> None:
    ensure_initialized()
    payload = json.dumps(config, ensure_ascii=False)
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "INSERT INTO custom_gpts(gid, config) VALUES(%s, %s::jsonb)",
                (gid, payload),
            )
        else:
            conn.execute(
                "INSERT INTO custom_gpts(gid, config) VALUES(?, ?)",
                (gid, payload),
            )
        conn.commit()


def update_custom_gpt(gid: str, config: dict[str, Any]) -> None:
    ensure_initialized()
    payload = json.dumps(config, ensure_ascii=False)
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "UPDATE custom_gpts SET config=%s::jsonb WHERE gid=%s",
                (payload, gid),
            )
        else:
            conn.execute(
                "UPDATE custom_gpts SET config=? WHERE gid=?",
                (payload, gid),
            )
        conn.commit()


def delete_custom_gpt(gid: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute("DELETE FROM custom_gpts WHERE gid=%s", (gid,))
        else:
            conn.execute("DELETE FROM custom_gpts WHERE gid=?", (gid,))
        conn.commit()


def list_pinned_gids(user_id: str) -> set[str]:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                "SELECT gpts_id FROM user_gpts_state WHERE user_id=%s",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT gpts_id FROM user_gpts_state WHERE user_id=?",
                (user_id,),
            ).fetchall()
    return {str(_normalize_row(row)["gpts_id"]) for row in rows}


def is_gpt_pinned(user_id: str, gid: str) -> bool:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                "SELECT 1 FROM user_gpts_state WHERE user_id=%s AND gpts_id=%s",
                (user_id, gid),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT 1 FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
                (user_id, gid),
            ).fetchone()
    return row is not None


def ensure_required_pinned_gpts(user_id: str, gids: tuple[str, ...]) -> None:
    ensure_initialized()
    if not gids:
        return
    pinned_at = _now_iso()
    with _connect() as conn:
        for gid in gids:
            if _use_postgres():
                conn.execute(
                    """
                    INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, gpts_id) DO NOTHING
                    """,
                    (user_id, gid, pinned_at),
                )
            else:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO user_gpts_state(user_id, gpts_id, pinned_at)
                    VALUES (?, ?, ?)
                    """,
                    (user_id, gid, pinned_at),
                )
        conn.commit()


def set_user_gpt_pin(user_id: str, gid: str, *, is_pinned: bool) -> None:
    ensure_initialized()
    pinned_at = _now_iso()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "DELETE FROM user_gpts_state WHERE user_id=%s AND gpts_id=%s",
                (user_id, gid),
            )
            if is_pinned:
                conn.execute(
                    """
                    INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, gid, pinned_at),
                )
        else:
            conn.execute(
                "DELETE FROM user_gpts_state WHERE user_id=? AND gpts_id=?",
                (user_id, gid),
            )
            if is_pinned:
                conn.execute(
                    """
                    INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                    VALUES (?, ?, ?)
                    """,
                    (user_id, gid, pinned_at),
                )
        conn.commit()


def list_user_pinned_rows(user_id: str) -> list[dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                """
                SELECT gpts_id, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=%s
                 ORDER BY pinned_at ASC
                """,
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT gpts_id, pinned_at
                  FROM user_gpts_state
                 WHERE user_id=?
                 ORDER BY pinned_at ASC
                """,
                (user_id,),
            ).fetchall()
    return [_normalize_row(row) for row in rows]


def get_user_config_version(user_id: str) -> str | None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
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
    return str(_normalize_row(row).get("version") or "")


def set_user_config_version(user_id: str, version: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
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
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute("DELETE FROM user_gpts_state WHERE gpts_id=%s", (gid,))
        else:
            conn.execute("DELETE FROM user_gpts_state WHERE gpts_id=?", (gid,))
        conn.commit()


def list_file_mappings(gid: str | None = None) -> dict[str, dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        if gid:
            if _use_postgres():
                rows = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE gid=%s
                    """,
                    (gid,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE gid=?
                    """,
                    (gid,),
                ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT file_id, filename, file_extension, content_type, bucket,
                       object_key, storage_backend, size_bytes, upload_time, gid
                  FROM file_mapping
                """
            ).fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _normalize_row(row)
        result[str(item["file_id"])] = {
            "filename": item.get("filename"),
            "fileExtension": item.get("file_extension"),
            "contentType": item.get("content_type"),
            "bucket": item.get("bucket"),
            "objectKey": item.get("object_key"),
            "storageBackend": item.get("storage_backend"),
            "sizeBytes": item.get("size_bytes"),
            "uploadTime": str(item.get("upload_time")),
            "gid": item.get("gid"),
        }
    return result


def get_file_mapping(file_id: str, gid: str | None = None) -> dict[str, Any] | None:
    ensure_initialized()
    with _connect() as conn:
        if gid:
            if _use_postgres():
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE file_id=%s AND gid=%s
                    """,
                    (file_id, gid),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE file_id=? AND gid=?
                    """,
                    (file_id, gid),
                ).fetchone()
        else:
            if _use_postgres():
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE file_id=%s
                    """,
                    (file_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, upload_time, gid
                      FROM file_mapping
                     WHERE file_id=?
                    """,
                    (file_id,),
                ).fetchone()
    if not row:
        return None
    item = _normalize_row(row)
    return {
        "file_id": item.get("file_id"),
        "filename": item.get("filename"),
        "fileExtension": item.get("file_extension"),
        "contentType": item.get("content_type"),
        "bucket": item.get("bucket"),
        "objectKey": item.get("object_key"),
        "storageBackend": item.get("storage_backend"),
        "sizeBytes": item.get("size_bytes"),
        "uploadTime": str(item.get("upload_time")),
        "gid": item.get("gid"),
    }


def count_file_mappings(gid: str | None = None) -> int:
    ensure_initialized()
    with _connect() as conn:
        if gid:
            if _use_postgres():
                row = conn.execute(
                    "SELECT COUNT(*) AS total FROM file_mapping WHERE gid=%s",
                    (gid,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT COUNT(*) AS total FROM file_mapping WHERE gid=?",
                    (gid,),
                ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) AS total FROM file_mapping").fetchone()
    item = _normalize_row(row)
    total = item.get("total", 0) if item else 0
    return int(total or 0)


def insert_file_mapping(
    file_id: str,
    *,
    filename: str,
    file_extension: str,
    content_type: str | None,
    bucket: str,
    object_key: str,
    storage_backend: str,
    size_bytes: int | None,
    gid: str = "gptassistant",
) -> None:
    ensure_initialized()
    uploaded_at = _now_iso()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO file_mapping(
                    file_id, filename, file_extension, content_type, bucket,
                    object_key, storage_backend, size_bytes, upload_time, gid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    file_id,
                    filename,
                    file_extension,
                    content_type,
                    bucket,
                    object_key,
                    storage_backend,
                    size_bytes,
                    uploaded_at,
                    gid,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO file_mapping(
                    file_id, filename, file_extension, content_type, bucket,
                    object_key, storage_backend, size_bytes, upload_time, gid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    file_id,
                    filename,
                    file_extension,
                    content_type,
                    bucket,
                    object_key,
                    storage_backend,
                    size_bytes,
                    uploaded_at,
                    gid,
                ),
            )
        conn.commit()


def delete_file_mapping(file_id: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute("DELETE FROM file_mapping WHERE file_id=%s", (file_id,))
        else:
            conn.execute("DELETE FROM file_mapping WHERE file_id=?", (file_id,))
        conn.commit()


def list_admin_model_configs() -> list[dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, model_id, display_name, provider_model_name, sort_order,
                   enabled, supports_reasoning, supports_tool_calling,
                   supports_native_image_input, reasoning_default_enabled,
                   reasoning_parser_mode, reasoning_parameter_format,
                   allowed_upload_types, visibility_scope, visibility_users,
                   metadata, created_at, updated_at
              FROM admin_model_configs
             ORDER BY sort_order ASC, id ASC
            """
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _normalize_row(row)
        items.append(
            {
                "id": item.get("id"),
                "model_id": item.get("model_id"),
                "display_name": item.get("display_name"),
                "provider_model_name": item.get("provider_model_name"),
                "sort_order": int(item.get("sort_order") or 1000),
                "enabled": _coerce_bool(item.get("enabled")),
                "supports_reasoning": _coerce_bool(item.get("supports_reasoning")),
                "supports_tool_calling": _coerce_bool(item.get("supports_tool_calling")),
                "supports_native_image_input": _coerce_bool(item.get("supports_native_image_input")),
                "reasoning_default_enabled": _coerce_bool(item.get("reasoning_default_enabled")),
                "reasoning_parser_mode": item.get("reasoning_parser_mode"),
                "reasoning_parameter_format": item.get("reasoning_parameter_format"),
                "allowed_upload_types": _load_json_field(item.get("allowed_upload_types"), fallback=[]),
                "visibility_scope": item.get("visibility_scope") or "all",
                "visibility_users": _load_json_field(item.get("visibility_users"), fallback=[]),
                "metadata": _load_json_field(item.get("metadata"), fallback={}),
                "created_at": str(item.get("created_at") or ""),
                "updated_at": str(item.get("updated_at") or ""),
            }
        )
    return items


def get_admin_model_config(model_id: str) -> dict[str, Any] | None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                """
                SELECT id, model_id, display_name, provider_model_name, sort_order,
                       enabled, supports_reasoning, supports_tool_calling,
                       supports_native_image_input, reasoning_default_enabled,
                       reasoning_parser_mode, reasoning_parameter_format,
                       allowed_upload_types, visibility_scope, visibility_users,
                       metadata, created_at, updated_at
                  FROM admin_model_configs
                 WHERE model_id=%s
                """,
                (model_id,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id, model_id, display_name, provider_model_name, sort_order,
                       enabled, supports_reasoning, supports_tool_calling,
                       supports_native_image_input, reasoning_default_enabled,
                       reasoning_parser_mode, reasoning_parameter_format,
                       allowed_upload_types, visibility_scope, visibility_users,
                       metadata, created_at, updated_at
                  FROM admin_model_configs
                 WHERE model_id=?
                """,
                (model_id,),
            ).fetchone()
    if not row:
        return None
    item = _normalize_row(row)
    return {
        "id": item.get("id"),
        "model_id": item.get("model_id"),
        "display_name": item.get("display_name"),
        "provider_model_name": item.get("provider_model_name"),
        "sort_order": int(item.get("sort_order") or 1000),
        "enabled": _coerce_bool(item.get("enabled")),
        "supports_reasoning": _coerce_bool(item.get("supports_reasoning")),
        "supports_tool_calling": _coerce_bool(item.get("supports_tool_calling")),
        "supports_native_image_input": _coerce_bool(item.get("supports_native_image_input")),
        "reasoning_default_enabled": _coerce_bool(item.get("reasoning_default_enabled")),
        "reasoning_parser_mode": item.get("reasoning_parser_mode"),
        "reasoning_parameter_format": item.get("reasoning_parameter_format"),
        "allowed_upload_types": _load_json_field(item.get("allowed_upload_types"), fallback=[]),
        "visibility_scope": item.get("visibility_scope") or "all",
        "visibility_users": _load_json_field(item.get("visibility_users"), fallback=[]),
        "metadata": _load_json_field(item.get("metadata"), fallback={}),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
    }


def upsert_admin_model_config(
    *,
    model_id: str,
    display_name: str,
    provider_model_name: str,
    sort_order: int = 1000,
    enabled: bool = True,
    supports_reasoning: bool = False,
    supports_tool_calling: bool = False,
    supports_native_image_input: bool = False,
    reasoning_default_enabled: bool = False,
    reasoning_parser_mode: str | None = None,
    reasoning_parameter_format: str | None = None,
    allowed_upload_types: list[str] | None = None,
    visibility_scope: str = "all",
    visibility_users: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_initialized()
    now = _now_iso()
    payload = (
        model_id,
        display_name,
        provider_model_name,
        int(sort_order),
        bool(enabled),
        bool(supports_reasoning),
        bool(supports_tool_calling),
        bool(supports_native_image_input),
        bool(reasoning_default_enabled),
        reasoning_parser_mode,
        reasoning_parameter_format,
        _dump_json_field(allowed_upload_types, fallback=[]),
        visibility_scope or "all",
        _dump_json_field(visibility_users, fallback=[]),
        _dump_json_field(metadata, fallback={}),
        now,
        now,
    )
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO admin_model_configs(
                    model_id, display_name, provider_model_name, sort_order, enabled,
                    supports_reasoning, supports_tool_calling, supports_native_image_input,
                    reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                    allowed_upload_types, visibility_scope, visibility_users, metadata,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (model_id) DO UPDATE SET
                    display_name=EXCLUDED.display_name,
                    provider_model_name=EXCLUDED.provider_model_name,
                    sort_order=EXCLUDED.sort_order,
                    enabled=EXCLUDED.enabled,
                    supports_reasoning=EXCLUDED.supports_reasoning,
                    supports_tool_calling=EXCLUDED.supports_tool_calling,
                    supports_native_image_input=EXCLUDED.supports_native_image_input,
                    reasoning_default_enabled=EXCLUDED.reasoning_default_enabled,
                    reasoning_parser_mode=EXCLUDED.reasoning_parser_mode,
                    reasoning_parameter_format=EXCLUDED.reasoning_parameter_format,
                    allowed_upload_types=EXCLUDED.allowed_upload_types,
                    visibility_scope=EXCLUDED.visibility_scope,
                    visibility_users=EXCLUDED.visibility_users,
                    metadata=EXCLUDED.metadata,
                    updated_at=EXCLUDED.updated_at
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_model_configs(
                    model_id, display_name, provider_model_name, sort_order, enabled,
                    supports_reasoning, supports_tool_calling, supports_native_image_input,
                    reasoning_default_enabled, reasoning_parser_mode, reasoning_parameter_format,
                    allowed_upload_types, visibility_scope, visibility_users, metadata,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    display_name=excluded.display_name,
                    provider_model_name=excluded.provider_model_name,
                    sort_order=excluded.sort_order,
                    enabled=excluded.enabled,
                    supports_reasoning=excluded.supports_reasoning,
                    supports_tool_calling=excluded.supports_tool_calling,
                    supports_native_image_input=excluded.supports_native_image_input,
                    reasoning_default_enabled=excluded.reasoning_default_enabled,
                    reasoning_parser_mode=excluded.reasoning_parser_mode,
                    reasoning_parameter_format=excluded.reasoning_parameter_format,
                    allowed_upload_types=excluded.allowed_upload_types,
                    visibility_scope=excluded.visibility_scope,
                    visibility_users=excluded.visibility_users,
                    metadata=excluded.metadata,
                    updated_at=excluded.updated_at
                """,
                payload,
            )
        conn.commit()
    item = get_admin_model_config(model_id)
    if item is None:
        raise RuntimeError(f"failed to persist admin model config: {model_id}")
    return item


def delete_admin_model_config(model_id: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute("DELETE FROM admin_model_configs WHERE model_id=%s", (model_id,))
        else:
            conn.execute("DELETE FROM admin_model_configs WHERE model_id=?", (model_id,))
        conn.commit()


def list_admin_user_permissions() -> list[dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
              FROM admin_user_permissions
             ORDER BY user_key ASC, permission_code ASC, id ASC
            """
        ).fetchall()
    return [
        {
            "id": item.get("id"),
            "user_key": item.get("user_key"),
            "permission_code": item.get("permission_code"),
            "enabled": _coerce_bool(item.get("enabled")),
            "remark": item.get("remark"),
            "created_at": str(item.get("created_at") or ""),
            "updated_at": str(item.get("updated_at") or ""),
        }
        for item in (_normalize_row(row) for row in rows)
    ]


def get_admin_user_permission(user_key: str, permission_code: str) -> dict[str, Any] | None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                """
                SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
                  FROM admin_user_permissions
                 WHERE user_key=%s AND permission_code=%s
                """,
                (user_key, permission_code),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id, user_key, permission_code, enabled, remark, created_at, updated_at
                  FROM admin_user_permissions
                 WHERE user_key=? AND permission_code=?
                """,
                (user_key, permission_code),
            ).fetchone()
    if not row:
        return None
    item = _normalize_row(row)
    return {
        "id": item.get("id"),
        "user_key": item.get("user_key"),
        "permission_code": item.get("permission_code"),
        "enabled": _coerce_bool(item.get("enabled")),
        "remark": item.get("remark"),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
    }


def upsert_admin_user_permission(
    *,
    user_key: str,
    permission_code: str,
    enabled: bool = True,
    remark: str | None = None,
) -> dict[str, Any]:
    ensure_initialized()
    now = _now_iso()
    payload = (
        user_key,
        permission_code,
        bool(enabled),
        remark,
        now,
        now,
    )
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO admin_user_permissions(
                    user_key, permission_code, enabled, remark, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_key, permission_code) DO UPDATE SET
                    enabled=EXCLUDED.enabled,
                    remark=EXCLUDED.remark,
                    updated_at=EXCLUDED.updated_at
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_user_permissions(
                    user_key, permission_code, enabled, remark, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_key, permission_code) DO UPDATE SET
                    enabled=excluded.enabled,
                    remark=excluded.remark,
                    updated_at=excluded.updated_at
                """,
                payload,
            )
        conn.commit()
    item = get_admin_user_permission(user_key, permission_code)
    if item is None:
        raise RuntimeError(
            f"failed to persist admin user permission: {user_key}::{permission_code}"
        )
    return item


def delete_admin_user_permission(user_key: str, permission_code: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "DELETE FROM admin_user_permissions WHERE user_key=%s AND permission_code=%s",
                (user_key, permission_code),
            )
        else:
            conn.execute(
                "DELETE FROM admin_user_permissions WHERE user_key=? AND permission_code=?",
                (user_key, permission_code),
            )
        conn.commit()


def list_admin_feature_flags() -> list[dict[str, Any]]:
    ensure_initialized()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT config_key, config_value, value_type, description, updated_at, updated_by
              FROM admin_feature_flags
             ORDER BY config_key ASC
            """
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _normalize_row(row)
        items.append(
            {
                "config_key": item.get("config_key"),
                "config_value": _load_json_field(item.get("config_value"), fallback=item.get("config_value")),
                "value_type": item.get("value_type"),
                "description": item.get("description"),
                "updated_at": str(item.get("updated_at") or ""),
                "updated_by": item.get("updated_by"),
            }
        )
    return items


def get_admin_feature_flag(config_key: str) -> dict[str, Any] | None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                """
                SELECT config_key, config_value, value_type, description, updated_at, updated_by
                  FROM admin_feature_flags
                 WHERE config_key=%s
                """,
                (config_key,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT config_key, config_value, value_type, description, updated_at, updated_by
                  FROM admin_feature_flags
                 WHERE config_key=?
                """,
                (config_key,),
            ).fetchone()
    if not row:
        return None
    item = _normalize_row(row)
    return {
        "config_key": item.get("config_key"),
        "config_value": _load_json_field(item.get("config_value"), fallback=item.get("config_value")),
        "value_type": item.get("value_type"),
        "description": item.get("description"),
        "updated_at": str(item.get("updated_at") or ""),
        "updated_by": item.get("updated_by"),
    }


def upsert_admin_feature_flag(
    *,
    config_key: str,
    config_value: Any,
    value_type: str,
    description: str | None = None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    ensure_initialized()
    now = _now_iso()
    payload = (
        config_key,
        _dump_json_field(config_value, fallback=None),
        value_type,
        description,
        now,
        updated_by,
    )
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO admin_feature_flags(
                    config_key, config_value, value_type, description, updated_at, updated_by
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (config_key) DO UPDATE SET
                    config_value=EXCLUDED.config_value,
                    value_type=EXCLUDED.value_type,
                    description=EXCLUDED.description,
                    updated_at=EXCLUDED.updated_at,
                    updated_by=EXCLUDED.updated_by
                """,
                payload,
            )
        else:
            conn.execute(
                """
                INSERT INTO admin_feature_flags(
                    config_key, config_value, value_type, description, updated_at, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(config_key) DO UPDATE SET
                    config_value=excluded.config_value,
                    value_type=excluded.value_type,
                    description=excluded.description,
                    updated_at=excluded.updated_at,
                    updated_by=excluded.updated_by
                """,
                payload,
            )
        conn.commit()
    item = get_admin_feature_flag(config_key)
    if item is None:
        raise RuntimeError(f"failed to persist admin feature flag: {config_key}")
    return item


def delete_admin_feature_flag(config_key: str) -> None:
    ensure_initialized()
    with _connect() as conn:
        if _use_postgres():
            conn.execute("DELETE FROM admin_feature_flags WHERE config_key=%s", (config_key,))
        else:
            conn.execute("DELETE FROM admin_feature_flags WHERE config_key=?", (config_key,))
        conn.commit()


def insert_admin_audit_log(
    *,
    actor_key: str,
    actor_email: str | None,
    action: str,
    resource_type: str,
    resource_key: str,
    before_state: Any = None,
    after_state: Any = None,
) -> dict[str, Any]:
    ensure_initialized()
    created_at = _now_iso()
    payload = (
        actor_key,
        actor_email,
        action,
        resource_type,
        resource_key,
        _dump_json_field(before_state, fallback=None) if before_state is not None else None,
        _dump_json_field(after_state, fallback=None) if after_state is not None else None,
        created_at,
    )
    with _connect() as conn:
        if _use_postgres():
            row = conn.execute(
                """
                INSERT INTO admin_audit_logs(
                    actor_key, actor_email, action, resource_type, resource_key,
                    before_state, after_state, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, actor_key, actor_email, action, resource_type, resource_key,
                          before_state, after_state, created_at
                """,
                payload,
            ).fetchone()
        else:
            cursor = conn.execute(
                """
                INSERT INTO admin_audit_logs(
                    actor_key, actor_email, action, resource_type, resource_key,
                    before_state, after_state, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
            row = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 WHERE id=?
                """,
                (cursor.lastrowid,),
            ).fetchone()
        conn.commit()
    item = _normalize_row(row)
    return {
        "id": item.get("id"),
        "actor_key": item.get("actor_key"),
        "actor_email": item.get("actor_email"),
        "action": item.get("action"),
        "resource_type": item.get("resource_type"),
        "resource_key": item.get("resource_key"),
        "before_state": _load_json_field(item.get("before_state"), fallback=None),
        "after_state": _load_json_field(item.get("after_state"), fallback=None),
        "created_at": str(item.get("created_at") or ""),
    }


def list_admin_audit_logs(limit: int = 50) -> list[dict[str, Any]]:
    ensure_initialized()
    safe_limit = max(1, min(int(limit or 50), 200))
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 ORDER BY created_at DESC, id DESC
                 LIMIT %s
                """,
                (safe_limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, actor_key, actor_email, action, resource_type, resource_key,
                       before_state, after_state, created_at
                  FROM admin_audit_logs
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = _normalize_row(row)
        items.append(
            {
                "id": item.get("id"),
                "actor_key": item.get("actor_key"),
                "actor_email": item.get("actor_email"),
                "action": item.get("action"),
                "resource_type": item.get("resource_type"),
                "resource_key": item.get("resource_key"),
                "before_state": _load_json_field(item.get("before_state"), fallback=None),
                "after_state": _load_json_field(item.get("after_state"), fallback=None),
                "created_at": str(item.get("created_at") or ""),
            }
        )
    return items


def list_enabled_permissions_for_user(user_keys: list[str]) -> set[str]:
    ensure_initialized()
    normalized_keys = [key for key in user_keys if key]
    if not normalized_keys:
        return set()
    placeholders = ",".join(["%s"] * len(normalized_keys)) if _use_postgres() else ",".join(["?"] * len(normalized_keys))
    sql = f"""
        SELECT permission_code
          FROM admin_user_permissions
         WHERE enabled = {'TRUE' if _use_postgres() else '1'}
           AND user_key IN ({placeholders})
    """
    with _connect() as conn:
        rows = conn.execute(sql, tuple(normalized_keys)).fetchall()
    return {str(_normalize_row(row).get("permission_code") or "") for row in rows}


__all__ = [
    "business_storage_backend",
    "business_storage_health",
    "close_business_storage",
    "count_file_mappings",
    "delete_custom_gpt",
    "delete_admin_feature_flag",
    "delete_admin_model_config",
    "delete_admin_user_permission",
    "delete_file_mapping",
    "delete_session_history",
    "delete_user_gpt_state_by_gid",
    "ensure_initialized",
    "ensure_required_pinned_gpts",
    "get_admin_feature_flag",
    "get_admin_model_config",
    "get_admin_user_permission",
    "insert_admin_audit_log",
    "get_file_mapping",
    "get_user_config_version",
    "init_business_storage",
    "insert_custom_gpt",
    "insert_file_mapping",
    "is_gpt_pinned",
    "list_admin_audit_logs",
    "list_admin_feature_flags",
    "list_admin_model_configs",
    "list_admin_user_permissions",
    "list_enabled_permissions_for_user",
    "list_file_mappings",
    "list_pinned_gids",
    "list_session_history_meta",
    "list_user_pinned_rows",
    "load_custom_gpts",
    "get_session_history_meta",
    "load_session_history",
    "save_session_history",
    "set_user_config_version",
    "set_user_gpt_pin",
    "update_session_history_title",
    "upsert_admin_feature_flag",
    "upsert_admin_model_config",
    "upsert_admin_user_permission",
    "upsert_session_history_meta",
    "update_custom_gpt",
]
