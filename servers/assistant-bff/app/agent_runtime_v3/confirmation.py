from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from app.base_config import model_config


_CONFIRMATION_SECRET = (
    model_config.AGENT_CONFIRMATION_SECRET.encode("utf-8")
    if model_config.AGENT_CONFIRMATION_SECRET
    else secrets.token_bytes(32)
)
CONFIRMATION_TOKEN_TTL_SECONDS = 300


def issue_confirmation_token(
    *,
    user_id: str,
    fingerprint: str,
    ttl_seconds: int = CONFIRMATION_TOKEN_TTL_SECONDS,
) -> str:
    payload = {
        "user_id": user_id,
        "fingerprint": fingerprint,
        "expires_at": int(time.time()) + ttl_seconds,
    }
    encoded_payload = _encode(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    signature = hmac.new(
        _CONFIRMATION_SECRET,
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_encode(signature)}"


def verify_confirmation_token(
    token: str,
    *,
    user_id: str,
    fingerprint: str,
) -> bool:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            _CONFIRMATION_SECRET,
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_decode(encoded_signature), expected_signature):
            return False
        payload = json.loads(_decode(encoded_payload))
        return (
            payload.get("user_id") == user_id
            and payload.get("fingerprint") == fingerprint
            and int(payload.get("expires_at") or 0) >= int(time.time())
        )
    except (ValueError, TypeError, json.JSONDecodeError):
        return False


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
