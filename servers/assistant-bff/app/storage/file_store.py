from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any


class _LazyCore:
    def __getattr__(self, name: str):
        module = importlib.import_module("app.storage.business_store")
        return getattr(module, name)


_core = _LazyCore()
_DEFAULT_AUTH_PROVIDER = "c"


def list_file_mappings(gid: str | None = None) -> dict[str, dict[str, Any]]:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if gid:
            if _core._use_postgres():
                rows = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE gid=%s
                    """,
                    (gid,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE gid=?
                    """,
                    (gid,),
                ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT file_id, filename, file_extension, content_type, bucket,
                       object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                       owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                  FROM file_mapping
                """
            ).fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _core._normalize_row(row)
        result[str(item["file_id"])] = {
            "filename": item.get("filename"),
            "fileExtension": item.get("file_extension"),
            "contentType": item.get("content_type"),
            "bucket": item.get("bucket"),
            "objectKey": item.get("object_key"),
            "storageBackend": item.get("storage_backend"),
            "sizeBytes": item.get("size_bytes"),
            "contentSha256": item.get("content_sha256"),
            "uploadTime": str(item.get("upload_time")),
            "gid": item.get("gid"),
            "ownerUserId": item.get("owner_user_id"),
            "ownerUserEmail": item.get("owner_user_email"),
            "authProvider": item.get("auth_provider") or _core.DEFAULT_AUTH_PROVIDER,
            "purpose": item.get("purpose") or "session_attachment",
            "conversationId": item.get("conversation_id"),
        }
    return result


def get_file_mapping(file_id: str, gid: str | None = None) -> dict[str, Any] | None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if gid:
            if _core._use_postgres():
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE file_id=%s AND gid=%s
                    """,
                    (file_id, gid),
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
                    (file_id, gid),
                ).fetchone()
        else:
            if _core._use_postgres():
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE file_id=%s
                    """,
                    (file_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT file_id, filename, file_extension, content_type, bucket,
                           object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                           owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                      FROM file_mapping
                     WHERE file_id=?
                    """,
                    (file_id,),
                ).fetchone()
    if not row:
        return None
    item = _core._normalize_row(row)
    return {
        "file_id": item.get("file_id"),
        "filename": item.get("filename"),
        "fileExtension": item.get("file_extension"),
        "contentType": item.get("content_type"),
        "bucket": item.get("bucket"),
        "objectKey": item.get("object_key"),
        "storageBackend": item.get("storage_backend"),
        "sizeBytes": item.get("size_bytes"),
        "contentSha256": item.get("content_sha256"),
        "uploadTime": str(item.get("upload_time")),
        "gid": item.get("gid"),
        "ownerUserId": item.get("owner_user_id"),
        "ownerUserEmail": item.get("owner_user_email"),
        "authProvider": item.get("auth_provider") or _core.DEFAULT_AUTH_PROVIDER,
        "purpose": item.get("purpose") or "session_attachment",
        "conversationId": item.get("conversation_id"),
    }


def find_owned_file_mapping_by_content(
    content_sha256: str,
    *,
    owner_user_id: str | None,
    owner_user_email: str | None,
    auth_provider: str | None = None,
) -> dict[str, Any] | None:
    _core.ensure_initialized()
    placeholder = "%s" if _core._use_postgres() else "?"
    if owner_user_id:
        owner_clause = f"owner_user_id={placeholder}"
        owner_value = owner_user_id
    elif owner_user_email:
        owner_clause = f"owner_user_id IS NULL AND owner_user_email={placeholder}"
        owner_value = owner_user_email
    else:
        return None
    provider_clause = ""
    provider_params: list[str] = []
    if auth_provider:
        provider_clause = f" AND auth_provider={placeholder}"
        provider_params.append(auth_provider)
    with _core._connect() as conn:
        row = conn.execute(
            f"""
            SELECT file_id
              FROM file_mapping
             WHERE content_sha256={placeholder}
               AND {owner_clause}
               {provider_clause}
             ORDER BY upload_time ASC
             LIMIT 1
            """,
            (content_sha256, owner_value, *provider_params),
        ).fetchone()
    if not row:
        return None
    return get_file_mapping(str(_core._normalize_row(row).get("file_id") or ""))


def count_file_mapping_object_references(bucket: str, object_key: str) -> int:
    _core.ensure_initialized()
    placeholder = "%s" if _core._use_postgres() else "?"
    with _core._connect() as conn:
        row = conn.execute(
            f"""
            SELECT COUNT(*) AS total
              FROM file_mapping
             WHERE bucket={placeholder} AND object_key={placeholder}
            """,
            (bucket, object_key),
        ).fetchone()
    return int((_core._normalize_row(row) or {}).get("total") or 0)


def count_file_mappings(
    gid: str | None = None,
    *,
    owner_user_id: str | None = None,
    owner_user_email: str | None = None,
    auth_provider: str | None = None,
) -> int:
    _core.ensure_initialized()
    conditions: list[str] = []
    params: list[str] = []
    placeholder = "%s" if _core._use_postgres() else "?"
    if gid:
        conditions.append(f"gid={placeholder}")
        params.append(gid)
    if owner_user_id:
        conditions.append(f"owner_user_id={placeholder}")
        params.append(owner_user_id)
    elif owner_user_email:
        conditions.append(f"owner_user_email={placeholder}")
        params.append(owner_user_email)
    if auth_provider:
        conditions.append(f"auth_provider={placeholder}")
        params.append(auth_provider)
    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    with _core._connect() as conn:
        row = conn.execute(
            f"SELECT COUNT(*) AS total FROM file_mapping{where_clause}",
            tuple(params),
        ).fetchone()
    item = _core._normalize_row(row)
    total = item.get("total", 0) if item else 0
    return int(total or 0)


def reserve_file_upload_slot(
    gid: str,
    *,
    owner_user_id: str | None,
    owner_user_email: str | None,
    auth_provider: str,
    max_user_files: int,
    max_system_files: int,
) -> str:
    _core.ensure_initialized()
    reservation_id = str(uuid.uuid4())
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    placeholder = "%s" if _core._use_postgres() else "?"
    owner_column = "owner_user_id" if owner_user_id else "owner_user_email"
    owner_value = owner_user_id or owner_user_email or ""
    with _core._connect() as conn:
        try:
            if _core._use_postgres():
                conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"file-upload:{gid}",))
            else:
                conn.execute("BEGIN IMMEDIATE")
            if _core._use_postgres():
                conn.execute(
                    "DELETE FROM file_upload_reservations WHERE created_at < NOW() - INTERVAL '15 minutes'"
                )
            else:
                conn.execute(
                    "DELETE FROM file_upload_reservations WHERE created_at < ?",
                    (cutoff,),
                )
            mapping_user_count = conn.execute(
                f"SELECT COUNT(*) AS total FROM file_mapping WHERE gid={placeholder} AND {owner_column}={placeholder} AND auth_provider={placeholder}",
                (gid, owner_value, auth_provider),
            ).fetchone()
            reservation_user_count = conn.execute(
                f"SELECT COUNT(*) AS total FROM file_upload_reservations WHERE gid={placeholder} AND {owner_column}={placeholder} AND auth_provider={placeholder}",
                (gid, owner_value, auth_provider),
            ).fetchone()
            mapping_system_count = conn.execute(
                f"SELECT COUNT(*) AS total FROM file_mapping WHERE gid={placeholder} AND auth_provider={placeholder}",
                (gid, auth_provider),
            ).fetchone()
            reservation_system_count = conn.execute(
                f"SELECT COUNT(*) AS total FROM file_upload_reservations WHERE gid={placeholder} AND auth_provider={placeholder}",
                (gid, auth_provider),
            ).fetchone()
            user_total = int(_core._normalize_row(mapping_user_count).get("total") or 0) + int(
                _core._normalize_row(reservation_user_count).get("total") or 0
            )
            system_total = int(_core._normalize_row(mapping_system_count).get("total") or 0) + int(
                _core._normalize_row(reservation_system_count).get("total") or 0
            )
            if user_total >= max_user_files:
                raise _core.FileUploadQuotaExceeded("user")
            if system_total >= max_system_files:
                raise _core.FileUploadQuotaExceeded("system")
            now = _core._now_iso()
            conn.execute(
                f"""
                INSERT INTO file_upload_reservations(
                    reservation_id, gid, owner_user_id, owner_user_email, auth_provider, created_at
                ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                """,
                (reservation_id, gid, owner_user_id, owner_user_email, auth_provider, now),
            )
            conn.commit()
            return reservation_id
        except Exception:
            conn.rollback()
            raise


def release_file_upload_slot(reservation_id: str | None) -> None:
    if not reservation_id:
        return
    _core.ensure_initialized()
    with _core._connect() as conn:
        placeholder = "%s" if _core._use_postgres() else "?"
        conn.execute(
            f"DELETE FROM file_upload_reservations WHERE reservation_id={placeholder}",
            (reservation_id,),
        )
        conn.commit()


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
    content_sha256: str | None = None,
    gid: str = "gptassistant",
    owner_user_id: str | None = None,
    owner_user_email: str | None = None,
    auth_provider: str = _DEFAULT_AUTH_PROVIDER,
    purpose: str = "session_attachment",
    conversation_id: str | None = None,
) -> None:
    _core.ensure_initialized()
    uploaded_at = _core._now_iso()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute(
                """
                INSERT INTO file_mapping(
                    file_id, filename, file_extension, content_type, bucket,
                    object_key, storage_backend, size_bytes, content_sha256, upload_time, gid,
                    owner_user_id, owner_user_email, auth_provider, purpose, conversation_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    content_sha256,
                    uploaded_at,
                    gid,
                    owner_user_id,
                    owner_user_email,
                    auth_provider,
                    purpose,
                    conversation_id,
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
                    file_id,
                    filename,
                    file_extension,
                    content_type,
                    bucket,
                    object_key,
                    storage_backend,
                    size_bytes,
                    content_sha256,
                    uploaded_at,
                    gid,
                    owner_user_id,
                    owner_user_email,
                    auth_provider,
                    purpose,
                    conversation_id,
                ),
            )
        conn.commit()


def bind_file_mappings_to_conversation(
    file_ids: list[str],
    *,
    gid: str,
    conversation_id: str,
    owner_user_id: str | None = None,
    owner_user_email: str | None = None,
    auth_provider: str | None = None,
) -> int:
    _core.ensure_initialized()
    normalized_file_ids = list(
        dict.fromkeys(file_id.strip() for file_id in file_ids if file_id.strip())
    )
    if not normalized_file_ids or not gid or not conversation_id:
        return 0
    owner_conditions: list[str] = []
    owner_params: list[str] = []
    placeholder = "%s" if _core._use_postgres() else "?"
    if owner_user_id:
        owner_conditions.append(f"owner_user_id={placeholder}")
        owner_params.append(owner_user_id)
    if owner_user_email:
        owner_conditions.append(
            f"(owner_user_id IS NULL AND owner_user_email={placeholder})"
        )
        owner_params.append(owner_user_email)
    if not owner_conditions:
        return 0
    provider_clause = ""
    provider_params: list[str] = []
    if auth_provider:
        provider_clause = f" AND auth_provider={placeholder}"
        provider_params.append(auth_provider)
    owner_clause = " OR ".join(owner_conditions)
    updated = 0
    with _core._connect() as conn:
        for file_id in normalized_file_ids:
            cursor = conn.execute(
                f"""
                UPDATE file_mapping
                   SET conversation_id={placeholder}
                 WHERE file_id={placeholder}
                   AND gid={placeholder}
                   AND purpose='session_attachment'
                   AND conversation_id IS NULL
                   {provider_clause}
                   AND ({owner_clause})
                """,
                (conversation_id, file_id, gid, *provider_params, *owner_params),
            )
            updated += max(0, int(cursor.rowcount or 0))
        conn.commit()
    return updated


def delete_file_mapping(file_id: str) -> None:
    _core.ensure_initialized()
    with _core._connect() as conn:
        if _core._use_postgres():
            conn.execute("DELETE FROM file_mapping WHERE file_id=%s", (file_id,))
        else:
            conn.execute("DELETE FROM file_mapping WHERE file_id=?", (file_id,))
        conn.commit()
