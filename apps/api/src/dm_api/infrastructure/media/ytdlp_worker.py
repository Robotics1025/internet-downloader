"""yt-dlp-based download worker.

Shells out to `yt-dlp` to fetch the chosen format (plus best audio when the
selected stream is video-only) and lets yt-dlp merge with ffmpeg into a single
mp4/mkv. Parses `--progress-template` lines to push live progress into the
repository so the WebSocket progress stream picks it up.
"""
from __future__ import annotations

import asyncio
import contextlib
import re
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.media.binaries import ffmpeg_bin, yt_dlp_bin
ERROR_MESSAGE_MAX_LEN = 500
PERSIST_EVERY_SECONDS = 0.5

_PROGRESS_RE = re.compile(r"DM_PROGRESS\s+(\d+)\s+(\d+|NA)\s+(.+)")
_DEST_RE = re.compile(r"DM_DEST\s+(.+)")


class YtDlpWorker:
    def __init__(
        self,
        repo: DownloadRepository,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repo
        self._clock = clock

    async def run(self, task: DownloadTask) -> None:
        try:
            Path(task.save_path).mkdir(parents=True, exist_ok=True)
            await self._run_ytdlp(task)
            task.status = DownloadStatus.COMPLETED
            task.completed_at = self._clock()
            await self._repo.update(task)
        except Exception as exc:
            task.status = DownloadStatus.FAILED
            task.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
            with contextlib.suppress(Exception):
                await self._repo.update(task)

    async def _run_ytdlp(self, task: DownloadTask) -> None:
        # The literal `/` between two %(...)s substitutions is an actual path
        # separator that yt-dlp respects when creating directories. If we
        # instead emit `/` from INSIDE a substitution field (e.g. with the
        # `%(uploader&/|)s` "if-set" trick), yt-dlp's per-field sanitizer
        # rewrites it to the Unicode fullwidth solidus (⧸) — and you end up
        # with `Videos/Gracie Abrams⧸title.mp4` rather than the artist subdir
        # the user actually wanted.
        out_template = (
            str(Path(task.save_path))
            + "/%(uploader,channel,artist|Unknown)s/%(title)s.%(ext)s"
        )
        fmt = task.media_format_id or "bv*+ba/best"
        # Always end the selector with a "/bv*+ba/best" fallback so a missing
        # specific format (e.g. "137+bestaudio" not present for this video)
        # degrades to "best video + best audio merged" rather than failing
        # with "Requested format is not available".
        if "/best" not in fmt:
            fmt = f"{fmt}/bv*+ba/best"

        # No `--extractor-args` and no `--cookies-from-browser`: forcing a
        # player_client list makes yt-dlp cycle through every client in
        # sequence (~12 min on YouTube's 2026 bot-wall), and Chrome cookies
        # are broken against YouTube as of the May 2026 nightly. The default
        # extractor path picks a working client on its own in ~60 s.
        args = [
            yt_dlp_bin(),
            "-f", fmt,
            "--merge-output-format", "mp4",
            "-o", out_template,
            "--newline",
            "--no-color",
            "--no-playlist",
            "--no-warnings",
            "--no-quiet",
            "--progress-template",
            "download:DM_PROGRESS %(progress.downloaded_bytes)s "
            "%(progress.total_bytes)s %(progress.filename)s",
            "--print", "after_move:DM_DEST %(filepath)s",
        ]
        ffmpeg_path = ffmpeg_bin()
        if ffmpeg_path:
            args += ["--ffmpeg-location", ffmpeg_path]
        args.append(task.url)

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None

        last_persist = 0.0
        last_error_line = ""
        final_path: str | None = None
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").rstrip()
            if not line:
                continue
            m = _PROGRESS_RE.search(line)
            if m:
                downloaded = int(m.group(1))
                total_raw = m.group(2)
                total = int(total_raw) if total_raw != "NA" else None
                task.downloaded_size = downloaded
                if total is not None:
                    task.total_size = total
                now = time.monotonic()
                if now - last_persist >= PERSIST_EVERY_SECONDS:
                    await self._repo.update(task)
                    last_persist = now
                continue
            md = _DEST_RE.search(line)
            if md:
                final_path = md.group(1).strip()
                continue
            if line.startswith("ERROR"):
                last_error_line = line

        rc = await proc.wait()
        if rc != 0:
            msg = last_error_line or f"yt-dlp exited with code {rc}"
            raise RuntimeError(msg)

        if final_path:
            p = Path(final_path)
            task.file_name = p.name
            task.save_path = str(p.parent)
            if task.total_size is None:
                with contextlib.suppress(OSError):
                    task.total_size = p.stat().st_size
                    task.downloaded_size = task.total_size
