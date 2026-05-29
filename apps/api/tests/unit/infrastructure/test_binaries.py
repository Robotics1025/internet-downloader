"""Tests for the binary-discovery helpers used by the yt-dlp probe and worker.

The packaged desktop app sets `DM_YTDLP_BIN` and `DM_FFMPEG_BIN` env vars to
point at binaries it shipped inside the installer. In contributor dev mode no
env var is set and we fall back to PATH lookup.
"""
from __future__ import annotations

import pytest

from dm_api.infrastructure.media import binaries


def test_yt_dlp_bin_prefers_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DM_YTDLP_BIN", "/opt/packaged/yt-dlp")
    assert binaries.yt_dlp_bin() == "/opt/packaged/yt-dlp"


def test_yt_dlp_bin_falls_back_to_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DM_YTDLP_BIN", raising=False)
    monkeypatch.setattr(binaries.shutil, "which", lambda name: f"/usr/bin/{name}")
    assert binaries.yt_dlp_bin() == "/usr/bin/yt-dlp"


def test_yt_dlp_bin_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DM_YTDLP_BIN", raising=False)
    monkeypatch.setattr(binaries.shutil, "which", lambda name: None)
    with pytest.raises(RuntimeError, match="yt-dlp not found"):
        binaries.yt_dlp_bin()


def test_ffmpeg_bin_prefers_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DM_FFMPEG_BIN", "/opt/packaged/ffmpeg")
    assert binaries.ffmpeg_bin() == "/opt/packaged/ffmpeg"


def test_ffmpeg_bin_falls_back_to_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DM_FFMPEG_BIN", raising=False)
    monkeypatch.setattr(binaries.shutil, "which", lambda name: f"/usr/bin/{name}")
    assert binaries.ffmpeg_bin() == "/usr/bin/ffmpeg"


def test_ffmpeg_bin_returns_none_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """ffmpeg is *optional* — yt-dlp can still download single-format streams
    without it. Return None and let yt-dlp's own behaviour take over."""
    monkeypatch.delenv("DM_FFMPEG_BIN", raising=False)
    monkeypatch.setattr(binaries.shutil, "which", lambda name: None)
    assert binaries.ffmpeg_bin() is None
