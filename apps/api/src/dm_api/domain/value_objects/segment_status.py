"""Lifecycle states for a single download segment."""
from enum import StrEnum


class SegmentStatus(StrEnum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
