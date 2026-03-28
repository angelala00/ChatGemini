from __future__ import annotations

from .types import Api, StreamProvider

_PROVIDERS: dict[Api, StreamProvider] = {}


def register_api_provider(provider: StreamProvider) -> None:
    _PROVIDERS[provider.api] = provider


def get_api_provider(api: Api) -> StreamProvider | None:
    return _PROVIDERS.get(api)


def list_registered_apis() -> list[Api]:
    return sorted(_PROVIDERS.keys())


def clear_api_providers() -> None:
    _PROVIDERS.clear()
