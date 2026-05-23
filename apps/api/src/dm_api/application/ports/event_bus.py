"""Port for an async pub/sub event bus.

Use cases publish domain events; infrastructure or other use cases subscribe.
Phase 2a ships an InMemoryEventBus implementation; Phase 2c will introduce
a WebSocket bridge that subscribes to progress events.
"""
from collections.abc import Awaitable, Callable
from typing import Any, Protocol


class EventBus(Protocol):
    async def publish(self, event: object) -> None: ...

    def subscribe(
        self,
        event_type: type,
        handler: Callable[[Any], Awaitable[None]],
    ) -> None: ...
