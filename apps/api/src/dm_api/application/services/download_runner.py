"""Tracks in-flight downloads and caps how many run in parallel.

Without a cap, spawning N tasks at once (e.g. queuing a 50-video playlist)
launches N yt-dlp/ffmpeg processes simultaneously — they all stall fighting
for the network and CPU, downloads show 0 B forever, and the box is unusable.

We wrap each spawned task in a coroutine that waits on a `Semaphore` before
running the actual worker; the runner accepts work immediately and queues
it transparently.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable

from dm_api.application.ports.segment_worker import SegmentWorker
from dm_api.domain.entities.download_task import DownloadTask

DEFAULT_MAX_PARALLEL = 3


class DownloadRunner:
    def __init__(
        self,
        worker_factory: Callable[[], SegmentWorker],
        media_worker_factory: Callable[[], SegmentWorker] | None = None,
        max_parallel: int = DEFAULT_MAX_PARALLEL,
    ) -> None:
        self._worker_factory = worker_factory
        self._media_worker_factory = media_worker_factory
        self._tasks: set[asyncio.Task[None]] = set()
        self._semaphore = asyncio.Semaphore(max_parallel)
        self._max_parallel = max_parallel

    def spawn(self, task: DownloadTask) -> None:
        if task.media_format_id and self._media_worker_factory is not None:
            worker = self._media_worker_factory()
        else:
            worker = self._worker_factory()

        async def _gated_run() -> None:
            async with self._semaphore:
                await worker.run(task)

        bg = asyncio.create_task(_gated_run(), name=f"download-{task.id}")
        self._tasks.add(bg)
        bg.add_done_callback(self._tasks.discard)

    async def wait_idle(self) -> None:
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)
