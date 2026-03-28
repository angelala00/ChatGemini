from __future__ import annotations

from dataclasses import replace

from .types import Model, Usage


class ModelRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, dict[str, Model]] = {}

    def register(self, model: Model) -> None:
        provider_models = self._providers.setdefault(model.provider, {})
        provider_models[model.id] = model

    def register_many(self, models: list[Model]) -> None:
        for model in models:
            self.register(model)

    def get_model(self, provider: str, model_id: str) -> Model:
        return self._providers[provider][model_id]

    def get_models(self, provider: str) -> list[Model]:
        return sorted(self._providers.get(provider, {}).values(), key=lambda model: model.id)

    def get_providers(self) -> list[str]:
        return sorted(self._providers.keys())

    def has_model(self, provider: str, model_id: str) -> bool:
        return model_id in self._providers.get(provider, {})

    def clear(self) -> None:
        self._providers.clear()


_DEFAULT_REGISTRY = ModelRegistry()


def register_model(model: Model) -> None:
    _DEFAULT_REGISTRY.register(model)


def register_models(models: list[Model]) -> None:
    _DEFAULT_REGISTRY.register_many(models)


def get_model(provider: str, model_id: str) -> Model:
    return _DEFAULT_REGISTRY.get_model(provider, model_id)


def get_models(provider: str) -> list[Model]:
    return _DEFAULT_REGISTRY.get_models(provider)


def get_providers() -> list[str]:
    return _DEFAULT_REGISTRY.get_providers()


def has_model(provider: str, model_id: str) -> bool:
    return _DEFAULT_REGISTRY.has_model(provider, model_id)


def clear_models() -> None:
    _DEFAULT_REGISTRY.clear()


def supports_xhigh(model: Model) -> bool:
    if model.metadata.get("supports_xhigh") is True:
        return True

    normalized_id = model.id.lower()
    if "gpt-5.2" in normalized_id or "gpt-5.3" in normalized_id or "gpt-5.4" in normalized_id:
        return True

    if "opus-4-6" in normalized_id or "opus-4.6" in normalized_id:
        return True

    return False


def models_are_equal(a: Model | None, b: Model | None) -> bool:
    if not a or not b:
        return False
    return a.id == b.id and a.provider == b.provider


def calculate_cost(model: Model, usage: Usage) -> Usage:
    usage.cost.input = (model.cost.input / 1_000_000) * usage.input
    usage.cost.output = (model.cost.output / 1_000_000) * usage.output
    usage.cost.cache_read = (model.cost.cache_read / 1_000_000) * usage.cache_read
    usage.cost.cache_write = (model.cost.cache_write / 1_000_000) * usage.cache_write
    usage.cost.total = (
        usage.cost.input
        + usage.cost.output
        + usage.cost.cache_read
        + usage.cost.cache_write
    )
    usage.total_tokens = usage.input + usage.output + usage.cache_read + usage.cache_write
    return replace(usage)
