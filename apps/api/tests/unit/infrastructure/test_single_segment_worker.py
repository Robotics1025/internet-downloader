"""SingleSegmentWorker behavior using respx + tmp_path."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
import respx

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.http.single_segment_worker import SingleSegmentWorker


def _make_task(save_path: Path, file_name: str = "test.bin") -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://files.example.com/test.bin",
        file_name=file_name,
        save_path=str(save_path),
        total_size=2048,
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
        started_at=datetime.now(UTC),
        completed_at=None,
    )


async def test_successful_download_writes_file_and_marks_completed(tmp_path: Path) -> None:
    payload = b"hello world" * 200  # 2200 bytes
    repo = AsyncMock()
    task = _make_task(tmp_path)

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(200, content=payload))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    final = tmp_path / "test.bin"
    part = tmp_path / "test.bin.part"
    assert final.exists()
    assert not part.exists()
    assert final.read_bytes() == payload
    assert task.status == DownloadStatus.COMPLETED
    assert task.downloaded_size == len(payload)
    assert task.completed_at is not None
    # The final update() call sets COMPLETED.
    assert repo.update.await_count >= 1
    last_call_task = repo.update.await_args_list[-1].args[0]
    assert last_call_task.status == DownloadStatus.COMPLETED


async def test_http_404_marks_failed(tmp_path: Path) -> None:
    repo = AsyncMock()
    task = _make_task(tmp_path)

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(404))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert task.status == DownloadStatus.FAILED
    assert task.error_message is not None
    assert "404" in task.error_message
    # .part should not have been finalized
    final = tmp_path / "test.bin"
    assert not final.exists()


async def test_creates_parent_directories(tmp_path: Path) -> None:
    nested = tmp_path / "deep" / "nested" / "dir"
    repo = AsyncMock()
    task = _make_task(nested, file_name="t.bin")

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(200, content=b"x" * 10))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert (nested / "t.bin").exists()


async def test_error_message_truncated_to_500_chars(tmp_path: Path) -> None:
    repo = AsyncMock()
    task = _make_task(tmp_path)

    # Simulate a connection error via respx's side_effect
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(
            side_effect=httpx.ConnectError("x" * 1000)
        )
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert task.status == DownloadStatus.FAILED
    assert task.error_message is not None
    assert len(task.error_message) <= 500


async def test_cancel_does_not_mark_failed(tmp_path: Path) -> None:
    async def _slow_stream(request: httpx.Request) -> httpx.Response:
        async def _body() -> httpx.AsyncByteStream:  # type: ignore[misc]
            yield b"x" * 1024
            await asyncio.sleep(60)  # stall mid-stream

        return httpx.Response(200, content=_body())

    transport = httpx.MockTransport(_slow_stream)
    repo = AsyncMock()
    task = DownloadTask(
        id=uuid4(),
        url="https://example.com/f.bin",
        file_name="f.bin",
        save_path=str(tmp_path),
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
    async with httpx.AsyncClient(transport=transport) as client:
        worker = SingleSegmentWorker(client, repo)
        run_task = asyncio.create_task(worker.run(task))
        await asyncio.sleep(0.05)
        run_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await run_task

    assert task.status != DownloadStatus.FAILED
