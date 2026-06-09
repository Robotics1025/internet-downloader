"""DownloadRunner — wraps asyncio.create_task with lifecycle management."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from dm_api.application.services.download_runner import DownloadRunner
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


def _make_task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://example.com/file.zip",
        file_name="file.zip",
        save_path="/tmp",
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.DOWNLOADING,
        resume_supported=False,
        segment_count=1,
        category="general",
        speed_limit=None,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime.now(UTC),
        started_at=None,
        completed_at=None,
    )


async def test_spawn_creates_running_task() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)
    task = _make_task()

    runner.spawn(task)
    await runner.wait_idle()

    worker.run.assert_awaited_once_with(task)


async def test_spawn_multiple_tasks_all_run() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)

    runner.spawn(_make_task())
    runner.spawn(_make_task())
    runner.spawn(_make_task())
    await runner.wait_idle()

    assert worker.run.await_count == 3


async def test_wait_idle_with_no_tasks_returns_quickly() -> None:
    runner = DownloadRunner(worker_factory=lambda: AsyncMock())
    # Should not hang
    await asyncio.wait_for(runner.wait_idle(), timeout=1.0)


async def test_completed_tasks_are_removed() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)

    runner.spawn(_make_task())
    await runner.wait_idle()

    # Internal _tasks should be empty after completion
    assert len(runner._tasks) == 0


async def test_worker_exception_does_not_kill_runner() -> None:
    class BadWorker:
        async def run(self, task: DownloadTask) -> None:
            raise RuntimeError("boom")

    runner = DownloadRunner(worker_factory=lambda: BadWorker())  # type: ignore[arg-type]
    runner.spawn(_make_task())
    # wait_idle should not raise even though the task failed
    await runner.wait_idle()


async def test_stop_cancels_a_running_download() -> None:
    started = asyncio.Event()

    class SlowWorker:
        async def run(self, task: DownloadTask) -> None:
            started.set()
            await asyncio.sleep(60)  # block until cancelled

    runner = DownloadRunner(worker_factory=lambda: SlowWorker())  # type: ignore[arg-type]
    task = _make_task()
    runner.spawn(task)
    await asyncio.wait_for(started.wait(), timeout=1.0)
    bg = runner._tasks[task.id]

    stopped = await runner.stop(task.id)

    assert stopped is True
    assert task.id not in runner._tasks
    assert bg.cancelled()


async def test_stop_unknown_id_returns_false() -> None:
    runner = DownloadRunner(worker_factory=lambda: AsyncMock())
    assert await runner.stop(uuid4()) is False
