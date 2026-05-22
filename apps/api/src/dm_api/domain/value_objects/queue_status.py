"""Lifecycle states for a DownloadQueue."""
from enum import StrEnum


class QueueStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
