from __future__ import annotations

from typing import Any

from .providers.openai_compat import OpenAICompatProvider
from .stream import register_provider


def create_openai_compat_provider(client: Any) -> OpenAICompatProvider:
    return OpenAICompatProvider(client)


def register_openai_compat_provider(client: Any) -> OpenAICompatProvider:
    provider = create_openai_compat_provider(client)
    register_provider(provider)
    return provider
