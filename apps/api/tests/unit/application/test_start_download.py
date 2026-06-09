"""StartDownloadUseCase tests with mocked ports."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from dm_api.application.ports.metadata_probe import FileMetadata
from dm_api.application.use_cases.start_download import (
    DestinationExistsError,
    DownloadNotFoundError,
    InvalidStateError,
    MetadataProbeError,
    StartDownloadUseCase,
)
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

_FIXED_NOW = datetime(2026, 5, 23, 12, 30, tzinfo=UTC)


def _make_pending_task(save_path: Path) -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://files.example.com/test.bin",
        file_name="test.bin",
        save_path=str(save_path),
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.PENDING,
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


def _make_use_case(
    repo: AsyncMock,
    metadata_probe: AsyncMock,
    runner: MagicMock,
) -> StartDownloadUseCase:
    return StartDownloadUseCase(
        repo=repo,
        metadata_probe=metadata_probe,
        runner=runner,
        clock=lambda: _FIXED_NOW,
    )


async def test_happy_path(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    metadata_probe = AsyncMock()
    metadata_probe.probe.return_value = FileMetadata(
        total_size=4096,
        accepts_ranges=True,
        suggested_filename=None,
    )
    runner = MagicMock()
    use_case = _make_use_case(repo, metadata_probe, runner)

    result = await use_case.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    assert result.total_size == 4096
    assert result.resume_supported is False  # forced in 2b
    assert result.segment_count == 1         # forced in 2b
    assert result.started_at == _FIXED_NOW
    repo.update.assert_awaited_once()
    runner.spawn.assert_called_once_with(result)
    metadata_probe.probe.assert_awaited_once_with(task.url)


async def test_not_found_raises(tmp_path: Path) -> None:
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(DownloadNotFoundError):
        await use_case.execute(uuid4())


async def test_wrong_status_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    task.status = DownloadStatus.DOWNLOADING
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(InvalidStateError):
        await use_case.execute(task.id)


async def test_destination_exists_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    (tmp_path / "test.bin").write_bytes(b"already here")
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(DestinationExistsError):
        await use_case.execute(task.id)


async def test_probe_failure_marks_task_failed_and_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    metadata_probe = AsyncMock()
    metadata_probe.probe.side_effect = RuntimeError("dns nx")
    runner = MagicMock()
    use_case = _make_use_case(repo, metadata_probe, runner)

    with pytest.raises(MetadataProbeError):
        await use_case.execute(task.id)

    repo.update.assert_awaited_once()
    persisted = repo.update.await_args.args[0]
    assert persisted.status == DownloadStatus.FAILED
    assert persisted.error_message is not None
    assert "dns nx" in persisted.error_message
    runner.spawn.assert_not_called()


# ---------------------------------------------------------------------------
# Resume / retry tests (Task 4)
# ---------------------------------------------------------------------------


def _make_task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://example.com/file.zip",
        file_name="file.zip",
        save_path="/tmp",
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.PENDING,
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


async def test_resume_from_paused_respawns() -> None:
    task = _make_task()
    task.status = DownloadStatus.PAUSED
    task.media_format_id = "bv*+ba/best"
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    runner = MagicMock()
    uc = _make_use_case(repo, AsyncMock(), runner)

    result = await uc.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    runner.spawn.assert_called_once_with(task)


async def test_retry_from_failed_clears_error() -> None:
    task = _make_task()
    task.status = DownloadStatus.FAILED
    task.error_message = "boom"
    task.media_format_id = "bv*+ba/best"
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    runner = MagicMock()
    uc = _make_use_case(repo, AsyncMock(), runner)

    result = await uc.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    assert result.error_message is None
    runner.spawn.assert_called_once()


async def test_completed_cannot_be_restarted() -> None:
    task = _make_task()
    task.status = DownloadStatus.COMPLETED
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    uc = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(InvalidStateError):
        await uc.execute(task.id)
