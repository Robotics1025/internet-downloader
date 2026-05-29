"""yt-dlp-based media probe.

Shells out to the `yt-dlp` binary with `-j` to print a single JSON document
describing the resource (title, duration, thumbnail, formats list).

Returns `None` when yt-dlp does not recognise the URL — callers can fall back
to a direct HTTP download in that case.

The probe deliberately runs yt-dlp with no `--extractor-args` and no
`--cookies-from-browser`: forcing a list of player_clients makes yt-dlp try
every one in sequence (~12 min on YouTube's 2026 bot-wall), and Chrome
cookies have been broken against YouTube since the May 2026 nightly
("Requested format is not available"). Recent yt-dlp's defaults already
return the full HD format list (144p–720p+) anonymously in ~60 s.
"""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass

from dm_api.infrastructure.media.binaries import yt_dlp_bin
# Slightly longer than the empirical ~60–70 s YouTube probe so a tail-latency
# request doesn't get killed mid-extraction.
PROBE_TIMEOUT_SECONDS = 90.0
CACHE_TTL_SECONDS = 600.0

@dataclass(frozen=True, slots=True)
class MediaFormat:
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


@dataclass(frozen=True, slots=True)
class MediaInfo:
    title: str
    duration: float | None
    thumbnail: str | None
    extractor: str
    formats: list[MediaFormat]


def _distinct_video_heights(info: MediaInfo) -> int:
    return len({f.height for f in info.formats if f.height and f.vcodec and f.vcodec != "none"})


class YtDlpProbe:
    def __init__(self) -> None:
        # url → (expires_at_monotonic, MediaInfo)
        self._cache: dict[str, tuple[float, MediaInfo]] = {}
        self._inflight: dict[str, asyncio.Future[MediaInfo | None]] = {}

    async def probe(self, url: str) -> MediaInfo | None:
        cached = self._cache.get(url)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        # De-dupe concurrent probes for the same URL
        inflight = self._inflight.get(url)
        if inflight is not None:
            return await inflight

        fut: asyncio.Future[MediaInfo | None] = asyncio.get_running_loop().create_future()
        self._inflight[url] = fut
        try:
            result = await self._probe_all(url)
            if result is not None:
                self._cache[url] = (time.monotonic() + CACHE_TTL_SECONDS, result)
            fut.set_result(result)
            return result
        except Exception as exc:
            fut.set_exception(exc)
            raise
        finally:
            self._inflight.pop(url, None)

    async def _probe_all(self, url: str) -> MediaInfo | None:
        return await self._probe_once(url)

    async def _probe_once(self, url: str) -> MediaInfo | None:
        args = [
            yt_dlp_bin(),
            "-j",
            "--no-warnings",
            "--no-playlist",
            url,
        ]

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _stderr = await asyncio.wait_for(
                proc.communicate(), timeout=PROBE_TIMEOUT_SECONDS
            )
        except TimeoutError:
            proc.kill()
            await proc.wait()
            return None
        if proc.returncode != 0:
            return None
        try:
            data = json.loads(stdout.decode("utf-8", errors="replace").splitlines()[0])
        except (json.JSONDecodeError, IndexError):
            return None
        return _parse(data)


def _parse(data: dict) -> MediaInfo:
    formats: list[MediaFormat] = []
    for f in data.get("formats", []) or []:
        fid = f.get("format_id")
        if not fid:
            continue
        formats.append(
            MediaFormat(
                format_id=str(fid),
                ext=str(f.get("ext") or ""),
                resolution=f.get("resolution") or None,
                height=_safe_int(f.get("height")),
                fps=_safe_float(f.get("fps")),
                vcodec=f.get("vcodec") or None,
                acodec=f.get("acodec") or None,
                filesize=_safe_int(f.get("filesize") or f.get("filesize_approx")),
                tbr=_safe_float(f.get("tbr")),
                format_note=f.get("format_note") or None,
            )
        )
    return MediaInfo(
        title=str(data.get("title") or "media"),
        duration=_safe_float(data.get("duration")),
        thumbnail=data.get("thumbnail") or None,
        extractor=str(data.get("extractor") or ""),
        formats=formats,
    )


def _safe_int(v: int | float | str | None) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _safe_float(v: int | float | str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
