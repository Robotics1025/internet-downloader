"""Entity construction and behavior tests.

Entities are mutable dataclasses with `slots=True`. We test:
- They can be constructed with sensible defaults
- Equality is value-based
- Mutable state can be updated in place
"""
from uuid import UUID, uuid4

from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.domain.value_objects.queue_status import QueueStatus
from dm_api.domain.value_objects.segment_status import SegmentStatus
from tests.conftest import make_queue, make_segment, make_task


def test_download_task_constructs_with_all_fields() -> None:
    task = make_task()
    assert isinstance(task.id, UUID)
    assert task.url == "https://example.com/file.zip"
    assert task.status == DownloadStatus.PENDING
    assert task.downloaded_size == 0
    assert task.resume_supported is True
    assert task.completed_at is None


def test_download_task_equality_is_value_based() -> None:
    task_id = uuid4()
    t1 = make_task(id=task_id)
    t2 = make_task(id=task_id, created_at=t1.created_at)
    assert t1 == t2


def test_download_task_status_can_transition() -> None:
    task = make_task()
    task.status = DownloadStatus.DOWNLOADING
    assert task.status == DownloadStatus.DOWNLOADING


def test_download_task_downloaded_size_can_increment() -> None:
    task = make_task()
    task.downloaded_size += 512
    assert task.downloaded_size == 512


def test_download_segment_constructs() -> None:
    seg = make_segment()
    assert seg.segment_index == 0
    assert seg.start_byte == 0
    assert seg.end_byte == 1023
    assert seg.status == SegmentStatus.PENDING
    assert seg.retry_count == 0


def test_download_segment_retry_count_increments() -> None:
    seg = make_segment()
    seg.retry_count += 1
    seg.status = SegmentStatus.RETRYING
    assert seg.retry_count == 1
    assert seg.status == SegmentStatus.RETRYING


def test_download_queue_constructs() -> None:
    q = make_queue()
    assert q.name == "default"
    assert q.max_parallel_downloads == 3
    assert q.status == QueueStatus.ACTIVE
    assert q.speed_limit is None


def test_download_queue_can_be_paused() -> None:
    q = make_queue()
    q.status = QueueStatus.PAUSED
    assert q.status == QueueStatus.PAUSED
