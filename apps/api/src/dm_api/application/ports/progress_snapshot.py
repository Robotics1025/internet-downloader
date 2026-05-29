"""Progress snapshot data structure.

Lives in the application layer so both ``ProgressService`` (application) and
the WebSocket gateway (presentation) can import it without violating the
dependency rule (application must not import from presentation or pydantic).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from dm_api.domain.value_objects.download_status import DownloadStatus


@dataclass(frozen=True, slots=True)
class ProgressSnapshotDTO:
    download_id: UUID
    downloaded_bytes: int
    total_size: int | None
    speed_bps: float
    eta_seconds: float | None
    percent: float | None
    status: DownloadStatus
    active_segments: int
    event: str = field(default="progress")
