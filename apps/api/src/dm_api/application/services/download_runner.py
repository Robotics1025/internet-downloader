"""Tracks fire-and-forget asyncio tasks for in-flight downloads.

Keeps references to background tasks so the GC doesn't kill them; provides
`wait_idle()` so tests (and shutdown logic) can deterministically wait for
all running downloads to settle.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable

from dm_api.application.ports.segment_worker import SegmentWorker
from dm_api.domain.entities.download_task import DownloadTask


class DownloadRunner:
    def __init__(self, worker_factory: Callable[[], SegmentWorker]) -> None:
        self._worker_factory = worker_factory
        self._tasks: set[asyncio.Task[None]] = set()

    def spawn(self, task: DownloadTask) -> None:
        worker = self._worker_factory()
        bg = asyncio.create_task(worker.run(task), name=f"download-{task.id}")
        self._tasks.add(bg)
        bg.add_done_callback(self._tasks.discard)

    async def wait_idle(self) -> None:
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)
