from __future__ import annotations

import json
import hashlib
import mimetypes
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Iterator

from app.auth.auth_routes import DEFAULT_AUTH_PROVIDER, GLOBAL_AUTH_PROVIDER
from app.base_config import model_config
from app.logger import gpt_logger
from app.storage.object_store import build_minio_object_key, store_local_file

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

try:
    import fcntl
except Exception:  # pragma: no cover - non-Unix development environments
    fcntl = None

DATA_DIR = os.path.join("", f"{model_config.FILE_BASE}/gptassistant")
DEV_DB_PATH = os.path.join(DATA_DIR, "business-dev.db")
_INITIALIZED = False
_INITIALIZE_LOCK = Lock()
_FERNET: Any = None
_POSTGRES_POOL: Any = None
_POSTGRES_POOL_DSN = ""
REGULATION_KNOWLEDGE_SEED_SYNC_TASK_KEY = "regulation_knowledge_seed_sync:v1"
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


class FileUploadQuotaExceeded(Exception):
    def __init__(self, scope: str):
        super().__init__(scope)
        self.scope = scope
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


def _normalize_provider_scope(value: Any) -> str:
    scope = str(value or "").strip().lower()
    if scope in {"provider", "global"}:
        return scope
    return GLOBAL_AUTH_PROVIDER


def _normalize_custom_gpt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    normalized["provider_scope"] = _normalize_provider_scope(normalized.get("provider_scope"))
    if normalized["provider_scope"] == "provider":
        normalized["auth_provider"] = (
            str(normalized.get("auth_provider") or "").strip() or DEFAULT_AUTH_PROVIDER
        )
    else:
        normalized["auth_provider"] = (
            str(normalized.get("auth_provider") or "").strip() or GLOBAL_AUTH_PROVIDER
        )
    return normalized


def _dump_json_field(value: Any, *, fallback: Any) -> str:
    target = fallback if value is None else value
    return json.dumps(target, ensure_ascii=False)


def _coerce_jsonb_param(value: Any, *, fallback: Any = None) -> str:
    target = fallback if value is None else value
    if isinstance(target, str):
        return target
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


def _ensure_custom_gpts_metadata_columns() -> None:
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "ALTER TABLE custom_gpts ADD COLUMN IF NOT EXISTS assistant_kind TEXT NOT NULL DEFAULT 'custom'"
            )
            conn.execute("ALTER TABLE custom_gpts ADD COLUMN IF NOT EXISTS handler_key TEXT")
            conn.execute(
                """
                UPDATE custom_gpts
                   SET assistant_kind = COALESCE(NULLIF(assistant_kind, ''), 'custom'),
                       handler_key = NULLIF(handler_key, '')
                 WHERE assistant_kind IS NULL OR assistant_kind = ''
                    OR handler_key = ''
                """
            )
        else:
            columns = _sqlite_columns(conn, "custom_gpts")
            if "assistant_kind" not in columns:
                conn.execute(
                    "ALTER TABLE custom_gpts ADD COLUMN assistant_kind TEXT NOT NULL DEFAULT 'custom'"
                )
            if "handler_key" not in columns:
                conn.execute("ALTER TABLE custom_gpts ADD COLUMN handler_key TEXT")
            conn.execute(
                """
                UPDATE custom_gpts
                   SET assistant_kind = COALESCE(NULLIF(assistant_kind, ''), 'custom'),
                       handler_key = NULLIF(handler_key, '')
                 WHERE assistant_kind IS NULL OR assistant_kind = ''
                    OR handler_key = ''
                """
            )
        conn.commit()


def _ensure_agents_metadata_columns() -> None:
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS assistant_kind TEXT NOT NULL DEFAULT 'custom'"
            )
            conn.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS handler_key TEXT")
            conn.execute(
                """
                UPDATE agents
                   SET assistant_kind = COALESCE(NULLIF(assistant_kind, ''), 'custom'),
                       handler_key = NULLIF(handler_key, '')
                 WHERE assistant_kind IS NULL OR assistant_kind = ''
                    OR handler_key = ''
                """
            )
        else:
            columns = _sqlite_columns(conn, "agents")
            if "assistant_kind" not in columns:
                conn.execute(
                    "ALTER TABLE agents ADD COLUMN assistant_kind TEXT NOT NULL DEFAULT 'custom'"
                )
            if "handler_key" not in columns:
                conn.execute("ALTER TABLE agents ADD COLUMN handler_key TEXT")
            conn.execute(
                """
                UPDATE agents
                   SET assistant_kind = COALESCE(NULLIF(assistant_kind, ''), 'custom'),
                       handler_key = NULLIF(handler_key, '')
                 WHERE assistant_kind IS NULL OR assistant_kind = ''
                    OR handler_key = ''
                """
            )
        conn.commit()


def _custom_gpt_metadata_from_config(config: dict[str, Any]) -> dict[str, Any]:
    assistant_kind = str(config.get("assistant_kind") or "custom").strip() or "custom"
    handler_key = str(config.get("handler_key") or "").strip() or None
    return {
        "assistant_kind": assistant_kind,
        "handler_key": handler_key,
    }


def _json_safe_seed_gpt_config(config: dict[str, Any]) -> dict[str, Any]:
    safe_config: dict[str, Any] = {}
    for key, value in config.items():
        if key == "chat_function" or callable(value):
            continue
        safe_config[key] = value
    return safe_config


def _normalize_identity_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized and normalized not in items:
                items.append(normalized)
    return items


def _regulation_acl_defaults() -> dict[str, Any]:
    white_list = sorted(item for item in model_config.GPTS_WHITE_LIST if str(item).strip())
    owner = white_list[0] if white_list else ""
    admins = white_list[1:]
    return {
        "owner": owner,
        "admins": admins,
        "viewers": [],
    }


def _regulation_source_dir() -> Path:
    return Path(model_config.FILE_BASE) / "regulationassistant"


def _regulation_source_files() -> list[Path]:
    source_dir = _regulation_source_dir()
    if not source_dir.exists():
        return []
    files: list[Path] = []
    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(source_dir).as_posix()
        if not relative or relative.startswith("."):
            continue
        files.append(path)
    return files


def _startup_task_node_id() -> str:
    return model_config.SQLITE_MIGRATION_NODE_ID.strip() or "local"


def _startup_task_completed(task_key: str) -> bool:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT status
              FROM startup_task_state
             WHERE node_id=%s AND task_key=%s
            """
            if _use_postgres()
            else """
            SELECT status
              FROM startup_task_state
             WHERE node_id=? AND task_key=?
            """,
            (_startup_task_node_id(), task_key),
        ).fetchone()
    item = _normalize_row(row) if row else {}
    return str(item.get("status") or "").strip().lower() == "completed"


def _mark_startup_task_completed(task_key: str, summary: dict[str, Any]) -> None:
    now = _now_iso()
    serialized_summary = json.dumps(summary, ensure_ascii=False)
    with _connect() as conn:
        if _use_postgres():
            conn.execute(
                """
                INSERT INTO startup_task_state(
                    node_id, task_key, status, completed_at, summary, error
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (node_id, task_key) DO UPDATE SET
                    status=EXCLUDED.status,
                    completed_at=EXCLUDED.completed_at,
                    summary=EXCLUDED.summary,
                    error=EXCLUDED.error
                """,
                (
                    _startup_task_node_id(),
                    task_key,
                    "completed",
                    now,
                    serialized_summary,
                    "",
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO startup_task_state(
                    node_id, task_key, status, completed_at, summary, error
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(node_id, task_key) DO UPDATE SET
                    status=excluded.status,
                    completed_at=excluded.completed_at,
                    summary=excluded.summary,
                    error=excluded.error
                """,
                (
                    _startup_task_node_id(),
                    task_key,
                    "completed",
                    now,
                    serialized_summary,
                    "",
                ),
            )
        conn.commit()


def _regulation_seed_upload_time(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def _regulation_knowledge_file_id(relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/").strip("/")
    normalized = normalized.replace("/", "__")
    return f"regulationassistant:{normalized}"


def _seed_regulation_knowledge_file_payload(path: Path) -> dict[str, Any]:
    relative_path = path.relative_to(_regulation_source_dir()).as_posix()
    filename = path.name
    content_type, _ = mimetypes.guess_type(filename)
    content_bytes = path.read_bytes()
    size_bytes = len(content_bytes)
    content_sha256 = hashlib.sha256(content_bytes).hexdigest()
    upload_time = _regulation_seed_upload_time(path)
    return {
        "file_id": _regulation_knowledge_file_id(relative_path),
        "filename": filename,
        "file_extension": path.suffix.lower(),
        "content_type": content_type or "application/octet-stream",
        "upload_time": upload_time,
        "bucket": "gptassistant",
        "size_bytes": size_bytes,
        "content_sha256": content_sha256,
        "gid": "regulationassistant",
        "owner_user_id": None,
        "owner_user_email": None,
        "auth_provider": GLOBAL_AUTH_PROVIDER,
        "purpose": "assistant_knowledge",
        "conversation_id": None,
    }


def _regulation_seed_storage_payload(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    stored = store_local_file(
        file_id=str(payload["file_id"]),
        filename=str(payload["filename"]),
        source_path=path,
        content_type=str(payload["content_type"]),
        upload_time=str(payload["upload_time"]),
    )
    return {
        **payload,
        "bucket": str(stored.get("bucket") or ""),
        "object_key": str(stored.get("object_key") or ""),
        "storage_backend": str(stored.get("storage_backend") or ""),
        "size_bytes": int(stored.get("size_bytes") or 0),
    }


def _regulation_seed_desired_storage_payload(payload: dict[str, Any]) -> dict[str, Any]:
    file_id = str(payload["file_id"])
    filename = str(payload["filename"])
    upload_time = str(payload["upload_time"])
    if model_config.OBJECT_STORAGE_BACKEND == "minio":
        return {
            **payload,
            "bucket": model_config.MINIO_BUCKET,
            "object_key": build_minio_object_key(
                file_id=file_id,
                filename=filename,
                upload_time=upload_time,
            ),
            "storage_backend": "minio",
        }
    return {
        **payload,
        "bucket": "",
        "object_key": str(Path(model_config.FILE_BASE) / "gptassistant" / "uploads" / file_id),
        "storage_backend": "filesystem",
    }


def _file_mapping_needs_refresh(existing: dict[str, Any] | None, desired: dict[str, Any]) -> bool:
    if not existing:
        return True
    comparisons = (
        ("filename", "filename"),
        ("file_extension", "file_extension"),
        ("content_type", "content_type"),
        ("bucket", "bucket"),
        ("object_key", "object_key"),
        ("storage_backend", "storage_backend"),
        ("size_bytes", "size_bytes"),
        ("content_sha256", "content_sha256"),
        ("gid", "gid"),
        ("purpose", "purpose"),
        ("conversation_id", "conversation_id"),
        ("owner_user_id", "owner_user_id"),
        ("owner_user_email", "owner_user_email"),
        ("auth_provider", "auth_provider"),
    )
    for existing_key, desired_key in comparisons:
        if str(existing.get(existing_key) or "") != str(desired.get(desired_key) or ""):
            return True
    return False


def _load_seed_system_gpts() -> dict[str, dict[str, Any]]:
    global _INITIALIZED

    previous_initialized = _INITIALIZED
    _INITIALIZED = True
    try:
        import app.gpts  # noqa: F401  # Ensure built-in GPT modules register on import.
        from app.gpts.config_gpts import builtin_gpts

        configs = builtin_gpts
    finally:
        _INITIALIZED = previous_initialized

    seeded_items: dict[str, dict[str, Any]] = {}
    for gid, config in configs.items():
        if not isinstance(config, dict):
            continue
        if str(config.get("assistant_kind") or "").strip() != "system":
            continue
        if not str(config.get("handler_key") or "").strip():
            continue
        seeded_items[gid] = config
    gpt_logger.info(
        "system_gpt_seed_candidates loaded=%s gids=%s",
        len(seeded_items),
        ",".join(sorted(seeded_items.keys())),
    )
    return seeded_items


def _sync_seed_system_gpts_to_storage() -> None:
    seeded_items = _load_seed_system_gpts()
    if not seeded_items:
        gpt_logger.info("system_gpt_seed_sync skipped reason=no_candidates")
        return
    gpt_logger.info("system_gpt_seed_sync started total=%s", len(seeded_items))
    with _connect() as conn:
        for gid, config in seeded_items.items():
            safe_config = _json_safe_seed_gpt_config(config)
            payload = json.dumps(safe_config, ensure_ascii=False)
            metadata = _custom_gpt_metadata_from_config(safe_config)
            gpt_logger.info(
                "system_gpt_seed_sync upsert gid=%s assistant_kind=%s handler_key=%s",
                gid,
                metadata["assistant_kind"],
                metadata["handler_key"],
            )
            if _use_postgres():
                conn.execute(
                    """
                    INSERT INTO agents(gid, config, assistant_kind, handler_key)
                    VALUES(%s, %s::jsonb, %s, %s)
                    ON CONFLICT (gid) DO UPDATE SET
                        assistant_kind=EXCLUDED.assistant_kind,
                        handler_key=EXCLUDED.handler_key
                    """,
                    (gid, payload, metadata["assistant_kind"], metadata["handler_key"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO agents(gid, config, assistant_kind, handler_key)
                    VALUES(?, ?, ?, ?)
                    ON CONFLICT(gid) DO UPDATE SET
                        assistant_kind=excluded.assistant_kind,
                        handler_key=excluded.handler_key
                    """,
                    (gid, payload, metadata["assistant_kind"], metadata["handler_key"]),
                )
        conn.commit()
    gpt_logger.info("system_gpt_seed_sync completed total=%s", len(seeded_items))


def _migrate_legacy_custom_gpts_to_agents() -> None:
    with _connect() as conn:
        if _use_postgres():
            rows = conn.execute(
                """
                SELECT c.gid, c.config, c.assistant_kind, c.handler_key
                  FROM custom_gpts c
                  LEFT JOIN agents a ON a.gid = c.gid
                 WHERE a.gid IS NULL
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT c.gid, c.config, c.assistant_kind, c.handler_key
                  FROM custom_gpts c
                  LEFT JOIN agents a ON a.gid = c.gid
                 WHERE a.gid IS NULL
                """
            ).fetchall()
        gpt_logger.info("legacy_custom_gpts_migration scanned=%s", len(rows))
        for row in rows:
            item = _normalize_row(row)
            gid = str(item.get("gid") or "").strip()
            config_payload = item.get("config")
            if not gid or config_payload is None:
                gpt_logger.info(
                    "legacy_custom_gpts_migration skipped gid=%s reason=missing_gid_or_config",
                    gid or "<empty>",
                )
                continue
            assistant_kind = str(item.get("assistant_kind") or "custom").strip() or "custom"
            handler_key = str(item.get("handler_key") or "").strip() or None
            gpt_logger.info(
                "legacy_custom_gpts_migration upsert gid=%s assistant_kind=%s handler_key=%s",
                gid,
                assistant_kind,
                handler_key,
            )
            if _use_postgres():
                conn.execute(
                    """
                    INSERT INTO agents(gid, config, assistant_kind, handler_key)
                    VALUES(%s, %s::jsonb, %s, %s)
                    ON CONFLICT (gid) DO NOTHING
                    """,
                    (
                        gid,
                        _coerce_jsonb_param(config_payload, fallback={}),
                        assistant_kind,
                        handler_key,
                    ),
                )
            else:
                serialized = (
                    config_payload
                    if isinstance(config_payload, str)
                    else json.dumps(config_payload, ensure_ascii=False)
                )
                conn.execute(
                    """
                    INSERT INTO agents(gid, config, assistant_kind, handler_key)
                    VALUES(?, ?, ?, ?)
                    ON CONFLICT(gid) DO NOTHING
                    """,
                    (gid, serialized, assistant_kind, handler_key),
                )
        conn.commit()
    gpt_logger.info("legacy_custom_gpts_migration completed scanned=%s", len(rows))


def _run_seed_regulation_knowledge_files_to_storage() -> dict[str, int]:
    source_files = _regulation_source_files()
    if not source_files:
        gpt_logger.info("regulation_knowledge_seed_sync skipped reason=no_source_files")
        return {"total": 0, "inserted": 0, "updated": 0, "skipped": 0}
    gpt_logger.info(
        "regulation_knowledge_seed_sync started total=%s files=%s",
        len(source_files),
        ",".join(str(path.name) for path in source_files),
    )
    summary = {"total": len(source_files), "inserted": 0, "updated": 0, "skipped": 0}
    with _connect() as conn:
        for path in source_files:
            seed_payload = _seed_regulation_knowledge_file_payload(path)
            desired_payload = _regulation_seed_desired_storage_payload(seed_payload)
            if _use_postgres():
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE file_id=%s AND gid=%s
                    """,
                    (seed_payload["file_id"], "regulationassistant"),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE file_id=? AND gid=?
                    """,
                    (seed_payload["file_id"], "regulationassistant"),
                ).fetchone()
            existing = _normalize_row(row) if row else None
            if not _file_mapping_needs_refresh(existing, desired_payload):
                gpt_logger.info(
                    "regulation_knowledge_seed_sync skipped file_id=%s reason=already_current",
                    seed_payload["file_id"],
                )
                summary["skipped"] += 1
                continue
            stored_payload = _regulation_seed_storage_payload(path, seed_payload)
            action = "update" if existing else "insert"
            summary["updated" if existing else "inserted"] += 1
            gpt_logger.info(
                "regulation_knowledge_seed_sync %s file_id=%s filename=%s sha256=%s",
                action,
                seed_payload["file_id"],
                stored_payload["filename"],
                stored_payload["content_sha256"],
            )
            if _use_postgres():
                if existing:
                    conn.execute(
                        """
                        UPDATE file_mapping
                           SET filename=%s,
                               file_extension=%s,
                               content_type=%s,
                               bucket=%s,
                               object_key=%s,
                               storage_backend=%s,
                               size_bytes=%s,
                               content_sha256=%s,
                               upload_time=%s,
                               gid=%s,
                               owner_user_id=%s,
                               owner_user_email=%s,
                               auth_provider=%s,
                               purpose=%s,
                               conversation_id=%s
                         WHERE file_id=%s
                        """,
                        (
                            stored_payload["filename"],
                            stored_payload["file_extension"],
                            stored_payload["content_type"],
                            stored_payload["bucket"],
                            stored_payload["object_key"],
                            stored_payload["storage_backend"],
                            stored_payload["size_bytes"],
                            stored_payload["content_sha256"],
                            stored_payload["upload_time"],
                            stored_payload["gid"],
                            stored_payload["owner_user_id"],
                            stored_payload["owner_user_email"],
                            stored_payload["auth_provider"],
                            stored_payload["purpose"],
                            stored_payload["conversation_id"],
                            seed_payload["file_id"],
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO file_mapping(
                            file_id, filename, file_extension, content_type, bucket,
                            object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                            owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            seed_payload["file_id"],
                            stored_payload["filename"],
                            stored_payload["file_extension"],
                            stored_payload["content_type"],
                            stored_payload["bucket"],
                            stored_payload["object_key"],
                            stored_payload["storage_backend"],
                            stored_payload["size_bytes"],
                            stored_payload["content_sha256"],
                            stored_payload["upload_time"],
                            stored_payload["gid"],
                            stored_payload["owner_user_id"],
                            stored_payload["owner_user_email"],
                            stored_payload["auth_provider"],
                            stored_payload["purpose"],
                            stored_payload["conversation_id"],
                        ),
                    )
            else:
                if existing:
                    conn.execute(
                        """
                        UPDATE file_mapping
                           SET filename=?,
                               file_extension=?,
                               content_type=?,
                               bucket=?,
                               object_key=?,
                               storage_backend=?,
                               size_bytes=?,
                               content_sha256=?,
                               upload_time=?,
                               gid=?,
                               owner_user_id=?,
                               owner_user_email=?,
                               auth_provider=?,
                               purpose=?,
                               conversation_id=?
                         WHERE file_id=?
                        """,
                        (
                            stored_payload["filename"],
                            stored_payload["file_extension"],
                            stored_payload["content_type"],
                            stored_payload["bucket"],
                            stored_payload["object_key"],
                            stored_payload["storage_backend"],
                            stored_payload["size_bytes"],
                            stored_payload["content_sha256"],
                            stored_payload["upload_time"],
                            stored_payload["gid"],
                            stored_payload["owner_user_id"],
                            stored_payload["owner_user_email"],
                            stored_payload["auth_provider"],
                            stored_payload["purpose"],
                            stored_payload["conversation_id"],
                            seed_payload["file_id"],
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO file_mapping(
                            file_id, filename, file_extension, content_type, bucket,
                            object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                            owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            seed_payload["file_id"],
                            stored_payload["filename"],
                            stored_payload["file_extension"],
                            stored_payload["content_type"],
                            stored_payload["bucket"],
                            stored_payload["object_key"],
                            stored_payload["storage_backend"],
                            stored_payload["size_bytes"],
                            stored_payload["content_sha256"],
                            stored_payload["upload_time"],
                            stored_payload["gid"],
                            stored_payload["owner_user_id"],
                            stored_payload["owner_user_email"],
                            stored_payload["auth_provider"],
                            stored_payload["purpose"],
                            stored_payload["conversation_id"],
                        ),
                    )
        conn.commit()
    gpt_logger.info("regulation_knowledge_seed_sync completed total=%s", len(source_files))
    return summary


def _sync_seed_regulation_knowledge_files_to_storage() -> None:
    if (
        not model_config.FORCE_REGULATION_KNOWLEDGE_SEED_SYNC
        and _startup_task_completed(REGULATION_KNOWLEDGE_SEED_SYNC_TASK_KEY)
    ):
        gpt_logger.info(
            "regulation_knowledge_seed_sync skipped task_key=%s node_id=%s reason=already_completed_for_node",
            REGULATION_KNOWLEDGE_SEED_SYNC_TASK_KEY,
            _startup_task_node_id(),
        )
        return

    summary = _run_seed_regulation_knowledge_files_to_storage()
    if summary["total"] <= 0:
        return
    _mark_startup_task_completed(REGULATION_KNOWLEDGE_SEED_SYNC_TASK_KEY, summary)


def _ensure_file_mapping_owner_columns() -> None:
    with _connect() as conn:
        if _use_postgres():
            conn.execute("ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS owner_user_id TEXT")
            conn.execute("ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS owner_user_email TEXT")
            conn.execute("ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS auth_provider TEXT")
            conn.execute(
                "ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'session_attachment'"
            )
            conn.execute("ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS conversation_id TEXT")
            conn.execute("ALTER TABLE file_mapping ADD COLUMN IF NOT EXISTS content_sha256 TEXT")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_file_mapping_owner
                  ON file_mapping(owner_user_id, owner_user_email)
                """
            )
            conn.execute(
                """
                UPDATE file_mapping
                   SET auth_provider=%s
                 WHERE auth_provider IS NULL OR auth_provider=''
                """,
                (DEFAULT_AUTH_PROVIDER,),
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_resource ON file_mapping(gid, purpose, conversation_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_owner_content ON file_mapping(owner_user_id, owner_user_email, auth_provider, content_sha256)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_object ON file_mapping(bucket, object_key)"
            )
        else:
            columns = _sqlite_columns(conn, "file_mapping")
            if "owner_user_id" not in columns:
                conn.execute("ALTER TABLE file_mapping ADD COLUMN owner_user_id TEXT")
            if "owner_user_email" not in columns:
                conn.execute("ALTER TABLE file_mapping ADD COLUMN owner_user_email TEXT")
            if "auth_provider" not in columns:
                conn.execute(
                    f"ALTER TABLE file_mapping ADD COLUMN auth_provider TEXT NOT NULL DEFAULT '{DEFAULT_AUTH_PROVIDER}'"
                )
            if "purpose" not in columns:
                conn.execute(
                    "ALTER TABLE file_mapping ADD COLUMN purpose TEXT NOT NULL DEFAULT 'session_attachment'"
                )
            if "conversation_id" not in columns:
                conn.execute("ALTER TABLE file_mapping ADD COLUMN conversation_id TEXT")
            if "content_sha256" not in columns:
                conn.execute("ALTER TABLE file_mapping ADD COLUMN content_sha256 TEXT")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_file_mapping_owner
                  ON file_mapping(owner_user_id, owner_user_email)
                """
            )
            conn.execute(
                f"""
                UPDATE file_mapping
                   SET auth_provider='{DEFAULT_AUTH_PROVIDER}'
                 WHERE auth_provider IS NULL OR auth_provider=''
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_resource ON file_mapping(gid, purpose, conversation_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_owner_content ON file_mapping(owner_user_id, owner_user_email, auth_provider, content_sha256)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_object ON file_mapping(bucket, object_key)"
            )
        conn.commit()


def _ensure_file_upload_reservations_auth_provider_column() -> None:
    with _connect() as conn:
        if _use_postgres():
            exists_row = conn.execute(
                "SELECT to_regclass('file_upload_reservations') IS NOT NULL AS exists"
            ).fetchone()
            exists = bool(_normalize_row(exists_row).get("exists")) if exists_row else False
            if not exists:
                return
        elif not _sqlite_table_exists(conn, "file_upload_reservations"):
            return
        if _use_postgres():
            conn.execute("ALTER TABLE file_upload_reservations ADD COLUMN IF NOT EXISTS auth_provider TEXT")
            conn.execute(
                """
                UPDATE file_upload_reservations
                   SET auth_provider=%s
                 WHERE auth_provider IS NULL OR auth_provider=''
                """,
                (DEFAULT_AUTH_PROVIDER,),
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner
                  ON file_upload_reservations(gid, owner_user_id, owner_user_email, auth_provider)
                """
            )
        else:
            columns = _sqlite_columns(conn, "file_upload_reservations")
            if "auth_provider" not in columns:
                conn.execute(
                    f"ALTER TABLE file_upload_reservations ADD COLUMN auth_provider TEXT NOT NULL DEFAULT '{DEFAULT_AUTH_PROVIDER}'"
                )
            conn.execute(
                f"""
                UPDATE file_upload_reservations
                   SET auth_provider='{DEFAULT_AUTH_PROVIDER}'
                 WHERE auth_provider IS NULL OR auth_provider=''
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner ON file_upload_reservations(gid, owner_user_id, owner_user_email, auth_provider)"
            )
        conn.commit()


def _ensure_user_gpts_state_is_pinned_column() -> None:
    with _connect() as conn:
        if _use_postgres():
            exists_row = conn.execute(
                "SELECT to_regclass('user_gpts_state') IS NOT NULL AS exists"
            ).fetchone()
            exists = bool(_normalize_row(exists_row).get("exists")) if exists_row else False
            if not exists:
                return
            conn.execute(
                "ALTER TABLE user_gpts_state ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT TRUE"
            )
        else:
            if not _sqlite_table_exists(conn, "user_gpts_state"):
                return
            columns = _sqlite_columns(conn, "user_gpts_state")
            if "is_pinned" not in columns:
                conn.execute(
                    "ALTER TABLE user_gpts_state ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 1"
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
            "content_sha256": item.get("content_sha256"),
            "upload_time": item.get("upload_time") or _now_iso(),
            "gid": item.get("gid") or "gptassistant",
            "owner_user_id": item.get("owner_user_id"),
            "owner_user_email": item.get("owner_user_email"),
            "auth_provider": item.get("auth_provider") or DEFAULT_AUTH_PROVIDER,
            "purpose": item.get("purpose") or "session_attachment",
            "conversation_id": item.get("conversation_id"),
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
            "content_sha256": None,
            "upload_time": item.get("uploadTime") or _now_iso(),
            "gid": item.get("gid") or "gptassistant",
            "owner_user_id": None,
            "owner_user_email": None,
            "auth_provider": DEFAULT_AUTH_PROVIDER,
            "purpose": "session_attachment",
            "conversation_id": None,
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
                    object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                    owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    normalized.get("content_sha256"),
                    normalized.get("upload_time") or _now_iso(),
                    normalized.get("gid") or "gptassistant",
                    normalized.get("owner_user_id"),
                    normalized.get("owner_user_email"),
                    normalized.get("auth_provider") or DEFAULT_AUTH_PROVIDER,
                    normalized.get("purpose") or "session_attachment",
                    normalized.get("conversation_id"),
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
    if _skip_startup_sqlite_migration():
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
        f"inserted={totals['inserted']} skipped={totals['skipped']}",
        flush=True,
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
                            INSERT INTO agents(gid, config)
                            VALUES (%s, %s::jsonb)
                            ON CONFLICT (gid) DO UPDATE SET config=EXCLUDED.config
                            """,
                            (gid, config),
                        )
                        summary["custom_gpts"] += 1

                if _sqlite_table_exists(sqlite_conn, "user_gpts_state"):
                    user_gpts_state_columns = _sqlite_columns(sqlite_conn, "user_gpts_state")
                    select_pin_state_sql = (
                        "SELECT user_id, gpts_id, is_pinned, pinned_at FROM user_gpts_state"
                        if "is_pinned" in user_gpts_state_columns
                        else "SELECT user_id, gpts_id, pinned_at FROM user_gpts_state"
                    )
                    for row in sqlite_conn.execute(
                        select_pin_state_sql
                    ).fetchall():
                        item = _normalize_row(row)
                        user_id = str(item.get("user_id") or "").strip()
                        gpts_id = str(item.get("gpts_id") or "").strip()
                        is_pinned = (
                            _coerce_bool(item.get("is_pinned"))
                            if "is_pinned" in item
                            else True
                        )
                        pinned_at = str(item.get("pinned_at") or "").strip() or _now_iso()
                        if not user_id or not gpts_id:
                            continue
                        conn.execute(
                            """
                            INSERT INTO user_gpts_state(user_id, gpts_id, is_pinned, pinned_at)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (user_id, gpts_id) DO NOTHING
                            """,
                            (user_id, gpts_id, bool(is_pinned), pinned_at),
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
    if _skip_startup_sqlite_migration():
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
        f"user_config_version={totals['user_config_version']}",
        flush=True,
    )


def _skip_startup_sqlite_migration() -> bool:
    return os.getenv("ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


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
    finally:
        _INITIALIZED = previous_initialized

    return [
        {
            "config_key": "gpts_feature_enabled",
            "config_value": bool(model_config.GPTS_FEATURE_ENABLED),
            "value_type": "boolean",
            "description": "Enable GPTS feature",
        },
        {
            "config_key": "gpts_visible_scope",
            "config_value": "restricted" if model_config.GPTS_WHITE_LIST else "all",
            "value_type": "string",
            "description": "Controls whether GPTS is visible to all users or restricted to listed users.",
        },
        {
            "config_key": "gpts_visible_users",
            "config_value": sorted(
                str(item).strip() for item in model_config.GPTS_WHITE_LIST if str(item).strip()
            ),
            "value_type": "json",
            "description": "List of user identifiers that can see GPTS when visibility is restricted.",
        },
        {
            "config_key": "external_assistant_feature_enabled",
            "config_value": bool(model_config.EXTERNAL_ASSISTANT_FEATURE_ENABLED),
            "value_type": "boolean",
            "description": "Enable the external assistant workspace entry.",
        },
        {
            "config_key": "external_assistant_visible_scope",
            "config_value": "restricted",
            "value_type": "string",
            "description": "Controls whether the external assistant workspace is visible to all users or restricted to listed users.",
        },
        {
            "config_key": "external_assistant_visible_users",
            "config_value": sorted(
                str(item).strip()
                for item in model_config.EXTERNAL_ASSISTANT_WHITE_LIST
                if str(item).strip()
            ),
            "value_type": "json",
            "description": "List of user identifiers that can see the external assistant workspace when visibility is restricted.",
        },
        {
            "config_key": "external_assistant_base_url",
            "config_value": model_config.EXTERNAL_ASSISTANT_URL,
            "value_type": "string",
            "description": "Smart Office base URL or same-origin base path, for example /b/.",
        },
        {
            "config_key": "external_assistant_menus",
            "config_value": [
                {
                    "id": "home",
                    "label": model_config.EXTERNAL_ASSISTANT_TITLE,
                    "path": "",
                }
            ],
            "value_type": "json",
            "description": "Smart Office menus as JSON: [{\"id\":\"new-chat\",\"label\":\"新建会话\",\"path\":\"chat/new\"}]. Paths are relative to the base URL.",
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
    if config_key == "gpts_visible_scope":
        return not (isinstance(current_value, str) and current_value.strip().lower() in {"all", "restricted"})
    if config_key == "gpts_visible_users":
        return not isinstance(current_value, list)
    if config_key == "external_assistant_feature_enabled":
        return not isinstance(current_value, bool)
    if config_key == "external_assistant_visible_scope":
        return not (
            isinstance(current_value, str)
            and current_value.strip().lower() in {"all", "restricted"}
        )
    if config_key == "external_assistant_visible_users":
        return not isinstance(current_value, list)
    if config_key == "external_assistant_base_url":
        return not isinstance(current_value, str)
    if config_key == "external_assistant_menus":
        return not isinstance(current_value, list)

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
    gpt_logger.info("business_storage_init started backend=%s", business_storage_backend())
    with _connect() as conn:
        _ensure_file_upload_reservations_auth_provider_column()
        _ensure_user_gpts_state_is_pinned_column()
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
                  config JSONB NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agents (
                  gid TEXT PRIMARY KEY,
                  config JSONB NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_gpts_state (
                  user_id TEXT NOT NULL,
                  gpts_id TEXT NOT NULL,
                  is_pinned BOOLEAN NOT NULL DEFAULT TRUE,
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
                  content_sha256 TEXT,
                  upload_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  gid TEXT NOT NULL,
                  owner_user_id TEXT,
                  owner_user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  purpose TEXT NOT NULL DEFAULT 'session_attachment',
                  conversation_id TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_mapping_gid ON file_mapping(gid)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS file_upload_reservations (
                  reservation_id TEXT PRIMARY KEY,
                  gid TEXT NOT NULL,
                  owner_user_id TEXT,
                  owner_user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner
                  ON file_upload_reservations(gid, owner_user_id, owner_user_email, auth_provider)
                """
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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS startup_task_state (
                  node_id TEXT NOT NULL,
                  task_key TEXT NOT NULL,
                  status TEXT NOT NULL,
                  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  summary TEXT NOT NULL DEFAULT '',
                  error TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (node_id, task_key)
                )
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
                  config TEXT NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                );
                CREATE TABLE IF NOT EXISTS agents (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                );
                CREATE TABLE IF NOT EXISTS user_gpts_state (
                  user_id TEXT NOT NULL,
                  gpts_id TEXT NOT NULL,
                  is_pinned INTEGER NOT NULL DEFAULT 1,
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
                  content_sha256 TEXT,
                  upload_time TEXT NOT NULL,
                  gid TEXT NOT NULL,
                  owner_user_id TEXT,
                  owner_user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  purpose TEXT NOT NULL DEFAULT 'session_attachment',
                  conversation_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_file_mapping_gid ON file_mapping(gid);
                CREATE TABLE IF NOT EXISTS file_upload_reservations (
                  reservation_id TEXT PRIMARY KEY,
                  gid TEXT NOT NULL,
                  owner_user_id TEXT,
                  owner_user_email TEXT,
                  auth_provider TEXT NOT NULL DEFAULT 'c',
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner
                  ON file_upload_reservations(gid, owner_user_id, owner_user_email, auth_provider);
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
                CREATE TABLE IF NOT EXISTS startup_task_state (
                  node_id TEXT NOT NULL,
                  task_key TEXT NOT NULL,
                  status TEXT NOT NULL,
                  completed_at TEXT NOT NULL,
                  summary TEXT NOT NULL DEFAULT '',
                  error TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (node_id, task_key)
                );
                """
            )
        conn.commit()
        _ensure_session_history_meta_auth_provider_column()
        _ensure_custom_gpts_metadata_columns()
        _ensure_agents_metadata_columns()
        _seed_admin_model_configs_if_empty()
        _seed_admin_user_permissions_if_empty()
        _seed_admin_feature_flags_if_empty()
        _migrate_legacy_custom_gpts_to_agents()
    _ensure_file_mapping_owner_columns()
    _sync_seed_system_gpts_to_storage()
    _sync_seed_regulation_knowledge_files_to_storage()
    _migrate_sqlite_file_mapping_to_postgres_if_needed()
    _migrate_sqlite_light_business_tables_to_postgres_if_needed()
    if not _skip_startup_sqlite_migration():
        _backfill_session_history_meta_from_existing_history()
    _INITIALIZED = True
    gpt_logger.info("business_storage_init completed backend=%s", business_storage_backend())


def business_storage_health() -> dict[str, Any]:
    details: dict[str, Any] = {
        "backend": business_storage_backend(),
        "healthy": False,
    }
    try:
        ensure_initialized()
        with _connect() as conn:
            conn.execute("SELECT 1").fetchone()
            unowned_row = conn.execute(
                """
                SELECT COUNT(*) AS total
                  FROM file_mapping
                 WHERE (owner_user_id IS NULL OR owner_user_id='')
                   AND (owner_user_email IS NULL OR owner_user_email='')
                """
            ).fetchone()
        unowned_file_mappings = int((_normalize_row(unowned_row) or {}).get("total") or 0)
        details["unowned_file_mappings"] = unowned_file_mappings
        if unowned_file_mappings:
            details["warning"] = "Legacy file mappings without owner identity are not user-accessible"
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


from app.storage.gpts_store import (
    delete_custom_gpt,
    delete_user_gpt_state_by_gid,
    get_user_config_version,
    insert_custom_gpt,
    is_gpt_pinned,
    list_pinned_gids,
    list_user_gpt_pin_states,
    list_user_pinned_rows,
    load_custom_gpts,
    set_user_config_version,
    set_user_gpt_pin,
    update_custom_gpt,
)


from app.storage.file_store import (
    bind_file_mappings_to_conversation,
    count_file_mapping_object_references,
    count_file_mappings,
    delete_file_mapping,
    find_owned_file_mapping_by_content,
    get_file_mapping,
    insert_file_mapping,
    list_file_mappings,
    release_file_upload_slot,
    reserve_file_upload_slot,
)


@contextmanager
def distributed_task_lock(lock_name: str) -> Iterator[bool]:
    ensure_initialized()
    if not _use_postgres():
        if fcntl is None:
            yield True
            return
        os.makedirs(DATA_DIR, exist_ok=True)
        lock_digest = hashlib.sha256(lock_name.encode("utf-8")).hexdigest()[:16]
        lock_path = Path(DATA_DIR) / f".task-lock-{lock_digest}"
        with lock_path.open("a+") as lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
                return
            try:
                yield True
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        return

    with _connect() as conn:
        row = conn.execute(
            "SELECT pg_try_advisory_lock(hashtext(%s)) AS acquired",
            (lock_name,),
        ).fetchone()
        acquired = bool((_normalize_row(row) or {}).get("acquired"))
        try:
            yield acquired
        finally:
            if acquired:
                conn.execute(
                    "SELECT pg_advisory_unlock(hashtext(%s))",
                    (lock_name,),
                )
                conn.commit()




from app.storage.admin_store import (
    delete_admin_feature_flag,
    delete_admin_model_config,
    delete_admin_user_permission,
    get_admin_feature_flag,
    get_admin_model_config,
    get_admin_user_permission,
    insert_admin_audit_log,
    list_admin_audit_logs,
    list_admin_feature_flags,
    list_admin_model_configs,
    list_admin_user_permissions,
    list_enabled_permissions_for_user,
    upsert_admin_feature_flag,
    upsert_admin_model_config,
    upsert_admin_user_permission,
)


def prune_admin_feature_flags_for_deleted_model(
    model_id: str,
    *,
    updated_by: str | None = None,
) -> dict[str, Any]:
    ensure_initialized()
    normalized_model_id = str(model_id or "").strip()
    if not normalized_model_id:
        return {}

    changed: dict[str, Any] = {}
    now = _now_iso()
    updater = str(updated_by or "system-model-delete").strip() or "system-model-delete"

    with _connect() as conn:
        if _use_postgres():
            visible_row = conn.execute(
                """
                SELECT config_value, value_type, description
                  FROM admin_feature_flags
                 WHERE config_key=%s
                """,
                ("default_visible_models",),
            ).fetchone()
            if visible_row is not None:
                visible_item = _normalize_row(visible_row)
                current_visible = _load_json_field(
                    visible_item.get("config_value"),
                    fallback=visible_item.get("config_value"),
                )
                if isinstance(current_visible, list):
                    next_visible = [
                        str(item).strip()
                        for item in current_visible
                        if str(item).strip() and str(item).strip() != normalized_model_id
                    ]
                    if next_visible != current_visible:
                        conn.execute(
                            """
                            UPDATE admin_feature_flags
                               SET config_value=%s::jsonb,
                                   updated_at=%s,
                                   updated_by=%s
                             WHERE config_key=%s
                            """,
                            (
                                _dump_json_field(next_visible, fallback=[]),
                                now,
                                updater,
                                "default_visible_models",
                            ),
                        )
                        changed["default_visible_models"] = next_visible

            default_row = conn.execute(
                """
                SELECT config_value, value_type, description
                  FROM admin_feature_flags
                 WHERE config_key=%s
                """,
                ("default_model",),
            ).fetchone()
            if default_row is not None:
                default_item = _normalize_row(default_row)
                current_default = str(
                    _load_json_field(
                        default_item.get("config_value"),
                        fallback=default_item.get("config_value"),
                    )
                    or ""
                ).strip()
                if current_default == normalized_model_id:
                    conn.execute(
                        """
                        UPDATE admin_feature_flags
                           SET config_value=%s::jsonb,
                               updated_at=%s,
                               updated_by=%s
                         WHERE config_key=%s
                        """,
                        (
                            _dump_json_field("", fallback=""),
                            now,
                            updater,
                            "default_model",
                        ),
                    )
                    changed["default_model"] = ""
        else:
            visible_row = conn.execute(
                """
                SELECT config_value, value_type, description
                  FROM admin_feature_flags
                 WHERE config_key=?
                """,
                ("default_visible_models",),
            ).fetchone()
            if visible_row is not None:
                visible_item = _normalize_row(visible_row)
                current_visible = _load_json_field(
                    visible_item.get("config_value"),
                    fallback=visible_item.get("config_value"),
                )
                if isinstance(current_visible, list):
                    next_visible = [
                        str(item).strip()
                        for item in current_visible
                        if str(item).strip() and str(item).strip() != normalized_model_id
                    ]
                    if next_visible != current_visible:
                        conn.execute(
                            """
                            UPDATE admin_feature_flags
                               SET config_value=?,
                                   updated_at=?,
                                   updated_by=?
                             WHERE config_key=?
                            """,
                            (
                                _dump_json_field(next_visible, fallback=[]),
                                now,
                                updater,
                                "default_visible_models",
                            ),
                        )
                        changed["default_visible_models"] = next_visible

            default_row = conn.execute(
                """
                SELECT config_value, value_type, description
                  FROM admin_feature_flags
                 WHERE config_key=?
                """,
                ("default_model",),
            ).fetchone()
            if default_row is not None:
                default_item = _normalize_row(default_row)
                current_default = str(
                    _load_json_field(
                        default_item.get("config_value"),
                        fallback=default_item.get("config_value"),
                    )
                    or ""
                ).strip()
                if current_default == normalized_model_id:
                    conn.execute(
                        """
                        UPDATE admin_feature_flags
                           SET config_value=?,
                               updated_at=?,
                               updated_by=?
                         WHERE config_key=?
                        """,
                        (
                            _dump_json_field("", fallback=""),
                            now,
                            updater,
                            "default_model",
                        ),
                    )
                    changed["default_model"] = ""
        conn.commit()
    return changed




__all__ = [
    "bind_file_mappings_to_conversation",
    "business_storage_backend",
    "business_storage_health",
    "close_business_storage",
    "count_file_mappings",
    "count_file_mapping_object_references",
    "FileUploadQuotaExceeded",
    "delete_custom_gpt",
    "delete_admin_feature_flag",
    "delete_admin_model_config",
    "delete_admin_user_permission",
    "delete_file_mapping",
    "distributed_task_lock",
    "delete_session_history",
    "delete_user_gpt_state_by_gid",
    "ensure_initialized",
    "get_admin_feature_flag",
    "get_admin_model_config",
    "get_admin_user_permission",
    "insert_admin_audit_log",
    "get_file_mapping",
    "find_owned_file_mapping_by_content",
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
    "list_user_gpt_pin_states",
    "list_user_pinned_rows",
    "release_file_upload_slot",
    "reserve_file_upload_slot",
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
