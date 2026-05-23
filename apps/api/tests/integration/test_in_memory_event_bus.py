"""InMemoryEventBus pub/sub behavior."""
from __future__ import annotations

import pytest

from dm_api.infrastructure.events.in_memory_event_bus import InMemoryEventBus


class _EventA:
    pass


class _EventB:
    pass


@pytest.mark.integration
async def test_single_subscriber_receives_event() -> None:
    bus = InMemoryEventBus()
    received: list[object] = []

    async def handler(event: _EventA) -> None:
        received.append(event)

    bus.subscribe(_EventA, handler)
    event = _EventA()
    await bus.publish(event)

    assert received == [event]


@pytest.mark.integration
async def test_multiple_subscribers_fire_in_subscription_order() -> None:
    bus = InMemoryEventBus()
    order: list[str] = []

    async def first(event: _EventA) -> None:
        order.append("first")

    async def second(event: _EventA) -> None:
        order.append("second")

    bus.subscribe(_EventA, first)
    bus.subscribe(_EventA, second)
    await bus.publish(_EventA())

    assert order == ["first", "second"]


@pytest.mark.integration
async def test_no_subscribers_is_a_noop() -> None:
    bus = InMemoryEventBus()
    # Should not raise.
    await bus.publish(_EventA())


@pytest.mark.integration
async def test_subscribers_only_receive_their_event_type() -> None:
    bus = InMemoryEventBus()
    a_received: list[object] = []
    b_received: list[object] = []

    async def a_handler(event: _EventA) -> None:
        a_received.append(event)

    async def b_handler(event: _EventB) -> None:
        b_received.append(event)

    bus.subscribe(_EventA, a_handler)
    bus.subscribe(_EventB, b_handler)

    await bus.publish(_EventA())
    await bus.publish(_EventB())
    await bus.publish(_EventA())

    assert len(a_received) == 2
    assert len(b_received) == 1


@pytest.mark.integration
async def test_handler_exception_propagates() -> None:
    bus = InMemoryEventBus()

    async def broken(event: _EventA) -> None:
        raise RuntimeError("boom")

    bus.subscribe(_EventA, broken)
    with pytest.raises(RuntimeError, match="boom"):
        await bus.publish(_EventA())
