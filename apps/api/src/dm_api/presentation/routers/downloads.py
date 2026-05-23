"""REST endpoints for download tasks.

Phase 2a added create + read endpoints. Phase 2b adds /start to kick off the
actual download. Pause/resume/cancel come in later phases.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from dm_api.presentation.schemas.download_dto import AddDownloadRequest, DownloadDTO

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.post("", status_code=201, response_model=DownloadDTO)
async def create_download(request: Request, body: AddDownloadRequest) -> DownloadDTO:
    task = await request.app.state.add_download.execute(
        url=body.url,
        save_path=body.save_path,
        category=body.category,
    )
    return DownloadDTO.from_entity(task)


@router.get("/{id}", response_model=DownloadDTO)
async def get_download(request: Request, id: UUID) -> DownloadDTO:
    task = await request.app.state.get_download.execute(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    return DownloadDTO.from_entity(task)


@router.get("", response_model=list[DownloadDTO])
async def list_downloads(request: Request) -> list[DownloadDTO]:
    tasks = await request.app.state.list_downloads.execute()
    return [DownloadDTO.from_entity(t) for t in tasks]


@router.post("/{id}/start", status_code=202, response_model=DownloadDTO)
async def start_download(request: Request, id: UUID) -> DownloadDTO:
    task = await request.app.state.start_download.execute(id)
    return DownloadDTO.from_entity(task)
