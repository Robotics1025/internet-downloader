"""Media probe endpoint — inspects a URL with yt-dlp and returns the
available formats so the UI can show a quality picker before the download
is actually created.
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/media", tags=["media"])


class ProbeRequest(BaseModel):
    url: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid")


class MediaFormatDTO(BaseModel):
    format_id: str
    ext: str
    resolution: str | None
    height: int | None
    fps: float | None
    vcodec: str | None
    acodec: str | None
    filesize: int | None
    tbr: float | None
    format_note: str | None
    has_video: bool
    has_audio: bool


class ProbeResponse(BaseModel):
    is_media: bool
    title: str | None = None
    duration: float | None = None
    thumbnail: str | None = None
    extractor: str | None = None
    formats: list[MediaFormatDTO] = []


@router.post("/probe", response_model=ProbeResponse)
async def probe(request: Request, body: ProbeRequest) -> ProbeResponse:
    info = await request.app.state.media_probe.probe(body.url)
    if info is None:
        return ProbeResponse(is_media=False)
    return ProbeResponse(
        is_media=True,
        title=info.title,
        duration=info.duration,
        thumbnail=info.thumbnail,
        extractor=info.extractor,
        formats=[
            MediaFormatDTO(
                format_id=f.format_id,
                ext=f.ext,
                resolution=f.resolution,
                height=f.height,
                fps=f.fps,
                vcodec=f.vcodec,
                acodec=f.acodec,
                filesize=f.filesize,
                tbr=f.tbr,
                format_note=f.format_note,
                has_video=bool(f.vcodec and f.vcodec != "none"),
                has_audio=bool(f.acodec and f.acodec != "none"),
            )
            for f in info.formats
        ],
    )
