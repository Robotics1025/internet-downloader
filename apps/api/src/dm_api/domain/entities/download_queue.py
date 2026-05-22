"""DownloadQueue — a named queue that controls parallelism and speed limits."""
from dataclasses import dataclass
from uuid import UUID

from dm_api.domain.value_objects.queue_status import QueueStatus


@dataclass(slots=True)
class DownloadQueue:
    id: UUID
    name: str
    max_parallel_downloads: int
    status: QueueStatus
    speed_limit: int | None
