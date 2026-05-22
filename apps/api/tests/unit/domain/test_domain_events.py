"""Domain events are frozen dataclasses — immutable value records."""
from dataclasses import FrozenInstanceError
from uuid import uuid4

import pytest

from dm_api.domain.events.domain_events import (
    DownloadCancelled,
    DownloadCompleted,
    DownloadCreated,
    DownloadFailed,
    DownloadPaused,
    DownloadResumed,
    DownloadStarted,
    MergeCompleted,
    MergeStarted,
    SegmentCompleted,
    SegmentFailed,
)


def test_download_created_carries_id() -> None:
    download_id = uuid4()
    event = DownloadCreated(download_id=download_id)
    assert event.download_id == download_id


def test_events_are_frozen() -> None:
    event = DownloadStarted(download_id=uuid4())
    with pytest.raises(FrozenInstanceError):
        event.download_id = uuid4()  # type: ignore[misc]


def test_download_paused_carries_saved_bytes() -> None:
    event = DownloadPaused(download_id=uuid4(), saved_bytes=4096)
    assert event.saved_bytes == 4096


def test_download_completed_carries_file_path() -> None:
    event = DownloadCompleted(download_id=uuid4(), file_path="/tmp/out.zip")
    assert event.file_path == "/tmp/out.zip"


def test_download_failed_carries_error() -> None:
    event = DownloadFailed(download_id=uuid4(), error="network timeout")
    assert event.error == "network timeout"


def test_segment_failed_carries_retry_flag() -> None:
    event = SegmentFailed(
        download_id=uuid4(),
        segment_index=2,
        error="503",
        will_retry=True,
    )
    assert event.segment_index == 2
    assert event.will_retry is True


def test_segment_completed_carries_index() -> None:
    event = SegmentCompleted(download_id=uuid4(), segment_index=3)
    assert event.segment_index == 3


def test_merge_completed_carries_checksum_flag() -> None:
    event = MergeCompleted(download_id=uuid4(), checksum_verified=True)
    assert event.checksum_verified is True


def test_simple_events_only_need_download_id() -> None:
    # These events only carry the download_id; verify they construct.
    DownloadResumed(download_id=uuid4())
    DownloadCancelled(download_id=uuid4())
    MergeStarted(download_id=uuid4())
