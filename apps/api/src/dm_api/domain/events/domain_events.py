"""Domain events emitted by use cases and infrastructure.

All events are frozen dataclasses. Phase 1 only defines the shapes — a real
event bus implementation arrives in a later phase.
"""
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class DownloadCreated:
    download_id: UUID


@dataclass(frozen=True)
class DownloadStarted:
    download_id: UUID


@dataclass(frozen=True)
class DownloadPaused:
    download_id: UUID
    saved_bytes: int


@dataclass(frozen=True)
class DownloadResumed:
    download_id: UUID


@dataclass(frozen=True)
class DownloadCompleted:
    download_id: UUID
    file_path: str


@dataclass(frozen=True)
class DownloadFailed:
    download_id: UUID
    error: str


@dataclass(frozen=True)
class DownloadCancelled:
    download_id: UUID


@dataclass(frozen=True)
class SegmentFailed:
    download_id: UUID
    segment_index: int
    error: str
    will_retry: bool


@dataclass(frozen=True)
class SegmentCompleted:
    download_id: UUID
    segment_index: int


@dataclass(frozen=True)
class MergeStarted:
    download_id: UUID


@dataclass(frozen=True)
class MergeCompleted:
    download_id: UUID
    checksum_verified: bool
