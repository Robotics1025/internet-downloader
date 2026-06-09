"""Streaming single-segment download worker.

Downloads `task.url` in one streamed GET, writes chunks to `{file_name}.part`,
atomically renames to the final name on success, and updates the repository
periodically so polled progress is fresh.
"""
from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import aiofiles
import httpx

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

CHUNK_SIZE_BYTES = 512 * 1024            # 512 KB — balances syscall overhead
PERSIST_EVERY_BYTES = 1024 * 1024        # 1 MB
PERSIST_EVERY_SECONDS = 1.0
ERROR_MESSAGE_MAX_LEN = 500


class SingleSegmentWorker:
    def __init__(
        self,
        client: httpx.AsyncClient,
        repo: DownloadRepository,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._repo = repo
        self._clock = clock

    async def run(self, task: DownloadTask) -> None:
        final_path = Path(task.save_path) / task.file_name
        part_path = final_path.with_suffix(final_path.suffix + ".part")
        try:
            final_path.parent.mkdir(parents=True, exist_ok=True)
            await self._download_to(part_path, task)
            part_path.rename(final_path)
            task.status = DownloadStatus.COMPLETED
            task.completed_at = self._clock()
            await self._repo.update(task)
        except Exception as exc:
            task.status = DownloadStatus.FAILED
            task.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
            import contextlib
            with contextlib.suppress(Exception):
                # If even the failure-mark write fails, swallow it — we already lost.
                await self._repo.update(task)

    async def _download_to(self, part_path: Path, task: DownloadTask) -> None:
        async with self._client.stream("GET", task.url) as response:
            response.raise_for_status()
            async with aiofiles.open(part_path, "wb") as f:
                # Opening in "wb" truncates the .part file to 0 bytes and we
                # restream from the start with no Range header (true byte-range
                # resume is out of scope for now). On a resumed/retried download,
                # task.downloaded_size may still hold a stale value from a prior
                # attempt — reset it to 0 so progress accounting matches the
                # truncated file and stays honest rather than overcounting.
                task.downloaded_size = 0
                last_persist_bytes = task.downloaded_size
                last_persist_ts = time.monotonic()
                async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE_BYTES):
                    await f.write(chunk)
                    task.downloaded_size += len(chunk)
                    now = time.monotonic()
                    if (
                        task.downloaded_size - last_persist_bytes >= PERSIST_EVERY_BYTES
                        or now - last_persist_ts >= PERSIST_EVERY_SECONDS
                    ):
                        await self._repo.update(task)
                        last_persist_bytes = task.downloaded_size
                        last_persist_ts = now
