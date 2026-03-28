from __future__ import annotations

from typing import Optional, Protocol

from ..event_stream import AssistantMessageEventStream
from ..types import Context, Model, ProviderStreamOptions, SimpleStreamOptions


class ProviderAdapter(Protocol):
    api: str

    def stream(
        self,
        model: Model,
        context: Context,
        options: Optional[ProviderStreamOptions] = None,
    ) -> AssistantMessageEventStream:
        ...

    def stream_simple(
        self,
        model: Model,
        context: Context,
        options: Optional[SimpleStreamOptions] = None,
    ) -> AssistantMessageEventStream:
        ...
