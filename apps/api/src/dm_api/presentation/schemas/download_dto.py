"""Pydantic v2 request/response schemas for the downloads API.

The presentation layer is the only place Pydantic is imported. Domain and
application stay framework-free.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from dm_api.domain.entities.download_task import DownloadTask


class AddDownloadRequest(BaseModel):
    url: str = Field(min_length=1)
    save_path: str | None = None
    category: str | None = None

    model_config = ConfigDict(extra="forbid")


class DownloadDTO(BaseModel):
    id: UUID
    url: str
    file_name: str
    save_path: str
    total_size: int | None
    downloaded_size: int
    status: str
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

    @classmethod
    def from_entity(cls, task: DownloadTask) -> DownloadDTO:
        return cls(
            id=task.id,
            url=task.url,
            file_name=task.file_name,
            save_path=task.save_path,
            total_size=task.total_size,
            downloaded_size=task.downloaded_size,
            status=task.status.value,
            resume_supported=task.resume_supported,
            segment_count=task.segment_count,
            category=task.category,
            speed_limit=task.speed_limit,
            checksum=task.checksum,
            checksum_algorithm=task.checksum_algorithm,
            error_message=task.error_message,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
        )
