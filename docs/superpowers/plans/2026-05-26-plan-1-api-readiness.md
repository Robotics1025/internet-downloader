# Plan 1 — API Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare `apps/api` to run as a sidecar inside a packaged desktop app. The API must (1) discover its bound port at startup and announce it to whoever spawned the process, (2) resolve `yt-dlp` and `ffmpeg` from env-var overrides instead of relying on PATH, and (3) emit structured logs to a per-OS log file so we can debug problems on a user's machine.

**Architecture:** Add one new helper module `infrastructure/media/binaries.py` that both `ytdlp_probe.py` and `ytdlp_worker.py` use for binary discovery. Add one new helper module `infrastructure/logging/setup.py` that the entry point calls once. Replace the env-var-driven entry point in `presentation/main.py` with an argparse-driven one that pre-binds a socket and prints `DM_PORT <N>` to stdout before starting uvicorn.

**Tech Stack:** Python 3.14, FastAPI, uvicorn, stdlib `logging`, `socket`, `argparse`, `shutil`, pytest with `asyncio_mode = "auto"`.

**Spec:** `docs/superpowers/specs/2026-05-26-desktop-app-packaging-design.md` — covers Phase A.

---

## File Structure

**New files (5):**

- `apps/api/src/dm_api/infrastructure/media/binaries.py` — `yt_dlp_bin()` and `ffmpeg_bin()` resolvers. Single source of truth for "which binary do we shell out to?"
- `apps/api/src/dm_api/infrastructure/logging/__init__.py` — empty package marker.
- `apps/api/src/dm_api/infrastructure/logging/setup.py` — `configure_logging()` entry point + JSON formatter + rotating file handler.
- `apps/api/tests/unit/infrastructure/test_binaries.py` — unit tests for `binaries.py`.
- `apps/api/tests/unit/infrastructure/test_logging_setup.py` — unit tests for `setup.py`.

**Modified files (4):**

- `apps/api/src/dm_api/infrastructure/media/ytdlp_probe.py` — replace `YTDLP_BIN = "yt-dlp"` with `yt_dlp_bin()` call.
- `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py` — replace `YTDLP_BIN = "yt-dlp"` with `yt_dlp_bin()`, add `--ffmpeg-location` to yt-dlp args when `ffmpeg_bin()` returns non-None.
- `apps/api/src/dm_api/presentation/main.py` — argparse CLI (`--host`, `--port`), pre-bind socket, print `DM_PORT <N>`, call `configure_logging()`.
- `apps/api/tests/unit/presentation/test_main.py` — extend with tests for port discovery and `DM_PORT` printing.

---

## Task 1: Binary discovery module

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/media/binaries.py`
- Test: `apps/api/tests/unit/infrastructure/test_binaries.py`

- [ ] **Step 1.1: Write the failing test**

Create `apps/api/tests/unit/infrastructure/test_binaries.py`:

```python
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
```

- [ ] **Step 1.2: Run test to verify it fails**

Run from `apps/api/`:
```bash
uv run pytest tests/unit/infrastructure/test_binaries.py -v
```
Expected: All 6 tests fail with `ModuleNotFoundError: No module named 'dm_api.infrastructure.media.binaries'`.

- [ ] **Step 1.3: Write minimal implementation**

Create `apps/api/src/dm_api/infrastructure/media/binaries.py`:

```python
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
```

- [ ] **Step 1.4: Run test to verify it passes**

Run from `apps/api/`:
```bash
uv run pytest tests/unit/infrastructure/test_binaries.py -v
```
Expected: All 6 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/media/binaries.py \
        apps/api/tests/unit/infrastructure/test_binaries.py
git commit -m "feat(api): add binary discovery for yt-dlp and ffmpeg"
```

---

## Task 2: Wire binary discovery into ytdlp_probe

**Files:**
- Modify: `apps/api/src/dm_api/infrastructure/media/ytdlp_probe.py:23`
- Test: existing `apps/api/tests/unit/infrastructure/test_httpx_metadata_probe.py` is unrelated; add a focused new test for the binary resolution path.

- [ ] **Step 2.1: Write the failing test**

Append to `apps/api/tests/unit/infrastructure/test_binaries.py`:

```python
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
```

- [ ] **Step 2.2: Run the new test to verify it fails**

```bash
uv run pytest tests/unit/infrastructure/test_binaries.py::test_probe_uses_resolved_yt_dlp -v
```
Expected: FAIL — `captured_args[0]` will be `"yt-dlp"` (the current module-level constant), not `/opt/packaged/yt-dlp`.

- [ ] **Step 2.3: Update `ytdlp_probe.py`**

Open `apps/api/src/dm_api/infrastructure/media/ytdlp_probe.py`. Replace the import block at the top:

```python
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass

YTDLP_BIN = "yt-dlp"
```

…with:

```python
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass

from dm_api.infrastructure.media.binaries import yt_dlp_bin
```

Then inside `_probe_once`, change the args construction. Find:

```python
        args = [
            YTDLP_BIN,
            "-j",
            "--no-warnings",
            "--no-playlist",
            url,
        ]
```

…and replace `YTDLP_BIN` with `yt_dlp_bin()`:

```python
        args = [
            yt_dlp_bin(),
            "-j",
            "--no-warnings",
            "--no-playlist",
            url,
        ]
```

- [ ] **Step 2.4: Run the test to verify it passes**

```bash
uv run pytest tests/unit/infrastructure/test_binaries.py::test_probe_uses_resolved_yt_dlp -v
```
Expected: PASS.

- [ ] **Step 2.5: Run the full unit suite to confirm nothing else broke**

```bash
uv run pytest tests/unit -q
```
Expected: All existing tests still PASS.

- [ ] **Step 2.6: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/media/ytdlp_probe.py \
        apps/api/tests/unit/infrastructure/test_binaries.py
git commit -m "refactor(api): wire ytdlp_probe through binary discovery"
```

---

## Task 3: Wire binary discovery into ytdlp_worker (incl. ffmpeg)

**Files:**
- Modify: `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py:22` (the `YTDLP_BIN` constant) and `:77-92` (the `args` list).
- Test: `apps/api/tests/unit/infrastructure/test_binaries.py` (append two tests).

- [ ] **Step 3.1: Write the failing tests**

Append to `apps/api/tests/unit/infrastructure/test_binaries.py`:

```python
def test_worker_uses_resolved_yt_dlp(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from dm_api.domain.entities.download_task import DownloadTask
    from dm_api.domain.value_objects.download_status import DownloadStatus
    from dm_api.infrastructure.media import ytdlp_worker
    from datetime import UTC, datetime
    from uuid import uuid4

    monkeypatch.setenv("DM_YTDLP_BIN", "/opt/packaged/yt-dlp")
    monkeypatch.delenv("DM_FFMPEG_BIN", raising=False)
    monkeypatch.setattr(ytdlp_worker.shutil if hasattr(ytdlp_worker, "shutil") else ytdlp_worker, "shutil", None, raising=False)

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
```

- [ ] **Step 3.2: Run the new tests to verify they fail**

```bash
uv run pytest tests/unit/infrastructure/test_binaries.py::test_worker_uses_resolved_yt_dlp \
              tests/unit/infrastructure/test_binaries.py::test_worker_passes_ffmpeg_location_when_set -v
```
Expected: both FAIL.

- [ ] **Step 3.3: Update `ytdlp_worker.py`**

In `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py`, replace the import block and constant:

```python
from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

YTDLP_BIN = "yt-dlp"
```

…with:

```python
from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.media.binaries import ffmpeg_bin, yt_dlp_bin
```

(Remove the `YTDLP_BIN = "yt-dlp"` constant entirely.)

Then inside `_run_ytdlp`, change the args construction. The current block is:

```python
        args = [
            YTDLP_BIN,
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
            task.url,
        ]
```

Replace with:

```python
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
```

- [ ] **Step 3.4: Run the tests to verify they pass**

```bash
uv run pytest tests/unit/infrastructure/test_binaries.py -v
```
Expected: all 10 tests PASS (6 original + 1 probe + 2 worker + 1 worker-with-ffmpeg).

- [ ] **Step 3.5: Run the full unit suite**

```bash
uv run pytest tests/unit -q
```
Expected: all existing tests still PASS.

- [ ] **Step 3.6: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py \
        apps/api/tests/unit/infrastructure/test_binaries.py
git commit -m "refactor(api): wire ytdlp_worker through binary discovery + ffmpeg-location"
```

---

## Task 4: Port discovery in main.py

**Files:**
- Modify: `apps/api/src/dm_api/presentation/main.py` (full rewrite).
- Test: `apps/api/tests/unit/presentation/test_main.py` (add new tests).

- [ ] **Step 4.1: Write the failing tests**

Append to `apps/api/tests/unit/presentation/test_main.py`:

```python
import socket
import sys
from unittest.mock import MagicMock

from dm_api.presentation import main as main_mod


def test_parse_args_defaults() -> None:
    args = main_mod._parse_args([])
    assert args.host == "127.0.0.1"
    assert args.port == 6543


def test_parse_args_explicit() -> None:
    args = main_mod._parse_args(["--host", "::1", "--port", "0"])
    assert args.host == "::1"
    assert args.port == 0


def test_parse_args_rejects_non_loopback_host() -> None:
    with pytest.raises(SystemExit):
        # argparse will call _validate_host and exit on error.
        main_mod._parse_args(["--host", "0.0.0.0"])


def test_bind_returns_listening_socket_on_explicit_port() -> None:
    sock = main_mod._bind("127.0.0.1", 0)
    try:
        # Port 0 means OS-assigned; getsockname() reports the real port.
        assigned_port = sock.getsockname()[1]
        assert assigned_port > 0
    finally:
        sock.close()


def test_bind_falls_back_to_random_port_when_requested_is_busy() -> None:
    # First grab a port so the next bind sees EADDRINUSE.
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    busy_port = blocker.getsockname()[1]

    try:
        sock = main_mod._bind("127.0.0.1", busy_port)
        try:
            assigned = sock.getsockname()[1]
            assert assigned > 0
            assert assigned != busy_port
        finally:
            sock.close()
    finally:
        blocker.close()


def test_main_prints_dm_port_before_uvicorn_runs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The DM_PORT line must be flushed to stdout BEFORE uvicorn enters its
    blocking serve loop, so the Tauri shell sees the port immediately."""
    fake_server = MagicMock()
    fake_server.run = MagicMock()

    monkeypatch.setattr(main_mod.uvicorn, "Server", MagicMock(return_value=fake_server))
    monkeypatch.setattr(main_mod.uvicorn, "Config", MagicMock())
    monkeypatch.setattr(main_mod, "configure_logging", lambda: None)

    main_mod.main(["--port", "0"])

    captured = capsys.readouterr().out.splitlines()
    dm_port_lines = [line for line in captured if line.startswith("DM_PORT ")]
    assert len(dm_port_lines) == 1
    port_str = dm_port_lines[0].split(" ", 1)[1]
    assert int(port_str) > 0
```

- [ ] **Step 4.2: Run the tests to verify they fail**

```bash
uv run pytest tests/unit/presentation/test_main.py -v
```
Expected: the new tests fail (`AttributeError: module ... has no attribute '_parse_args'`, etc.). The two pre-existing host-validation tests should still pass.

- [ ] **Step 4.3: Rewrite `main.py`**

Replace the entire contents of `apps/api/src/dm_api/presentation/main.py` with:

```python
"""uvicorn entry point.

Bind defaults to 127.0.0.1:6543. The host check rejects any non-loopback
address — this app is local-only by design.

When spawned as a sidecar by the Tauri desktop shell, the parent process needs
to know which port we actually bound to (it may differ from the requested port
if 6543 was taken). We pre-bind a socket, print ``DM_PORT <N>`` as a single line
to stdout, and hand the socket to uvicorn via its ``fd`` config option so there
is no race window between port discovery and accept().
"""
from __future__ import annotations

import argparse
import socket
import sys

import uvicorn

from dm_api.infrastructure.logging.setup import configure_logging
from dm_api.presentation.app import create_app

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6543
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _validate_host(host: str) -> None:
    if host not in _LOOPBACK_HOSTS:
        raise RuntimeError(
            f"--host must be a loopback address; got {host!r}. "
            "This app is local-only by design."
        )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="dm-api")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)
    try:
        _validate_host(args.host)
    except RuntimeError as exc:
        parser.error(str(exc))
    return args


def _bind(host: str, port: int) -> socket.socket:
    """Return a bound + listening socket. If ``port`` is busy, fall back to an
    OS-assigned port (port 0)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
    except OSError:
        # Requested port is in use — let the OS pick one.
        sock.close()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind((host, 0))
    sock.listen(128)
    return sock


def main(argv: list[str] | None = None) -> None:
    configure_logging()
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    sock = _bind(args.host, args.port)
    actual_port = sock.getsockname()[1]
    # Announce the port BEFORE serving so whatever spawned us can pick it up
    # without polling.
    print(f"DM_PORT {actual_port}", flush=True)
    config = uvicorn.Config(create_app(), fd=sock.fileno(), log_level="info")
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4.4: Stub out the logging helper so tests pass**

The new `main.py` imports `configure_logging` from `dm_api.infrastructure.logging.setup`, which doesn't exist yet. Create the **stub** now (Task 5 fills it in):

Create `apps/api/src/dm_api/infrastructure/logging/__init__.py` with empty contents.

Create `apps/api/src/dm_api/infrastructure/logging/setup.py`:

```python
"""Structured logging setup. Replaced with the real implementation in Task 5."""
from __future__ import annotations


def configure_logging() -> None:
    """Stub. Real implementation arrives in the next task."""
    return None
```

- [ ] **Step 4.5: Run the new tests**

```bash
uv run pytest tests/unit/presentation/test_main.py -v
```
Expected: all tests PASS (2 pre-existing + 6 new).

- [ ] **Step 4.6: Manual smoke test**

Run from `apps/api/`:
```bash
uv run python -m dm_api.presentation.main --port 0 &
sleep 3
curl -s http://127.0.0.1:$(grep -oP 'DM_PORT \K\d+' <<< "$(jobs -l)")/api/health || \
  echo "Use the port shown in the DM_PORT line above, e.g. curl -s http://127.0.0.1:NNNNN/api/health"
kill %1
```

Expected: the foreground output includes a line `DM_PORT <N>` where N > 0. `/api/health` returns JSON with `"status": "ok"`.

- [ ] **Step 4.7: Run the full unit suite**

```bash
uv run pytest tests/unit -q
```
Expected: all pass.

- [ ] **Step 4.8: Commit**

```bash
git add apps/api/src/dm_api/presentation/main.py \
        apps/api/src/dm_api/infrastructure/logging/__init__.py \
        apps/api/src/dm_api/infrastructure/logging/setup.py \
        apps/api/tests/unit/presentation/test_main.py
git commit -m "feat(api): add port discovery + DM_PORT stdout announcement"
```

---

## Task 5: Structured logging — JSON formatter + rotating file handler

**Files:**
- Modify: `apps/api/src/dm_api/infrastructure/logging/setup.py` (replace stub from Task 4).
- Test: `apps/api/tests/unit/infrastructure/test_logging_setup.py` (new file).

- [ ] **Step 5.1: Write the failing tests**

Create `apps/api/tests/unit/infrastructure/test_logging_setup.py`:

```python
"""Tests for ``configure_logging``: JSON formatter and rotating file handler.

We are testing the *shape* of the configuration: that records go through the
JSON formatter, that the file handler points where we expect, and that the
size + backup-count rotation is set. We do not try to test rotation behaviour
end-to-end — Python's stdlib already does that."""
from __future__ import annotations

import json
import logging
import logging.handlers
from pathlib import Path

import pytest

from dm_api.infrastructure.logging import setup


@pytest.fixture(autouse=True)
def _reset_root_logger() -> None:
    """``configure_logging`` mutates the root logger. Reset between tests so
    one test's handlers don't leak into the next."""
    root = logging.getLogger()
    original_handlers = root.handlers[:]
    original_level = root.level
    yield
    root.handlers[:] = original_handlers
    root.setLevel(original_level)


def test_configure_logging_adds_console_and_file_handlers(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    root = logging.getLogger()
    handler_types = {type(h) for h in root.handlers}
    assert logging.StreamHandler in handler_types
    assert logging.handlers.RotatingFileHandler in handler_types


def test_log_file_path_uses_provided_dir(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    root = logging.getLogger()
    file_handler = next(
        h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
    )
    assert Path(file_handler.baseFilename) == tmp_path / "api.log"


def test_rotation_is_configured() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        setup.configure_logging(log_dir=Path(tmp))
        root = logging.getLogger()
        file_handler = next(
            h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
        )
        # Spec: rotate at 5 MB, keep 3 files.
        assert file_handler.maxBytes == 5 * 1024 * 1024
        assert file_handler.backupCount == 3


def test_records_are_emitted_as_json(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    logging.getLogger("dm_api.test").warning("hello %s", "world", extra={"task_id": "abc"})
    for h in logging.getLogger().handlers:
        h.flush()
    log_path = tmp_path / "api.log"
    text = log_path.read_text()
    # One line per record; parse the first line.
    line = text.splitlines()[0]
    record = json.loads(line)
    assert record["level"] == "WARNING"
    assert record["message"] == "hello world"
    assert record["logger"] == "dm_api.test"
    assert record["task_id"] == "abc"


def test_default_log_dir_is_under_data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When no ``log_dir`` is passed, the helper uses ``<data_dir>/logs``."""
    monkeypatch.setenv("DM_DATA_DIR", str(tmp_path))
    setup.configure_logging()
    root = logging.getLogger()
    file_handler = next(
        h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
    )
    assert Path(file_handler.baseFilename) == tmp_path / "logs" / "api.log"
```

- [ ] **Step 5.2: Run the tests to verify they fail**

```bash
uv run pytest tests/unit/infrastructure/test_logging_setup.py -v
```
Expected: all 5 tests FAIL — the current `setup.py` is a no-op stub.

- [ ] **Step 5.3: Implement `setup.py`**

Replace the contents of `apps/api/src/dm_api/infrastructure/logging/setup.py` with:

```python
"""Structured logging setup for the API.

Configures the root logger with:

  * A console handler at INFO level (uvicorn's existing handlers continue to
    work; we are additive).
  * A rotating file handler that writes one JSON record per line to
    ``<data_dir>/logs/api.log``, rotating at 5 MB and keeping 3 backups.

The JSON shape is intentionally minimal — ``ts``, ``level``, ``logger``,
``message``, plus anything passed via ``extra=...``. Production users hit
"Copy diagnostics" in the desktop Settings screen and paste the file into a bug
report; the format needs to be greppable, not pretty.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
from datetime import UTC, datetime
from pathlib import Path

_STANDARD_RECORD_ATTRS = frozenset(
    {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "asctime", "taskName",
    }
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Surface any structured fields passed via ``extra=...``.
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_ATTRS or key.startswith("_"):
                continue
            payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _default_log_dir() -> Path:
    data_dir_env = os.environ.get("DM_DATA_DIR")
    if data_dir_env:
        return Path(data_dir_env) / "logs"
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / "download-manager" / "logs"


def configure_logging(
    level: str = "INFO",
    log_dir: Path | None = None,
) -> None:
    """Install the structured logging configuration on the root logger.

    Safe to call multiple times — any prior handlers added by this function are
    cleared first so we don't accumulate duplicates across reloads.
    """
    if log_dir is None:
        log_dir = _default_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(level)
    # Remove handlers that we previously installed; leave any others (e.g.
    # pytest's caplog handler) alone.
    for handler in list(root.handlers):
        if getattr(handler, "_dm_owned", False):
            root.removeHandler(handler)

    json_formatter = _JsonFormatter()

    console = logging.StreamHandler()
    console.setFormatter(json_formatter)
    console.setLevel(level)
    console._dm_owned = True  # type: ignore[attr-defined]
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        filename=log_dir / "api.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_formatter)
    file_handler.setLevel(level)
    file_handler._dm_owned = True  # type: ignore[attr-defined]
    root.addHandler(file_handler)
```

- [ ] **Step 5.4: Run the tests to verify they pass**

```bash
uv run pytest tests/unit/infrastructure/test_logging_setup.py -v
```
Expected: all 5 tests PASS.

- [ ] **Step 5.5: Run the full unit suite**

```bash
uv run pytest tests/unit -q
```
Expected: all pass.

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/logging/setup.py \
        apps/api/tests/unit/infrastructure/test_logging_setup.py
git commit -m "feat(api): structured JSON logging with rotating file handler"
```

---

## Task 6: Wire logging into main + integration sanity check

The stub is already wired in Task 4 step 4.3 — `main.main()` calls `configure_logging()` before parsing args. Task 5 replaced the stub with the real implementation, so nothing else needs to change in `main.py`. This task is the **integration verification** that the whole Phase A picture works end-to-end on the dev machine.

**Files:**
- (No code changes.)

- [ ] **Step 6.1: Run the API with custom port and verify log file is created**

```bash
rm -rf /tmp/dm_test_data && mkdir -p /tmp/dm_test_data
DM_DATA_DIR=/tmp/dm_test_data uv run python -m dm_api.presentation.main --port 0 &
APIPID=$!
sleep 4
ls /tmp/dm_test_data/logs/api.log
head -1 /tmp/dm_test_data/logs/api.log
kill $APIPID
```

Expected:
- `api.log` exists.
- Its first line is valid JSON containing fields `ts`, `level`, `logger`, `message` (uvicorn or app startup line).

- [ ] **Step 6.2: Run the API with DM_YTDLP_BIN pointed at a stub and verify it is honoured**

```bash
cat > /tmp/fake-ytdlp <<'EOF'
#!/bin/sh
echo "fake-ytdlp called with: $@" >&2
exit 1
EOF
chmod +x /tmp/fake-ytdlp

DM_DATA_DIR=/tmp/dm_test_data DM_YTDLP_BIN=/tmp/fake-ytdlp \
  uv run python -m dm_api.presentation.main --port 0 &
APIPID=$!
sleep 4
PORT=$(grep -oP 'DM_PORT \K\d+' /tmp/dm_test_data/logs/api.log || true)
# Fallback: pull the port from the foreground stdout (saved earlier).
echo "API listening on port $PORT (sample probe will fail-fast because yt-dlp is a stub)"
curl -s -X POST "http://127.0.0.1:$PORT/api/media/probe" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://example.com/x"}'
echo
kill $APIPID
grep "fake-ytdlp called" /tmp/dm_test_data/logs/api.log /tmp/*.err 2>/dev/null || \
  echo "(stderr of fake-ytdlp is consumed by the probe; success means probe responded {\"is_media\": false} above)"
```

Expected:
- The probe responds with `{"is_media": false}` because the stub exits non-zero.
- This proves `DM_YTDLP_BIN` is being honoured (yt-dlp from PATH would have returned real JSON).

- [ ] **Step 6.3: Run the full pytest suite (unit + integration)**

```bash
uv run pytest -q
```

Expected: all tests pass. (Integration tests in `tests/integration/` may depend on real yt-dlp on PATH — that is still the default fallback when `DM_YTDLP_BIN` is unset.)

- [ ] **Step 6.4: Commit (only if any tweaks were needed)**

If steps 6.1–6.3 surfaced anything that needed a small fix, commit it with a `chore(api): finalize phase-A integration` message. Otherwise no commit is needed for this task.

---

## Done

After Task 6 the API is ready to be packaged. To verify Phase A is complete, the following must all be true:

- `uv run python -m dm_api.presentation.main --port 0` prints `DM_PORT <N>` and starts serving.
- `DM_YTDLP_BIN=/path/to/yt-dlp` overrides PATH lookup in both probe and worker.
- `DM_FFMPEG_BIN=/path/to/ffmpeg` is passed to yt-dlp via `--ffmpeg-location` for downloads.
- API logs land at `<data_dir>/logs/api.log` as JSON, one record per line, rotating at 5 MB.
- `uv run pytest -q` is green.

The next plan (Plan 2 — Desktop bundling) picks up from here: it teaches the React UI to read the injected port, ships the API as a PyInstaller binary, and wraps everything in a Tauri shell to produce a Linux `.AppImage`.
