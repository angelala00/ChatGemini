from __future__ import annotations

from pathlib import Path

from app.storage.business_store import (
    count_file_mapping_object_references,
    delete_file_mapping,
    distributed_task_lock,
)
from app.storage.object_store import delete_object, local_cache_path


def file_object_lock_name(entry: dict[str, object]) -> str:
    content_sha256 = str(
        entry.get("contentSha256") or entry.get("content_sha256") or ""
    )
    if content_sha256:
        return f"file-content:{content_sha256}"
    bucket = str(entry.get("bucket") or "")
    object_key = str(entry.get("objectKey") or entry.get("object_key") or "")
    return f"file-object:{bucket}:{object_key}"


def delete_file_reference(file_id: str, entry: dict[str, object]) -> bool:
    bucket = str(entry.get("bucket") or "")
    object_key = str(entry.get("objectKey") or entry.get("object_key") or "")
    lock_name = file_object_lock_name(entry)
    with distributed_task_lock(lock_name) as acquired:
        if not acquired:
            raise RuntimeError("File object is currently being modified")
        reference_count = count_file_mapping_object_references(bucket, object_key)
        if reference_count <= 1:
            delete_object({"file_id": file_id, **entry})
        delete_file_mapping(file_id)

    cache_path = Path(local_cache_path({"file_id": file_id, **entry}))
    if cache_path.exists():
        try:
            cache_path.unlink()
        except OSError:
            pass
    return reference_count <= 1


def delete_unreferenced_object(
    file_id: str,
    entry: dict[str, object],
    *,
    lock_acquired: bool = False,
) -> bool:
    bucket = str(entry.get("bucket") or "")
    object_key = str(entry.get("objectKey") or entry.get("object_key") or "")
    if lock_acquired:
        if count_file_mapping_object_references(bucket, object_key) > 0:
            return False
        delete_object({"file_id": file_id, **entry})
        return True
    lock_name = file_object_lock_name(entry)
    with distributed_task_lock(lock_name) as acquired:
        if not acquired:
            raise RuntimeError("File object is currently being modified")
        if count_file_mapping_object_references(bucket, object_key) > 0:
            return False
        delete_object({"file_id": file_id, **entry})
        return True


__all__ = [
    "delete_file_reference",
    "delete_unreferenced_object",
    "file_object_lock_name",
]
