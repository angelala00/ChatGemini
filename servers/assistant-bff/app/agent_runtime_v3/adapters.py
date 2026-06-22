from __future__ import annotations

from collections.abc import AsyncIterator, Iterable
from typing import Generic, Protocol, TypeVar

from .runtime import RuntimeEventStream
from .types import RuntimeEvent


TOutput = TypeVar("TOutput")


class RuntimeEventAdapter(Protocol, Generic[TOutput]):
    def adapt(self, event: RuntimeEvent) -> Iterable[TOutput]: ...


async def adapt_runtime_stream(
    runtime_stream: RuntimeEventStream,
    adapter: RuntimeEventAdapter[TOutput],
) -> AsyncIterator[TOutput]:
    """Translate Runtime events without coupling the Runtime to a transport."""

    async for event in runtime_stream:
        for output in adapter.adapt(event):
            yield output
