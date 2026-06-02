from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.base_config import model_config

try:
    from minio import Minio
except Exception:  # pragma: no cover - optional dependency in filesystem dev mode
    Minio = None

OBJECT_BACKEND = model_config.OBJECT_STORAGE_BACKEND
LOCAL_UPLOAD_ROOT = Path(model_config.FILE_BASE) / "gptassistant" / "uploads"
LOCAL_CACHE_ROOT = Path(model_config.FILE_BASE) / "gptassistant" / "cache"
_CLIENT: Minio | None = None


def object_storage_backend() -> str:
    return OBJECT_BACKEND


def _use_minio() -> bool:
    return object_storage_backend() == "minio"


def init_object_store() -> None:
    LOCAL_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    LOCAL_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    if not _use_minio():
        return
    client = _get_minio_client()
    if not client.bucket_exists(model_config.MINIO_BUCKET):
        bucket_kwargs = {}
        if model_config.MINIO_REGION:
            bucket_kwargs["location"] = model_config.MINIO_REGION
        client.make_bucket(model_config.MINIO_BUCKET, **bucket_kwargs)


def _get_minio_client() -> Minio:
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    if Minio is None:
        raise RuntimeError("minio is required when OBJECT_STORAGE_BACKEND=minio")
    if not model_config.MINIO_ENDPOINT:
        raise RuntimeError("MINIO_ENDPOINT is required when OBJECT_STORAGE_BACKEND=minio")
    _CLIENT = Minio(
        model_config.MINIO_ENDPOINT,
        access_key=model_config.MINIO_ACCESS_KEY,
        secret_key=model_config.MINIO_SECRET_KEY,
        secure=model_config.MINIO_SECURE,
        region=model_config.MINIO_REGION or None,
    )
    return _CLIENT


def store_bytes(
    *,
    file_id: str,
    filename: str,
    content: bytes,
    content_type: str | None = None,
) -> dict[str, object]:
    init_object_store()
    suffix = Path(filename).suffix
    if _use_minio():
        client = _get_minio_client()
        date_part = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        prefix = model_config.MINIO_BASE_PREFIX.strip("/")
        object_key = "/".join(
            part for part in (prefix, date_part, f"{file_id}{suffix}") if part
        )
        client.put_object(
            model_config.MINIO_BUCKET,
            object_key,
            io.BytesIO(content),
            length=len(content),
            content_type=content_type or "application/octet-stream",
        )
        return {
            "bucket": model_config.MINIO_BUCKET,
            "object_key": object_key,
            "storage_backend": "minio",
            "size_bytes": len(content),
        }

    target = LOCAL_UPLOAD_ROOT / file_id
    with target.open("wb") as file:
        file.write(content)
    return {
        "bucket": "",
        "object_key": str(target),
        "storage_backend": "filesystem",
        "size_bytes": len(content),
    }


def ensure_local_path(entry: dict[str, object]) -> str:
    init_object_store()
    storage_backend = str(entry.get("storageBackend") or entry.get("storage_backend") or "")
    object_key = str(entry.get("objectKey") or entry.get("object_key") or "")
    if storage_backend == "filesystem":
        return object_key

    cache_path = _local_cache_path(entry)
    if cache_path.exists():
        return str(cache_path)

    client = _get_minio_client()
    client.fget_object(
        str(entry.get("bucket") or model_config.MINIO_BUCKET),
        object_key,
        str(cache_path),
    )
    return str(cache_path)


def delete_object(entry: dict[str, object]) -> None:
    init_object_store()
    storage_backend = str(entry.get("storageBackend") or entry.get("storage_backend") or "")
    object_key = str(entry.get("objectKey") or entry.get("object_key") or "")
    if storage_backend == "filesystem":
        path = Path(object_key)
        if path.exists():
            path.unlink()
        return

    client = _get_minio_client()
    client.remove_object(str(entry.get("bucket") or model_config.MINIO_BUCKET), object_key)


def get_object_bytes(entry: dict[str, object]) -> bytes:
    local_path = ensure_local_path(entry)
    return Path(local_path).read_bytes()


def local_cache_path(entry: dict[str, object]) -> str:
    return str(_local_cache_path(entry))


def _local_cache_path(entry: dict[str, object]) -> Path:
    file_id = str(entry.get("file_id") or entry.get("fileId") or "")
    suffix = str(entry.get("fileExtension") or entry.get("file_extension") or "")
    return LOCAL_CACHE_ROOT / f"{file_id}{suffix}"


def object_storage_health() -> dict[str, Any]:
    details: dict[str, Any] = {
        "backend": object_storage_backend(),
        "healthy": False,
    }
    try:
        init_object_store()
        details["cache_dir"] = str(LOCAL_CACHE_ROOT)
        if _use_minio():
            client = _get_minio_client()
            details["bucket"] = model_config.MINIO_BUCKET
            details["endpoint"] = model_config.MINIO_ENDPOINT
            details["bucket_exists"] = client.bucket_exists(model_config.MINIO_BUCKET)
        else:
            details["upload_root"] = str(LOCAL_UPLOAD_ROOT)
        details["healthy"] = True
    except Exception as exc:  # pragma: no cover - defensive health probe
        details["error"] = str(exc)
    return details


def cleanup_local_cache(*, retention_days: int | None = None) -> int:
    init_object_store()
    keep_days = retention_days or model_config.OBJECT_CACHE_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc).timestamp() - (keep_days * 86400)
    deleted = 0
    for path in LOCAL_CACHE_ROOT.iterdir():
        try:
            if not path.is_file():
                continue
            if path.stat().st_mtime >= cutoff:
                continue
            path.unlink()
            deleted += 1
        except OSError:
            continue
    return deleted


__all__ = [
    "cleanup_local_cache",
    "delete_object",
    "ensure_local_path",
    "get_object_bytes",
    "init_object_store",
    "local_cache_path",
    "object_storage_backend",
    "object_storage_health",
    "store_bytes",
]
