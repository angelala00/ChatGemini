from __future__ import annotations

from typing import Optional

from .api_registry import get_api_provider, register_api_provider
from .types import (
    Api,
    AssistantMessage,
    Context,
    Model,
    ProviderStreamOptions,
    SimpleStreamOptions,
    StreamProvider,
)


def register_provider(provider: StreamProvider) -> None:
    register_api_provider(provider)


def _resolve_provider(api: Api) -> StreamProvider:
    provider = get_api_provider(api)
    if provider is None:
        raise ValueError(f"No provider registered for api: {api}")
    return provider


def stream(
    model: Model,
    context: Context,
    options: Optional[ProviderStreamOptions] = None,
):
    provider = _resolve_provider(model.api)
    return provider.stream(model, context, options)


async def complete(
    model: Model,
    context: Context,
    options: Optional[ProviderStreamOptions] = None,
) -> AssistantMessage:
    return await stream(model, context, options).result()


def stream_simple(
    model: Model,
    context: Context,
    options: Optional[SimpleStreamOptions] = None,
):
    provider = _resolve_provider(model.api)
    return provider.stream_simple(model, context, options)


async def complete_simple(
    model: Model,
    context: Context,
    options: Optional[SimpleStreamOptions] = None,
) -> AssistantMessage:
    return await stream_simple(model, context, options).result()
