"""Progress Data Transfer Object."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from dm_api.domain.value_objects.download_status import DownloadStatus


class ProgressSnapshotDTO(BaseModel):
    model_config = ConfigDict(frozen=True)

    event: Literal["progress"] = "progress"
    download_id: UUID
    downloaded_bytes: int
    total_size: int | None
    speed_bps: float
    eta_seconds: float | None
    percent: float | None
    status: DownloadStatus
    active_segments: int
