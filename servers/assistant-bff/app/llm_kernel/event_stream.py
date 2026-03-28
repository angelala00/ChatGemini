from __future__ import annotations

import asyncio
from typing import Generic, TypeVar

from .types import AssistantMessage, AssistantMessageEvent

TEvent = TypeVar("TEvent")
TResult = TypeVar("TResult")


class EventStream(Generic[TEvent, TResult]):
    def __init__(self) -> None:
        self._queue: asyncio.Queue[TEvent | None] = asyncio.Queue()
        self._result_future: asyncio.Future[TResult] = asyncio.get_running_loop().create_future()
        self._ended = False

    def push(self, event: TEvent) -> None:
        if self._ended:
            return
        self._queue.put_nowait(event)

    def finish(self, result: TResult) -> None:
        if self._ended:
            return
        self._ended = True
        if not self._result_future.done():
            self._result_future.set_result(result)
        self._queue.put_nowait(None)

    def fail(self, error: BaseException) -> None:
        if self._ended:
            return
        self._ended = True
        if not self._result_future.done():
            self._result_future.set_exception(error)
        self._queue.put_nowait(None)

    async def result(self) -> TResult:
        return await self._result_future

    def __aiter__(self) -> "EventStream[TEvent, TResult]":
        return self

    async def __anext__(self) -> TEvent:
        item = await self._queue.get()
        if item is None:
            raise StopAsyncIteration
        return item


class AssistantMessageEventStream(EventStream[AssistantMessageEvent, AssistantMessage]):
    pass


def create_assistant_message_event_stream() -> AssistantMessageEventStream:
    return AssistantMessageEventStream()
