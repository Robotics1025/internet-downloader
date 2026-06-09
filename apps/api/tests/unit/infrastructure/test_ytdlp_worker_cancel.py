"""YtDlpWorker must terminate its subprocess when its run() is cancelled."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.media import ytdlp_worker as mod
from dm_api.infrastructure.media.ytdlp_worker import YtDlpWorker


def _task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(), url="https://youtube.com/watch?v=x", file_name="media.download",
        save_path="/tmp", total_size=None, downloaded_size=0,
        status=DownloadStatus.DOWNLOADING, resume_supported=False, segment_count=1,
        category="video", speed_limit=None, checksum=None, checksum_algorithm=None,
        error_message=None, created_at=datetime.now(UTC), started_at=None,
        completed_at=None, media_format_id="bv*+ba/best",
    )


class _FakeProc:
    def __init__(self) -> None:
        self.returncode: int | None = None
        self.terminated = False
        self.stdout = self
        self._blocked = asyncio.Event()

    async def readline(self) -> bytes:
        await self._blocked.wait()  # never returns until terminated
        return b""

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15
        self._blocked.set()

    async def wait(self) -> int:
        await self._blocked.wait()
        return self.returncode or 0


async def test_cancel_terminates_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeProc()

    async def _fake_exec(*_a: Any, **_k: Any) -> _FakeProc:
        return fake

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec)
    monkeypatch.setattr(mod, "yt_dlp_bin", lambda: "yt-dlp")
    monkeypatch.setattr(mod, "ffmpeg_bin", lambda: None)

    repo = AsyncMock()
    worker = YtDlpWorker(repo)
    run_task = asyncio.create_task(worker.run(_task()))
    await asyncio.sleep(0.05)  # let it reach the read loop

    run_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await run_task

    assert fake.terminated is True
