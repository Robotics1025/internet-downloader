"""Serves the bytes of completed downloads so the desktop UI can play them
in-app (like a built-in VLC).

Implements HTTP Range responses — the `<video>` element issues a Range
request when the user seeks, and won't even start playback for large files
without range support.
"""
from __future__ import annotations

import mimetypes
import re
from pathlib import Path
from uuid import UUID

import aiofiles
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

router = APIRouter(prefix="/api/downloads", tags=["stream"])

# 256 KB read chunks — keeps memory bounded for huge files.
_CHUNK_SIZE = 256 * 1024


@router.get("/{id}/stream")
async def stream_download(request: Request, id: UUID) -> Response:
    repo = request.app.state.repo
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    file_path = Path(task.save_path) / task.file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"file not on disk: {file_path}")

    media_type, _ = mimetypes.guess_type(file_path.name)
    if media_type is None:
        media_type = "application/octet-stream"

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range") or request.headers.get("Range")

    # No Range request → send the whole file. FileResponse handles ETag, etc.
    if not range_header:
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_path.name,
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
        )

    start, end = _parse_range(range_header, file_size)
    if start is None:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    length = end - start + 1

    async def iter_range():
        async with aiofiles.open(file_path, "rb") as f:
            await f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = await f.read(min(_CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        iter_range(),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
            "Accept-Ranges": "bytes",
        },
    )


_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def _parse_range(header: str, file_size: int) -> tuple[int | None, int]:
    """Return (start, end) inclusive byte offsets, or (None, 0) on invalid."""
    m = _RANGE_RE.fullmatch(header.strip())
    if not m:
        return None, 0
    start_s, end_s = m.group(1), m.group(2)
    if start_s == "" and end_s == "":
        return None, 0
    if start_s == "":
        # Suffix range: last N bytes.
        suffix = int(end_s)
        if suffix == 0:
            return None, 0
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        start = int(start_s)
        end = int(end_s) if end_s else file_size - 1
    if start >= file_size or end >= file_size or start > end:
        return None, 0
    return start, end
