"""Entity construction and behavior tests.

Entities are mutable dataclasses with `slots=True`. We test:
- They can be constructed with sensible defaults
- Equality is value-based
- Mutable state can be updated in place
"""
from datetime import UTC, datetime
from uuid import UUID, uuid4

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


def make_task(**overrides: object) -> DownloadTask:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "url": "https://example.com/file.zip",
        "file_name": "file.zip",
        "save_path": "/tmp/downloads",
        "total_size": 1024,
        "downloaded_size": 0,
        "status": DownloadStatus.PENDING,
        "resume_supported": True,
        "segment_count": 1,
        "category": "general",
        "speed_limit": None,
        "checksum": None,
        "checksum_algorithm": None,
        "error_message": None,
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
    }
    defaults.update(overrides)
    return DownloadTask(**defaults)  # type: ignore[arg-type]


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
