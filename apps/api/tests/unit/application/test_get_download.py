"""GetDownloadUseCase and ListDownloadsUseCase tests."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from dm_api.application.use_cases.get_download import (
    GetDownloadUseCase,
    ListDownloadsUseCase,
)
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


async def test_get_download_hit() -> None:
    task = _make_task()
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = GetDownloadUseCase(repo=repo)

    result = await use_case.execute(task.id)

    assert result is task
    repo.get_by_id.assert_awaited_once_with(task.id)


async def test_get_download_miss() -> None:
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = GetDownloadUseCase(repo=repo)

    missing_id = uuid4()
    result = await use_case.execute(missing_id)

    assert result is None
    repo.get_by_id.assert_awaited_once_with(missing_id)


async def test_list_downloads_returns_repo_output() -> None:
    tasks = [_make_task(), _make_task(), _make_task()]
    repo = AsyncMock()
    repo.list_all.return_value = tasks
    use_case = ListDownloadsUseCase(repo=repo)

    result = await use_case.execute()

    assert result == tasks
    repo.list_all.assert_awaited_once_with()


async def test_list_downloads_empty() -> None:
    repo = AsyncMock()
    repo.list_all.return_value = []
    use_case = ListDownloadsUseCase(repo=repo)

    result = await use_case.execute()

    assert result == []
