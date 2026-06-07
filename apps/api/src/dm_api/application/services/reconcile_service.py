"""Background service that flags downloads whose file vanished from disk.

Mirrors ProgressService's lifecycle. Read-only against the filesystem: it never
deletes or moves files — it only stats completed downloads and toggles the
`file_missing` flag so the UI can surface externally-deleted files.
"""
from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.value_objects.download_status import DownloadStatus

RECONCILE_INTERVAL_SECONDS = 15.0


class ReconcileService:
    def __init__(self, repo: DownloadRepository) -> None:
        self._repo = repo
        self._running = False
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self) -> None:
        while self._running:
            try:
                await self.reconcile_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                # In production we would log this. Keep running.
                pass
            await asyncio.sleep(RECONCILE_INTERVAL_SECONDS)

    async def reconcile_once(self) -> None:
        tasks = await self._repo.list_all()
        for task in tasks:
            if task.status != DownloadStatus.COMPLETED:
                continue
            missing = not (Path(task.save_path) / task.file_name).exists()
            if missing != task.file_missing:
                task.file_missing = missing
                await self._repo.update(task)
