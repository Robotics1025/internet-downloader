"""Shared test fixtures and factory helpers."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from dm_api.domain.entities.download_queue import DownloadQueue
from dm_api.domain.entities.download_segment import DownloadSegment
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.domain.value_objects.queue_status import QueueStatus
from dm_api.domain.value_objects.segment_status import SegmentStatus


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


def make_segment(**overrides: object) -> DownloadSegment:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "download_id": uuid4(),
        "segment_index": 0,
        "start_byte": 0,
        "end_byte": 1023,
        "downloaded_bytes": 0,
        "temp_file_path": "/tmp/seg_0.part",
        "status": SegmentStatus.PENDING,
        "retry_count": 0,
        "last_error": None,
    }
    defaults.update(overrides)
    return DownloadSegment(**defaults)  # type: ignore[arg-type]


def make_queue(**overrides: object) -> DownloadQueue:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "name": "default",
        "max_parallel_downloads": 3,
        "status": QueueStatus.ACTIVE,
        "speed_limit": None,
    }
    defaults.update(overrides)
    return DownloadQueue(**defaults)  # type: ignore[arg-type]
