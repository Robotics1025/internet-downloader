"""GET /api/health — simple liveness + version + active_downloads count."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from dm_api.domain.value_objects.download_status import DownloadStatus

router = APIRouter(prefix="/api", tags=["health"])

_ACTIVE_STATUSES = {
    DownloadStatus.QUEUED,
    DownloadStatus.DOWNLOADING,
    DownloadStatus.MERGING,
}


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    tasks = await request.app.state.list_downloads.execute()
    active = sum(1 for t in tasks if t.status in _ACTIVE_STATUSES)
    return {"status": "ok", "version": "0.2.0", "active_downloads": active}
