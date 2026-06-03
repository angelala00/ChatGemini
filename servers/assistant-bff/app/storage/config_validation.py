from __future__ import annotations

from app.base_config import model_config

_BUSINESS_BACKENDS = {"postgres", "sqlite"}
_OBJECT_BACKENDS = {"minio", "filesystem"}


def validate_storage_configuration() -> None:
    if model_config.BUSINESS_STORAGE_BACKEND not in _BUSINESS_BACKENDS:
        raise RuntimeError(
            f"Invalid BUSINESS_STORAGE_BACKEND={model_config.BUSINESS_STORAGE_BACKEND!r}; "
            f"expected one of {_BUSINESS_BACKENDS}"
        )

    if model_config.OBJECT_STORAGE_BACKEND not in _OBJECT_BACKENDS:
        raise RuntimeError(
            f"Invalid OBJECT_STORAGE_BACKEND={model_config.OBJECT_STORAGE_BACKEND!r}; "
            f"expected one of {_OBJECT_BACKENDS}"
        )

    if model_config.BUSINESS_STORAGE_BACKEND == "postgres" and not model_config.POSTGRES_DSN:
        raise RuntimeError("POSTGRES_DSN is required when BUSINESS_STORAGE_BACKEND=postgres")

    if model_config.BUSINESS_STORAGE_BACKEND == "postgres" and not model_config.SESSION_HISTORY_ENCRYPTION_KEY:
        raise RuntimeError(
            "SESSION_HISTORY_ENCRYPTION_KEY is required when BUSINESS_STORAGE_BACKEND=postgres"
        )
    if model_config.BUSINESS_STORAGE_BACKEND == "postgres":
        _validate_session_history_encryption_key(model_config.SESSION_HISTORY_ENCRYPTION_KEY)

    if model_config.OBJECT_STORAGE_BACKEND == "minio":
        missing = [
            name
            for name, value in (
                ("MINIO_ENDPOINT", model_config.MINIO_ENDPOINT),
                ("MINIO_ACCESS_KEY", model_config.MINIO_ACCESS_KEY),
                ("MINIO_SECRET_KEY", model_config.MINIO_SECRET_KEY),
                ("MINIO_BUCKET", model_config.MINIO_BUCKET),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(
                "Missing required MinIO settings when OBJECT_STORAGE_BACKEND=minio: "
                + ", ".join(missing)
            )

    for name, value in (
        ("USAGE_EVENT_RETENTION_DAYS", model_config.USAGE_EVENT_RETENTION_DAYS),
        ("TRACE_RETENTION_DAYS", model_config.TRACE_RETENTION_DAYS),
        ("OBJECT_CACHE_RETENTION_DAYS", model_config.OBJECT_CACHE_RETENTION_DAYS),
    ):
        if value < 1:
            raise RuntimeError(f"{name} must be >= 1")


def _validate_session_history_encryption_key(key: str) -> None:
    try:
        from cryptography.fernet import Fernet
    except Exception as exc:
        raise RuntimeError(
            "cryptography is required when SESSION_HISTORY_ENCRYPTION_KEY is configured"
        ) from exc
    try:
        Fernet(key.strip().encode("utf-8"))
    except Exception as exc:
        raise RuntimeError(
            "SESSION_HISTORY_ENCRYPTION_KEY must be a valid Fernet key. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        ) from exc


__all__ = ["validate_storage_configuration"]
