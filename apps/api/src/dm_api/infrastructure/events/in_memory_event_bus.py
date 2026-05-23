"""In-process pub/sub implementation of the EventBus port.

Handlers are stored per-event-type. Publishing iterates the handler list in
subscription order and awaits each one sequentially. Exceptions propagate.

Phase 2c will replace or wrap this with a WebSocket-broadcasting bus.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any


class InMemoryEventBus:
    def __init__(self) -> None:
        self._handlers: defaultdict[type, list[Callable[[Any], Awaitable[None]]]] = (
            defaultdict(list)
        )

    def subscribe(
        self,
        event_type: type,
        handler: Callable[[Any], Awaitable[None]],
    ) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: object) -> None:
        for handler in self._handlers[type(event)]:
            await handler(event)
