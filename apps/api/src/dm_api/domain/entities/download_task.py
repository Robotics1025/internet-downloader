"""DownloadTask — the central entity representing one user-requested download.

Mutable by design: status transitions and progress updates happen in place.
"""
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from dm_api.domain.value_objects.download_status import DownloadStatus


@dataclass(slots=True)
class DownloadTask:
    id: UUID
    url: str
    file_name: str
    save_path: str
    total_size: int | None
    downloaded_size: int
    status: DownloadStatus
    resume_supported: bool
    segment_count: int
    category: str
    speed_limit: int | None
    checksum: str | None
    checksum_algorithm: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    media_format_id: str | None = None
