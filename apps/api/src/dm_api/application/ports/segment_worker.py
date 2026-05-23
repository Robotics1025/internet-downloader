"""Port for a download segment worker.

Phase 2b's implementation is SingleSegmentWorker — downloads the whole file
in one stream. Phase 3 will add multi-segment workers that satisfy the same
protocol.
"""
from __future__ import annotations

from typing import Protocol

from dm_api.domain.entities.download_task import DownloadTask


class SegmentWorker(Protocol):
    async def run(self, task: DownloadTask) -> None: ...
