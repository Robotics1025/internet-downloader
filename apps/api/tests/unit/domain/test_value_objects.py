"""Enum string values MUST match the strings used in the SQLite schema exactly.

This catches drift between the domain layer and the database layer. If a value
ever changes in one place but not the other, a migration is required and this
test forces the conversation.
"""
import pytest

from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.domain.value_objects.queue_status import QueueStatus
from dm_api.domain.value_objects.segment_status import SegmentStatus


@pytest.mark.parametrize(
    ("member", "expected"),
    [
        (DownloadStatus.PENDING, "pending"),
        (DownloadStatus.QUEUED, "queued"),
        (DownloadStatus.DOWNLOADING, "downloading"),
        (DownloadStatus.PAUSED, "paused"),
        (DownloadStatus.MERGING, "merging"),
        (DownloadStatus.COMPLETED, "completed"),
        (DownloadStatus.FAILED, "failed"),
        (DownloadStatus.CANCELLED, "cancelled"),
    ],
)
def test_download_status_values(member: DownloadStatus, expected: str) -> None:
    assert member.value == expected
    assert str(member) == expected


def test_download_status_member_count() -> None:
    assert len(DownloadStatus) == 8


@pytest.mark.parametrize(
    ("member", "expected"),
    [
        (SegmentStatus.PENDING, "pending"),
        (SegmentStatus.DOWNLOADING, "downloading"),
        (SegmentStatus.COMPLETED, "completed"),
        (SegmentStatus.FAILED, "failed"),
        (SegmentStatus.RETRYING, "retrying"),
    ],
)
def test_segment_status_values(member: SegmentStatus, expected: str) -> None:
    assert member.value == expected


def test_segment_status_member_count() -> None:
    assert len(SegmentStatus) == 5


@pytest.mark.parametrize(
    ("member", "expected"),
    [
        (QueueStatus.ACTIVE, "active"),
        (QueueStatus.PAUSED, "paused"),
        (QueueStatus.STOPPED, "stopped"),
    ],
)
def test_queue_status_values(member: QueueStatus, expected: str) -> None:
    assert member.value == expected


def test_queue_status_member_count() -> None:
    assert len(QueueStatus) == 3
