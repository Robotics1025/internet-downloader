"""REST endpoints for download tasks.

Phase 2a added create + read endpoints. Phase 2b adds /start to kick off the
actual download. Pause/resume/cancel come in later phases.
"""
from __future__ import annotations

import asyncio
import contextlib
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import UUID

import json

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.presentation.schemas.download_dto import AddDownloadRequest, DownloadDTO

class PlaylistDownloadRequest(BaseModel):
    url: str
    save_path: str | None = None
    category: str | None = None
    max_items: int = 50

_ACTIVE_STATUSES = {DownloadStatus.QUEUED, DownloadStatus.DOWNLOADING, DownloadStatus.MERGING}


def _open_in_native_file_manager(target: Path) -> None:
    """Open the OS file manager focused on `target`. Best-effort, returns on
    success or raises RuntimeError with a human-friendly message.

    On Linux we try `xdg-open` on the *directory* (file managers don't
    reliably support selecting a single file via xdg-open). On macOS `open
    -R` reveals the file. On Windows `explorer /select,` does the same.
    """
    target = target.resolve()
    if sys.platform == "darwin":
        cmd = ["open", "-R", str(target)] if target.is_file() else ["open", str(target)]
    elif sys.platform == "win32":
        cmd = ["explorer", f"/select,{target}"] if target.is_file() else ["explorer", str(target)]
    else:
        opener = shutil.which("xdg-open")
        if opener is None:
            raise RuntimeError("xdg-open not found — install xdg-utils")
        # File managers don't reliably accept files via xdg-open, so open the
        # parent dir (matches the user's expectation: "show me where it is").
        folder = target.parent if target.is_file() else target
        cmd = [opener, str(folder)]
    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        raise RuntimeError(f"could not launch file manager: {exc}") from exc

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.post("", status_code=201, response_model=DownloadDTO)
async def create_download(request: Request, body: AddDownloadRequest) -> DownloadDTO:
    task = await request.app.state.add_download.execute(
        url=body.url,
        save_path=body.save_path,
        category=body.category,
        file_name=body.file_name,
        media_format_id=body.media_format_id,
    )
    return DownloadDTO.from_entity(task)


@router.post("/playlist", status_code=201, response_model=list[DownloadDTO])
async def create_playlist_downloads(
    request: Request, body: PlaylistDownloadRequest
) -> list[DownloadDTO]:
    """Expand a playlist URL with `yt-dlp --flat-playlist` then create one
    download task per item — each task routed to the yt-dlp worker (NOT the
    HTTP worker, which would just fetch the YouTube watch page HTML).
    """
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "--flat-playlist", "-j", "--no-warnings", body.url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=400, detail="Failed to extract playlist")

    cap = max(1, min(body.max_items, 200))
    tasks = []
    for line in stdout.decode("utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        if len(tasks) >= cap:
            break
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        video_url = (
            data.get("webpage_url")
            or data.get("original_url")
            or data.get("url")
        )
        if not video_url:
            continue
        # Reconstruct a canonical watch URL when --flat-playlist only gives
        # us the bare video id (common for YouTube radio / mix playlists).
        if not video_url.startswith("http"):
            video_url = f"https://www.youtube.com/watch?v={video_url}"
        try:
            task = await request.app.state.add_download.execute(
                url=video_url,
                save_path=body.save_path,
                category=body.category or "video",
                # Critical: these two fields are what makes the runner pick
                # YtDlpWorker instead of SingleSegmentWorker. Without them
                # the worker would try to HTTP-download the YouTube HTML.
                file_name="media.download",
                media_format_id="bv*+ba/best",
            )
            tasks.append(task)
        except Exception:
            continue
    if not tasks:
        raise HTTPException(status_code=400, detail="Playlist had no usable entries")
    return [DownloadDTO.from_entity(t) for t in tasks]


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


@router.post("/cleanup", status_code=200)
async def cleanup_stuck(request: Request) -> dict:
    """Mark every still-pending/downloading task as failed and remove the
    rows the user almost certainly wants gone: zero-byte media.download
    placeholders that never actually started. Used for the "Cancel pending"
    button when a giant playlist add overloaded the queue.
    """
    repo = request.app.state.repo
    tasks = await repo.list_all()
    deleted = 0
    marked = 0
    for t in tasks:
        if t.status not in _ACTIVE_STATUSES and t.status != DownloadStatus.PENDING:
            continue
        if t.file_name == "media.download" and t.downloaded_size == 0:
            try:
                await repo.delete(t.id)
                deleted += 1
            except Exception:
                pass
        else:
            t.status = DownloadStatus.FAILED
            t.error_message = "cancelled by user (bulk cleanup)"
            try:
                await repo.update(t)
                marked += 1
            except Exception:
                pass
    return {"deleted": deleted, "marked_failed": marked}


@router.post("/{id}/reveal", status_code=204)
async def reveal_in_folder(request: Request, id: UUID) -> Response:
    repo = request.app.state.repo
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    target = Path(task.save_path) / task.file_name
    # If the file isn't on disk yet (download didn't finish), just open the
    # folder it would have landed in.
    if not target.exists():
        target = Path(task.save_path)
        if not target.exists():
            raise HTTPException(status_code=404, detail=f"folder not on disk: {target}")
    try:
        _open_in_native_file_manager(target)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post("/{id}/open", status_code=204)
async def open_download_file(request: Request, id: UUID) -> Response:
    repo = request.app.state.repo
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    target = Path(task.save_path) / task.file_name
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"file not on disk: {target}")
    
    if sys.platform == "darwin":
        cmd = ["open", str(target)]
    elif sys.platform == "win32":
        cmd = ["start", "", str(target)]
    else:
        opener = shutil.which("xdg-open")
        if opener is None:
            raise RuntimeError("xdg-open not found — install xdg-utils")
        cmd = [opener, str(target)]
        
    try:
        if sys.platform == "win32":
            subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(status_code=204)



@router.delete("/{id}", status_code=204)
async def delete_download(request: Request, id: UUID) -> Response:
    repo = request.app.state.repo
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    if task.status in _ACTIVE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"download is {task.status.value}; cannot delete an in-flight download",
        )
    final_path = Path(task.save_path) / task.file_name
    part_path = final_path.with_suffix(final_path.suffix + ".part")
    # Best-effort cleanup of leftover partial bytes. The final file is left
    # alone — the user asked to remove the record, not their finished file.
    with contextlib.suppress(OSError):
        if part_path.exists():
            part_path.unlink()
    await repo.delete(id)
    return Response(status_code=204)
