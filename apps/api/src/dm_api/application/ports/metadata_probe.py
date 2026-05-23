"""Port for fetching file metadata from an HTTP URL (HEAD or GET probe).

The Phase 2b implementation lives in infrastructure/http/httpx_metadata_probe.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class FileMetadata:
    total_size: int | None
    accepts_ranges: bool
    suggested_filename: str | None


class MetadataProbe(Protocol):
    async def probe(self, url: str) -> FileMetadata: ...
