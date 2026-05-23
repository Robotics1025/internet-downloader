"""AddDownloadUseCase tests.

Uses AsyncMock for the DownloadRepository and EventBus ports — Protocol-based
ports work with any object that has the right methods, so we don't need to
build a concrete fake.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from dm_api.application.use_cases.add_download import (
    AddDownloadUseCase,
    InvalidUrlError,
)
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.events.domain_events import DownloadCreated
from dm_api.domain.value_objects.download_status import DownloadStatus


def _make_use_case() -> tuple[AddDownloadUseCase, AsyncMock, AsyncMock]:
    repo = AsyncMock()
    event_bus = AsyncMock()
    return AddDownloadUseCase(repo=repo, event_bus=event_bus), repo, event_bus


async def test_happy_path_persists_and_publishes() -> None:
    use_case, repo, event_bus = _make_use_case()

    task = await use_case.execute(url="https://example.com/file.zip")

    assert isinstance(task, DownloadTask)
    assert task.url == "https://example.com/file.zip"
    assert task.file_name == "file.zip"
    assert task.status == DownloadStatus.PENDING
    assert task.total_size is None
    assert task.resume_supported is False
    assert task.segment_count == 1
    assert task.downloaded_size == 0
    assert task.category == "general"
    assert task.completed_at is None
    repo.save.assert_awaited_once_with(task)
    event_bus.publish.assert_awaited_once()
    published_event = event_bus.publish.await_args.args[0]
    assert isinstance(published_event, DownloadCreated)
    assert published_event.download_id == task.id


async def test_default_save_path_is_platform_downloads() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(url="https://example.com/file.zip")
    expected = str(Path.home() / "Downloads")
    assert task.save_path == expected


async def test_explicit_save_path_is_used() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/file.zip", save_path="/mnt/external/dl"
    )
    assert task.save_path == "/mnt/external/dl"


async def test_custom_category_is_used() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/movie.mp4", category="video"
    )
    assert task.category == "video"


async def test_relative_save_path_rejected() -> None:
    use_case, _, _ = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(
            url="https://example.com/file.zip", save_path="relative/dl"
        )


async def test_save_path_with_dotdot_rejected() -> None:
    use_case, _, _ = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(
            url="https://example.com/file.zip", save_path="/tmp/../etc"
        )


@pytest.mark.parametrize(
    "bad_url",
    [
        "ftp://example.com/file.zip",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://example.com/",            # no file name
        "https://example.com",             # no path
        "https://example.com/dir/",        # trailing slash, no file name
        "https://example.com/%2e%2e/etc",  # url-encoded ".."
        "not a url at all",
    ],
)
async def test_invalid_urls_rejected(bad_url: str) -> None:
    use_case, repo, event_bus = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(url=bad_url)
    repo.save.assert_not_awaited()
    event_bus.publish.assert_not_awaited()


async def test_url_with_query_string_extracts_clean_filename() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/path/file.zip?token=abc&v=2"
    )
    assert task.file_name == "file.zip"


async def test_url_with_percent_encoded_filename_is_decoded() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/My%20File%20Name.zip"
    )
    assert task.file_name == "My File Name.zip"
