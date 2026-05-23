"""Service that polls for progress and computes speeds."""
from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TypedDict
from uuid import UUID

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.presentation.schemas.progress_dto import ProgressSnapshotDTO


class _HistoryEntry(TypedDict):
    timestamp: float
    bytes: int


class ProgressService:
    def __init__(
        self,
        repo: DownloadRepository,
        clock: Callable[[], float] = lambda: datetime.now(UTC).timestamp(),
    ) -> None:
        self._repo = repo
        self._clock = clock
        self._running = False
        self._task: asyncio.Task[None] | None = None
        
        # Keep track of last N seconds of progress per download for speed calc
        self._history: dict[UUID, deque[_HistoryEntry]] = {}
        
        # Callbacks for new snapshots
        self._subscribers: set[Callable[[ProgressSnapshotDTO], None]] = set()

    def subscribe(self, callback: Callable[[ProgressSnapshotDTO], None]) -> None:
        self._subscribers.add(callback)

    def unsubscribe(self, callback: Callable[[ProgressSnapshotDTO], None]) -> None:
        self._subscribers.discard(callback)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            import contextlib
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                # In production we would log this. Keep polling.
                pass
            await asyncio.sleep(1.0)

    async def _tick(self) -> None:
        tasks = await self._repo.list_all()
        now = self._clock()

        active_ids = set()

        for task in tasks:
            if task.status not in (DownloadStatus.DOWNLOADING, DownloadStatus.COMPLETED):
                continue

            active_ids.add(task.id)
            if task.id not in self._history:
                self._history[task.id] = deque()

            history = self._history[task.id]
            history.append({"timestamp": now, "bytes": task.downloaded_size})

            # Evict entries older than 3 seconds
            while history and now - history[0]["timestamp"] > 3.0:
                history.popleft()

            # Compute speed
            speed_bps = 0.0
            if len(history) > 1:
                dt = history[-1]["timestamp"] - history[0]["timestamp"]
                db = history[-1]["bytes"] - history[0]["bytes"]
                if dt > 0:
                    speed_bps = db / dt

            # Compute ETA and percentage
            percent = None
            eta = None
            if task.total_size and task.total_size > 0:
                percent = (task.downloaded_size / task.total_size) * 100.0
                remaining = task.total_size - task.downloaded_size
                if speed_bps > 0:
                    eta = remaining / speed_bps

            snapshot = ProgressSnapshotDTO(
                download_id=task.id,
                downloaded_bytes=task.downloaded_size,
                total_size=task.total_size,
                speed_bps=speed_bps,
                eta_seconds=eta,
                percent=percent,
                status=task.status,
                active_segments=1, # Hardcoded for Phase 2
            )

            # Broadcast
            for sub in self._subscribers:
                sub(snapshot)

        # Cleanup history for idle tasks
        for old_id in list(self._history.keys()):
            if old_id not in active_ids:
                del self._history[old_id]
