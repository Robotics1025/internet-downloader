"""DownloadSegment — one byte range within a DownloadTask.

`segment_index` matches the column name in the segments table.
"""
from dataclasses import dataclass
from uuid import UUID

from dm_api.domain.value_objects.segment_status import SegmentStatus


@dataclass(slots=True)
class DownloadSegment:
    id: UUID
    download_id: UUID
    segment_index: int
    start_byte: int
    end_byte: int
    downloaded_bytes: int
    temp_file_path: str
    status: SegmentStatus
    retry_count: int
    last_error: str | None
