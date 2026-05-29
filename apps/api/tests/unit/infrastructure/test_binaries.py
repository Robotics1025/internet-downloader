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


def test_probe_uses_resolved_yt_dlp(monkeypatch: pytest.MonkeyPatch) -> None:
    """The probe must shell out to the binary returned by ``yt_dlp_bin()``
    rather than a hard-coded literal."""
    import asyncio

    from dm_api.infrastructure.media import ytdlp_probe

    monkeypatch.setenv("DM_YTDLP_BIN", "/opt/packaged/yt-dlp")

    captured_args: list[str] = []

    class _StubProc:
        returncode = 0

        async def communicate(self) -> tuple[bytes, bytes]:
            return (b"{}", b"")

        async def wait(self) -> int:
            return 0

        def kill(self) -> None:
            return None

    async def _stub_exec(*args: str, **kwargs: object) -> _StubProc:
        captured_args.extend(args)
        return _StubProc()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_exec)

    probe = ytdlp_probe.YtDlpProbe()
    asyncio.run(probe._probe_once("https://example.com/video"))

    assert captured_args[0] == "/opt/packaged/yt-dlp"


def test_worker_uses_resolved_yt_dlp(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from dm_api.domain.entities.download_task import DownloadTask
    from dm_api.domain.value_objects.download_status import DownloadStatus
    from dm_api.infrastructure.media import ytdlp_worker
    from datetime import UTC, datetime
    from uuid import uuid4

    monkeypatch.setenv("DM_YTDLP_BIN", "/opt/packaged/yt-dlp")
    monkeypatch.delenv("DM_FFMPEG_BIN", raising=False)
    # Ensure ffmpeg_bin() returns None (no ffmpeg on PATH in this scenario).
    from dm_api.infrastructure.media import binaries as _binaries
    monkeypatch.setattr(_binaries.shutil, "which", lambda name: None)

    captured_args: list[str] = []

    class _StubProc:
        returncode = 0
        stdout = None

        async def wait(self) -> int:
            return 0

    async def _stub_exec(*args: str, **kwargs: object) -> _StubProc:
        captured_args.extend(args)
        proc = _StubProc()

        class _EmptyStdout:
            async def readline(self) -> bytes:
                return b""

        proc.stdout = _EmptyStdout()  # type: ignore[assignment]
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_exec)

    # Avoid Path(task.save_path).mkdir() side effects in tests.
    monkeypatch.setattr(ytdlp_worker.Path, "mkdir", lambda *a, **kw: None)

    class _NoopRepo:
        async def update(self, task: object) -> None: ...

    task = DownloadTask(
        id=uuid4(),
        url="https://example.com/v",
        file_name="media.download",
        save_path="/tmp",
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.DOWNLOADING,
        category="video",
        speed_limit=None,
        resume_supported=False,
        segment_count=1,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime.now(UTC),
        started_at=None,
        completed_at=None,
        media_format_id="bv*+ba/best",
    )

    worker = ytdlp_worker.YtDlpWorker(repo=_NoopRepo())
    asyncio.run(worker._run_ytdlp(task))

    assert captured_args[0] == "/opt/packaged/yt-dlp"
    # When DM_FFMPEG_BIN is unset and PATH lookup returns None, the worker
    # MUST NOT pass --ffmpeg-location at all.
    assert "--ffmpeg-location" not in captured_args


def test_worker_passes_ffmpeg_location_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from dm_api.domain.entities.download_task import DownloadTask
    from dm_api.domain.value_objects.download_status import DownloadStatus
    from dm_api.infrastructure.media import ytdlp_worker
    from datetime import UTC, datetime
    from uuid import uuid4

    monkeypatch.setenv("DM_YTDLP_BIN", "/opt/packaged/yt-dlp")
    monkeypatch.setenv("DM_FFMPEG_BIN", "/opt/packaged/ffmpeg")

    captured_args: list[str] = []

    class _StubProc:
        returncode = 0

        async def wait(self) -> int:
            return 0

    async def _stub_exec(*args: str, **kwargs: object) -> _StubProc:
        captured_args.extend(args)
        proc = _StubProc()

        class _EmptyStdout:
            async def readline(self) -> bytes:
                return b""

        proc.stdout = _EmptyStdout()  # type: ignore[attr-defined]
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_exec)
    monkeypatch.setattr(ytdlp_worker.Path, "mkdir", lambda *a, **kw: None)

    class _NoopRepo:
        async def update(self, task: object) -> None: ...

    task = DownloadTask(
        id=uuid4(),
        url="https://example.com/v",
        file_name="media.download",
        save_path="/tmp",
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.DOWNLOADING,
        category="video",
        speed_limit=None,
        resume_supported=False,
        segment_count=1,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime.now(UTC),
        started_at=None,
        completed_at=None,
        media_format_id="bv*+ba/best",
    )

    worker = ytdlp_worker.YtDlpWorker(repo=_NoopRepo())
    asyncio.run(worker._run_ytdlp(task))

    # The flag and value must appear consecutively.
    idx = captured_args.index("--ffmpeg-location")
    assert captured_args[idx + 1] == "/opt/packaged/ffmpeg"
