from __future__ import annotations

import asyncio
import time
from typing import Any, Mapping

import httpx

from app.base_config import model_config
from app.logger import gpt_logger

MODEL_METADATA_CACHE_TTL_SECONDS = 60.0

_MODEL_METADATA_CACHE: dict[str, dict[str, Any]] = {}
_MODEL_METADATA_CACHE_AT: float = 0.0
_MODEL_METADATA_LOCK = asyncio.Lock()


def _build_models_url() -> str:
    return f"{model_config.BASE_URL.rstrip('/')}/models"


def _build_headers() -> dict[str, str]:
    headers = {"Accept": "application/json"}
    api_key = (model_config.API_KEY or "").strip()
    if api_key:
        headers["Authorization"] = (
            api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
        )
    return headers


def _normalize_remote_model_entry(entry: Mapping[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    supports_reasoning = entry.get("supports_reasoning")
    if isinstance(supports_reasoning, bool):
        normalized["supports_reasoning"] = supports_reasoning

    supports_image_input = entry.get("supports_image_input")
    if isinstance(supports_image_input, bool):
        normalized["supports_native_image_input"] = supports_image_input

    supports_tool_calling = entry.get("supports_tool_calling")
    if isinstance(supports_tool_calling, bool):
        normalized["supports_tool_calling"] = supports_tool_calling

    reasoning_default_enabled = entry.get("reasoning_default_enabled")
    if isinstance(reasoning_default_enabled, bool):
        normalized["reasoning_default_enabled"] = reasoning_default_enabled

    reasoning_parser_mode = entry.get("reasoning_parser_mode")
    if isinstance(reasoning_parser_mode, str) and reasoning_parser_mode.strip():
        normalized["reasoning_parser_mode"] = reasoning_parser_mode.strip()

    reasoning_parameter_format = entry.get("reasoning_parameter_format")
    if isinstance(reasoning_parameter_format, str) and reasoning_parameter_format.strip():
        normalized["compat"] = {
            "reasoning_parameter_format": reasoning_parameter_format.strip(),
        }

    return normalized


async def fetch_remote_model_metadata(force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _MODEL_METADATA_CACHE_AT

    now = time.time()
    if (
        not force_refresh
        and _MODEL_METADATA_CACHE
        and now - _MODEL_METADATA_CACHE_AT < MODEL_METADATA_CACHE_TTL_SECONDS
    ):
        return dict(_MODEL_METADATA_CACHE)

    async with _MODEL_METADATA_LOCK:
        now = time.time()
        if (
            not force_refresh
            and _MODEL_METADATA_CACHE
            and now - _MODEL_METADATA_CACHE_AT < MODEL_METADATA_CACHE_TTL_SECONDS
        ):
            return dict(_MODEL_METADATA_CACHE)

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10.0, connect=5.0, read=10.0, write=10.0, pool=5.0),
                verify=False,
                trust_env=False,
            ) as client:
                response = await client.get(_build_models_url(), headers=_build_headers())
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data") if isinstance(payload, Mapping) else None
            next_cache: dict[str, dict[str, Any]] = {}
            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, Mapping):
                        continue
                    model_id = item.get("id")
                    if not isinstance(model_id, str) or not model_id.strip():
                        continue
                    next_cache[model_id.strip()] = _normalize_remote_model_entry(item)
            _MODEL_METADATA_CACHE.clear()
            _MODEL_METADATA_CACHE.update(next_cache)
            _MODEL_METADATA_CACHE_AT = now
        except Exception as exc:
            gpt_logger.warning(
                "remote_model_metadata_fetch_failed base_url=%s error=%s",
                model_config.BASE_URL,
                exc,
            )

        return dict(_MODEL_METADATA_CACHE)


def merge_model_metadata(model_item: dict[str, Any], metadata_by_model: Mapping[str, dict[str, Any]]) -> dict[str, Any]:
    merged = dict(model_item)
    model_name = merged.get("model_name") or merged.get("id")
    if not isinstance(model_name, str) or not model_name:
        return merged

    remote_metadata = metadata_by_model.get(model_name)
    if not isinstance(remote_metadata, Mapping):
        return merged

    for field_name in (
        "supports_reasoning",
        "supports_native_image_input",
        "supports_tool_calling",
        "reasoning_default_enabled",
        "reasoning_parser_mode",
    ):
        if field_name in remote_metadata:
            merged[field_name] = remote_metadata[field_name]

    remote_compat = remote_metadata.get("compat")
    if isinstance(remote_compat, Mapping):
        compat = dict(merged.get("compat") or {})
        compat.update(remote_compat)
        merged["compat"] = compat

    return merged


async def resolve_model_configs(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    metadata_by_model = await fetch_remote_model_metadata()
    return [merge_model_metadata(item, metadata_by_model) for item in models]


async def resolve_gptassistant_model_configs(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return await resolve_model_configs(models)
