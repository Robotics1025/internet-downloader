"""Lifecycle states for a DownloadTask.

String values are the canonical wire format and MUST match the SQLite schema.
"""
from enum import StrEnum


class DownloadStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    MERGING = "merging"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
