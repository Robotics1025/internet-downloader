"""Binary discovery for the yt-dlp probe and download worker.

In packaged mode the Tauri shell sets `DM_YTDLP_BIN` and `DM_FFMPEG_BIN` to the
absolute paths of binaries it shipped inside the installer. In contributor dev
mode no env var is set and we fall back to PATH so `yt-dlp` / `ffmpeg` installed
via brew/apt/pip just work.
"""
from __future__ import annotations

import os
import shutil


def yt_dlp_bin() -> str:
    """Return the absolute path to the yt-dlp binary.

    Precedence:
      1. ``DM_YTDLP_BIN`` env var (set by the packaged desktop shell).
      2. ``shutil.which("yt-dlp")`` (dev contributor's installed copy).

    Raises ``RuntimeError`` if neither resolves. yt-dlp is *required* — there is
    no useful fallback when it is missing.
    """
    explicit = os.environ.get("DM_YTDLP_BIN")
    if explicit:
        return explicit
    found = shutil.which("yt-dlp")
    if not found:
        raise RuntimeError(
            "yt-dlp not found on PATH and DM_YTDLP_BIN env var is not set. "
            "Install yt-dlp (`pip install yt-dlp` or `brew install yt-dlp`) "
            "or set DM_YTDLP_BIN to point at the binary."
        )
    return found


def ffmpeg_bin() -> str | None:
    """Return the absolute path to the ffmpeg binary, or ``None`` if missing.

    Precedence:
      1. ``DM_FFMPEG_BIN`` env var (set by the packaged desktop shell).
      2. ``shutil.which("ffmpeg")``.

    Unlike yt-dlp, ffmpeg is *optional* — yt-dlp can still download single-format
    streams (e.g. format 18 = 360p mp4 with audio muxed in) without it. We return
    None and let yt-dlp's own behaviour decide whether the absence is fatal.
    """
    explicit = os.environ.get("DM_FFMPEG_BIN")
    if explicit:
        return explicit
    return shutil.which("ffmpeg")
