# Download Lifecycle Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pause/resume active downloads, cancel+delete in-flight downloads, retry failed ones, and choose (for completed items) whether deleting also removes the file from disk.

**Architecture:** The `DownloadRunner` gains a per-download registry so it can cancel one specific download via asyncio task cancellation; workers terminate their child process / close their stream in a `finally`. The start use-case is broadened so `paused`/`failed`/`cancelled` downloads can be re-spawned (resume == retry). New `/pause` endpoint; `DELETE` stops active downloads first and accepts a `delete_file` flag. The desktop UI wires its already-present (but dead) pause button and adds a delete-confirm dialog.

**Tech Stack:** Python 3.14, FastAPI, asyncio, pytest (`asyncio_mode=auto`); React 19 + TypeScript (verified with `tsc -b`, no JS test runner in this repo).

**Reference spec:** `docs/superpowers/specs/2026-06-06-download-lifecycle-controls-design.md`

**Working directory for all commands:** `apps/api` for backend (`uv run ...`), `apps/desktop` for frontend (`npx ...`), unless an absolute path is shown.

---

## File Structure

**Backend (modify):**
- `apps/api/src/dm_api/application/services/download_runner.py` — registry + `stop()`
- `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py` — terminate subprocess on cancel
- `apps/api/src/dm_api/infrastructure/http/single_segment_worker.py` — (verify cancel-safety; likely no change)
- `apps/api/src/dm_api/application/use_cases/start_download.py` — accept paused/failed/cancelled
- `apps/api/src/dm_api/presentation/routers/downloads.py` — `/pause`, broadened `DELETE`

**Backend (tests, modify/create):**
- `apps/api/tests/unit/application/test_download_runner.py`
- `apps/api/tests/unit/application/test_start_download.py`
- `apps/api/tests/unit/infrastructure/test_ytdlp_worker_cancel.py` (create)
- `apps/api/tests/unit/infrastructure/test_single_segment_worker.py`
- `apps/api/tests/integration/test_api_routes.py`

**Frontend (modify/create):**
- `apps/desktop/src/api.ts` — `pauseDownload`, `deleteDownload(id, deleteFile)`
- `apps/desktop/src/hooks/useDownloads.ts` — `pauseDownload`, delete-file passthrough
- `apps/desktop/src/components/DeleteConfirmDialog.tsx` (create)
- `apps/desktop/src/App.tsx` — `handlePause`, delete-confirm flow, thread `onPause`
- `apps/desktop/src/components/DownloadRow.tsx` — `onPause` prop, wire pause buttons
- `apps/desktop/src/components/PlaylistView.tsx` — thread `onPause` through

---

## Task 1: Runner per-download registry + `stop()`

**Files:**
- Modify: `apps/api/src/dm_api/application/services/download_runner.py`
- Test: `apps/api/tests/unit/application/test_download_runner.py`

- [ ] **Step 1: Write the failing test** — append to `test_download_runner.py`:

```python
async def test_stop_cancels_a_running_download() -> None:
    started = asyncio.Event()

    class SlowWorker:
        async def run(self, task: DownloadTask) -> None:
            started.set()
            await asyncio.sleep(60)  # block until cancelled

    runner = DownloadRunner(worker_factory=lambda: SlowWorker())  # type: ignore[arg-type]
    task = _make_task()
    runner.spawn(task)
    await asyncio.wait_for(started.wait(), timeout=1.0)

    stopped = await runner.stop(task.id)

    assert stopped is True
    assert task.id not in runner._tasks


async def test_stop_unknown_id_returns_false() -> None:
    runner = DownloadRunner(worker_factory=lambda: AsyncMock())
    assert await runner.stop(uuid4()) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/unit/application/test_download_runner.py -v`
Expected: FAIL — `AttributeError: 'DownloadRunner' object has no attribute 'stop'`.

- [ ] **Step 3: Write minimal implementation** — replace the body of `download_runner.py` from the `self._tasks` declaration onward so the registry is a dict keyed by id:

```python
from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Callable
from uuid import UUID

from dm_api.application.ports.segment_worker import SegmentWorker
from dm_api.domain.entities.download_task import DownloadTask

DEFAULT_MAX_PARALLEL = 3


class DownloadRunner:
    def __init__(
        self,
        worker_factory: Callable[[], SegmentWorker],
        media_worker_factory: Callable[[], SegmentWorker] | None = None,
        max_parallel: int = DEFAULT_MAX_PARALLEL,
    ) -> None:
        self._worker_factory = worker_factory
        self._media_worker_factory = media_worker_factory
        self._tasks: dict[UUID, asyncio.Task[None]] = {}
        self._semaphore = asyncio.Semaphore(max_parallel)
        self._max_parallel = max_parallel

    def spawn(self, task: DownloadTask) -> None:
        if task.media_format_id and self._media_worker_factory is not None:
            worker = self._media_worker_factory()
        else:
            worker = self._worker_factory()

        async def _gated_run() -> None:
            async with self._semaphore:
                await worker.run(task)

        bg = asyncio.create_task(_gated_run(), name=f"download-{task.id}")
        self._tasks[task.id] = bg
        bg.add_done_callback(lambda _t, tid=task.id: self._tasks.pop(tid, None))

    async def stop(self, download_id: UUID) -> bool:
        """Cancel the running task for this download, awaiting its cleanup.

        Returns True if a task was running, False otherwise.
        """
        bg = self._tasks.get(download_id)
        if bg is None:
            return False
        bg.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await bg
        return True

    async def wait_idle(self) -> None:
        if self._tasks:
            await asyncio.gather(*list(self._tasks.values()), return_exceptions=True)
```

- [ ] **Step 4: Run the full runner test file**

Run: `uv run pytest tests/unit/application/test_download_runner.py -v`
Expected: PASS (all existing tests + the two new ones). The existing `test_completed_tasks_are_removed` still asserts `len(runner._tasks) == 0` — works for a dict.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/application/services/download_runner.py apps/api/tests/unit/application/test_download_runner.py
git commit -m "feat(runner): per-download registry + stop() for cancellation"
```

---

## Task 2: yt-dlp worker terminates its subprocess on cancel

**Why:** `asyncio.CancelledError` is a `BaseException`, so the worker's `except Exception` already lets it propagate without marking the task FAILED. But the spawned `yt-dlp` process keeps running (orphaned). Add a `finally` that terminates it.

**Files:**
- Modify: `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py`
- Test: `apps/api/tests/unit/infrastructure/test_ytdlp_worker_cancel.py` (create)

- [ ] **Step 1: Write the failing test** — create `test_ytdlp_worker_cancel.py`:

```python
"""YtDlpWorker must terminate its subprocess when its run() is cancelled."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.media import ytdlp_worker as mod
from dm_api.infrastructure.media.ytdlp_worker import YtDlpWorker


def _task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(), url="https://youtube.com/watch?v=x", file_name="media.download",
        save_path="/tmp", total_size=None, downloaded_size=0,
        status=DownloadStatus.DOWNLOADING, resume_supported=False, segment_count=1,
        category="video", speed_limit=None, checksum=None, checksum_algorithm=None,
        error_message=None, created_at=datetime.now(UTC), started_at=None,
        completed_at=None, media_format_id="bv*+ba/best",
    )


class _FakeProc:
    def __init__(self) -> None:
        self.returncode: int | None = None
        self.terminated = False
        self.stdout = self
        self._blocked = asyncio.Event()

    async def readline(self) -> bytes:
        await self._blocked.wait()  # never returns until terminated
        return b""

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15
        self._blocked.set()

    async def wait(self) -> int:
        await self._blocked.wait()
        return self.returncode or 0


async def test_cancel_terminates_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeProc()

    async def _fake_exec(*_a, **_k):
        return fake

    monkeypatch.setattr(mod.asyncio, "create_subprocess_exec", _fake_exec)
    monkeypatch.setattr(mod, "yt_dlp_bin", lambda: "yt-dlp")
    monkeypatch.setattr(mod, "ffmpeg_bin", lambda: None)

    repo = AsyncMock()
    worker = YtDlpWorker(repo)
    run_task = asyncio.create_task(worker.run(_task()))
    await asyncio.sleep(0.05)  # let it reach the read loop

    run_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await run_task

    assert fake.terminated is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/unit/infrastructure/test_ytdlp_worker_cancel.py -v`
Expected: FAIL — `assert fake.terminated is True` is False (no termination on cancel).

- [ ] **Step 3: Write minimal implementation** — in `ytdlp_worker.py`, wrap the read-loop + wait in a `try/finally` inside `_run_ytdlp`. Change the block that starts at `proc = await asyncio.create_subprocess_exec(` so the loop and `await proc.wait()` live inside `try:` and add the `finally`:

```python
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None

        last_persist = 0.0
        last_error_line = ""
        final_path: str | None = None
        try:
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
        finally:
            # If we're being cancelled (pause/cancel), the loop above is
            # interrupted with the child still running. Terminate it so no
            # orphaned yt-dlp/ffmpeg process is left behind. The .part file
            # stays on disk so resume can continue.
            if proc.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    proc.terminate()

        if rc != 0:
            msg = last_error_line or f"yt-dlp exited with code {rc}"
            raise RuntimeError(msg)
```

(`contextlib` is already imported at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/unit/infrastructure/test_ytdlp_worker_cancel.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py apps/api/tests/unit/infrastructure/test_ytdlp_worker_cancel.py
git commit -m "fix(ytdlp-worker): terminate subprocess on cancellation (no orphans)"
```

---

## Task 3: Confirm SingleSegmentWorker is cancel-safe

**Why:** Its download happens inside `async with self._client.stream(...)` and `aiofiles.open(...)`, which close on `CancelledError`. And `except Exception` does not catch `CancelledError`, so the task is not marked FAILED. This task adds a regression test; no source change is expected.

**Files:**
- Test: `apps/api/tests/unit/infrastructure/test_single_segment_worker.py` (append)

- [ ] **Step 1: Write the test** — append:

```python
async def test_cancel_does_not_mark_failed(tmp_path) -> None:
    import asyncio
    from datetime import UTC, datetime
    from unittest.mock import AsyncMock
    from uuid import uuid4

    import httpx

    from dm_api.domain.entities.download_task import DownloadTask
    from dm_api.domain.value_objects.download_status import DownloadStatus
    from dm_api.infrastructure.http.single_segment_worker import SingleSegmentWorker

    async def _slow_stream(request: httpx.Request) -> httpx.Response:
        async def _body():
            yield b"x" * 1024
            await asyncio.sleep(60)  # stall mid-stream
        return httpx.Response(200, content=_body())

    transport = httpx.MockTransport(_slow_stream)
    repo = AsyncMock()
    task = DownloadTask(
        id=uuid4(), url="https://example.com/f.bin", file_name="f.bin",
        save_path=str(tmp_path), total_size=None, downloaded_size=0,
        status=DownloadStatus.DOWNLOADING, resume_supported=False, segment_count=1,
        category="general", speed_limit=None, checksum=None, checksum_algorithm=None,
        error_message=None, created_at=datetime.now(UTC), started_at=None,
        completed_at=None,
    )
    async with httpx.AsyncClient(transport=transport) as client:
        worker = SingleSegmentWorker(client, repo)
        run_task = asyncio.create_task(worker.run(task))
        await asyncio.sleep(0.05)
        run_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await run_task

    assert task.status != DownloadStatus.FAILED
```

If the file does not already `import pytest`, add it at the top.

- [ ] **Step 2: Run test**

Run: `uv run pytest tests/unit/infrastructure/test_single_segment_worker.py -v`
Expected: PASS immediately (confirms cancel-safety). If it FAILS (task marked FAILED), wrap the body of `SingleSegmentWorker.run` similarly: change `except Exception` to ensure `CancelledError` is not caught — it already isn't, so this should pass without code changes.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/unit/infrastructure/test_single_segment_worker.py
git commit -m "test(http-worker): regression test for cancel-safety"
```

---

## Task 4: Broaden StartDownloadUseCase to resume/retry

**Files:**
- Modify: `apps/api/src/dm_api/application/use_cases/start_download.py`
- Test: `apps/api/tests/unit/application/test_start_download.py`

- [ ] **Step 1: Write the failing tests** — append to `test_start_download.py` (reuse the file's existing fixtures/builders; if it has a task-builder helper use it, otherwise construct a `DownloadTask` as in Task 1). Add:

```python
async def test_resume_from_paused_respawns(monkeypatch) -> None:
    from unittest.mock import AsyncMock, MagicMock
    from dm_api.application.use_cases.start_download import StartDownloadUseCase
    from dm_api.domain.value_objects.download_status import DownloadStatus

    task = _make_task()  # use this module's helper / builder
    task.status = DownloadStatus.PAUSED
    task.media_format_id = "bv*+ba/best"
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    runner = MagicMock()
    uc = StartDownloadUseCase(repo=repo, metadata_probe=AsyncMock(), runner=runner)

    result = await uc.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    runner.spawn.assert_called_once_with(task)


async def test_retry_from_failed_clears_error(monkeypatch) -> None:
    from unittest.mock import AsyncMock, MagicMock
    from dm_api.application.use_cases.start_download import StartDownloadUseCase
    from dm_api.domain.value_objects.download_status import DownloadStatus

    task = _make_task()
    task.status = DownloadStatus.FAILED
    task.error_message = "boom"
    task.media_format_id = "bv*+ba/best"
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    runner = MagicMock()
    uc = StartDownloadUseCase(repo=repo, metadata_probe=AsyncMock(), runner=runner)

    result = await uc.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    assert result.error_message is None
    runner.spawn.assert_called_once()


async def test_completed_cannot_be_restarted() -> None:
    from unittest.mock import AsyncMock, MagicMock
    import pytest
    from dm_api.application.use_cases.start_download import (
        StartDownloadUseCase, InvalidStateError,
    )
    from dm_api.domain.value_objects.download_status import DownloadStatus

    task = _make_task()
    task.status = DownloadStatus.COMPLETED
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    uc = StartDownloadUseCase(repo=repo, metadata_probe=AsyncMock(), runner=MagicMock())

    with pytest.raises(InvalidStateError):
        await uc.execute(task.id)
```

> If `test_start_download.py` does not already define a `_make_task()` helper, copy the one from `test_download_runner.py` (Task 1 reference) into this file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/unit/application/test_start_download.py -v`
Expected: FAIL — paused/failed currently raise `InvalidStateError`.

- [ ] **Step 3: Write the implementation** — in `start_download.py`, replace the state guard + transition. Replace lines from the `if task.status != DownloadStatus.PENDING:` check through `await self._repo.update(task)` (just before `self._runner.spawn(task)`) with:

```python
        _RESUMABLE = {
            DownloadStatus.PENDING,
            DownloadStatus.PAUSED,
            DownloadStatus.FAILED,
            DownloadStatus.CANCELLED,
        }
        if task.status not in _RESUMABLE:
            raise InvalidStateError(
                f"download {id} is in status {task.status.value}; "
                "only pending/paused/failed/cancelled can be (re)started"
            )

        # Fresh PENDING HTTP downloads need a metadata probe + destination check.
        # Resume/retry skip both: the file (or its .part) already exists and the
        # worker continues it.
        if task.status == DownloadStatus.PENDING and task.media_format_id is None:
            destination = Path(task.save_path) / task.file_name
            if destination.exists():
                raise DestinationExistsError(f"destination already exists: {destination}")
            try:
                metadata = await self._metadata_probe.probe(task.url)
            except Exception as exc:
                task.status = DownloadStatus.FAILED
                task.error_message = f"metadata probe failed: {exc}"[:_ERROR_MESSAGE_MAX_LEN]
                await self._repo.update(task)
                raise MetadataProbeError(str(exc)) from exc
            task.total_size = metadata.total_size

        task.resume_supported = False         # multi-segment is a later phase
        task.segment_count = 1
        task.error_message = None
        task.status = DownloadStatus.DOWNLOADING
        if task.started_at is None:
            task.started_at = self._clock()
        await self._repo.update(task)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/unit/application/test_start_download.py -v`
Expected: PASS (new tests + existing ones, including the still-rejected `completed` case).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/application/use_cases/start_download.py apps/api/tests/unit/application/test_start_download.py
git commit -m "feat(start): allow resume/retry from paused/failed/cancelled"
```

---

## Task 5: `POST /api/downloads/{id}/pause` endpoint

**Files:**
- Modify: `apps/api/src/dm_api/presentation/routers/downloads.py`
- Test: `apps/api/tests/integration/test_api_routes.py`

- [ ] **Step 1: Write the failing test** — append to `test_api_routes.py`, following the file's existing client fixture/pattern (it already exercises create/start/delete). Use the same async client fixture name the file uses (shown here as `client`):

```python
async def test_pause_active_download_sets_paused(client) -> None:
    # Create a download, force it active, then pause.
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/a.bin", "save_path": "/tmp", "category": "general",
    })).json()
    did = created["id"]

    # Put it in DOWNLOADING directly via the repo on app.state so we don't
    # depend on a real network start.
    from uuid import UUID
    from dm_api.domain.value_objects.download_status import DownloadStatus
    repo = client._transport.app.state.repo  # adjust to however the fixture exposes app
    task = await repo.get_by_id(UUID(did))
    task.status = DownloadStatus.DOWNLOADING
    await repo.update(task)

    resp = await client.post(f"/api/downloads/{did}/pause")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"


async def test_pause_non_active_returns_409(client) -> None:
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/b.bin", "save_path": "/tmp", "category": "general",
    })).json()
    resp = await client.post(f"/api/downloads/{created['id']}/pause")
    assert resp.status_code == 409
```

> Match the existing test file's fixture style for the client and for reaching `app.state` (it already constructs the app/runner). If reaching `app.state.repo` differs, mirror what other tests in this file do to read/modify a task.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/integration/test_api_routes.py -k pause -v`
Expected: FAIL — 404 (no `/pause` route).

- [ ] **Step 3: Write the implementation** — add to `downloads.py` (after the `/start` route). It uses the existing `_ACTIVE_STATUSES` set already defined at the top of the file:

```python
@router.post("/{id}/pause", response_model=DownloadDTO)
async def pause_download(request: Request, id: UUID) -> DownloadDTO:
    repo = request.app.state.repo
    runner = request.app.state.runner
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    if task.status not in _ACTIVE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"download is {task.status.value}; only active downloads can be paused",
        )
    await runner.stop(id)
    # Re-read: the worker may have finished or failed during stop(); don't
    # downgrade a terminal status to paused.
    task = await repo.get_by_id(id)
    if task is not None and task.status in _ACTIVE_STATUSES:
        task.status = DownloadStatus.PAUSED
        await repo.update(task)
    return DownloadDTO.from_entity(task)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/integration/test_api_routes.py -k pause -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/presentation/routers/downloads.py apps/api/tests/integration/test_api_routes.py
git commit -m "feat(api): POST /downloads/{id}/pause"
```

---

## Task 6: `DELETE` stops active downloads + `delete_file` flag

**Files:**
- Modify: `apps/api/src/dm_api/presentation/routers/downloads.py`
- Test: `apps/api/tests/integration/test_api_routes.py`

- [ ] **Step 1: Write the failing tests** — append:

```python
async def test_delete_active_download_succeeds(client) -> None:
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/c.bin", "save_path": "/tmp", "category": "general",
    })).json()
    did = created["id"]
    from uuid import UUID
    from dm_api.domain.value_objects.download_status import DownloadStatus
    repo = client._transport.app.state.repo  # mirror file's app.state access
    task = await repo.get_by_id(UUID(did))
    task.status = DownloadStatus.DOWNLOADING
    await repo.update(task)

    resp = await client.delete(f"/api/downloads/{did}")
    assert resp.status_code == 204
    assert await repo.get_by_id(UUID(did)) is None


async def test_delete_file_true_removes_file(client, tmp_path) -> None:
    f = tmp_path / "movie.mp4"
    f.write_bytes(b"data")
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/movie.mp4", "save_path": str(tmp_path),
        "category": "video", "file_name": "movie.mp4",
    })).json()
    did = created["id"]
    from uuid import UUID
    from dm_api.domain.value_objects.download_status import DownloadStatus
    repo = client._transport.app.state.repo
    task = await repo.get_by_id(UUID(did))
    task.status = DownloadStatus.COMPLETED
    await repo.update(task)

    resp = await client.delete(f"/api/downloads/{did}?delete_file=true")
    assert resp.status_code == 204
    assert not f.exists()


async def test_delete_file_false_keeps_file(client, tmp_path) -> None:
    f = tmp_path / "keep.mp4"
    f.write_bytes(b"data")
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/keep.mp4", "save_path": str(tmp_path),
        "category": "video", "file_name": "keep.mp4",
    })).json()
    did = created["id"]
    from uuid import UUID
    from dm_api.domain.value_objects.download_status import DownloadStatus
    repo = client._transport.app.state.repo
    task = await repo.get_by_id(UUID(did))
    task.status = DownloadStatus.COMPLETED
    await repo.update(task)

    resp = await client.delete(f"/api/downloads/{did}")
    assert resp.status_code == 204
    assert f.exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/integration/test_api_routes.py -k "delete_active or delete_file" -v`
Expected: FAIL — active delete returns 409; `delete_file` param ignored.

- [ ] **Step 3: Write the implementation** — replace the existing `delete_download` function in `downloads.py` with:

```python
@router.delete("/{id}", status_code=204)
async def delete_download(request: Request, id: UUID, delete_file: bool = False) -> Response:
    repo = request.app.state.repo
    runner = request.app.state.runner
    task = await repo.get_by_id(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")

    # Stop it first if it's in flight — no more 409.
    if task.status in _ACTIVE_STATUSES:
        await runner.stop(id)

    final_path = Path(task.save_path) / task.file_name
    part_path = final_path.with_suffix(final_path.suffix + ".part")
    # Always clean up the partial scrap.
    with contextlib.suppress(OSError):
        if part_path.exists():
            part_path.unlink()
    # Only remove the finished file when the caller explicitly asks.
    if delete_file:
        with contextlib.suppress(OSError):
            if final_path.exists():
                final_path.unlink()

    await repo.delete(id)
    return Response(status_code=204)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/integration/test_api_routes.py -k "delete" -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend gate**

Run: `uv run pytest -q && uv run ruff check . && uv run mypy --strict src`
Expected: all green, coverage ≥ 90%.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/presentation/routers/downloads.py apps/api/tests/integration/test_api_routes.py
git commit -m "feat(api): allow deleting active downloads + delete_file flag"
```

---

## Task 7: Frontend API client — pause + delete_file

**Files:**
- Modify: `apps/desktop/src/api.ts`

- [ ] **Step 1: Edit `api.ts`** — change the `deleteDownload` line and add `pauseDownload`:

```typescript
  startDownload: (id: string) => req<Download>('POST', `/api/downloads/${id}/start`),
  pauseDownload: (id: string) => req<Download>('POST', `/api/downloads/${id}/pause`),
  deleteDownload: (id: string, deleteFile = false) =>
    req<void>('DELETE', `/api/downloads/${id}?delete_file=${deleteFile}`),
```

(Replace the existing `startDownload`/`deleteDownload` lines; keep the rest of the object unchanged.)

- [ ] **Step 2: Typecheck**

Run (in `apps/desktop`): `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/api.ts
git commit -m "feat(ui-api): pauseDownload + delete_file param"
```

---

## Task 8: `useDownloads` hook — pause + delete-file passthrough

**Files:**
- Modify: `apps/desktop/src/hooks/useDownloads.ts`

- [ ] **Step 1: Add `pauseDownload` and update `deleteDownload`** — replace the existing `deleteDownload` callback and add `pauseDownload` next to `startDownload`:

```typescript
  const pauseDownload = useCallback(async (id: string) => {
    const updated = await api.pauseDownload(id);
    setDownloads((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const deleteDownload = useCallback(async (id: string, deleteFile = false) => {
    await api.deleteDownload(id, deleteFile);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
    setProgress((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);
```

- [ ] **Step 2: Export `pauseDownload`** — add it to the returned object:

```typescript
  return {
    downloads,
    progress,
    loading,
    error,
    startDownload,
    pauseDownload,
    addDownload,
    deleteDownload,
    refresh: fetchDownloads,
  };
```

- [ ] **Step 3: Typecheck**

Run (in `apps/desktop`): `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/hooks/useDownloads.ts
git commit -m "feat(ui): useDownloads pauseDownload + deleteFile passthrough"
```

---

## Task 9: Delete-confirm dialog component

**Files:**
- Create: `apps/desktop/src/components/DeleteConfirmDialog.tsx`

- [ ] **Step 1: Create `DeleteConfirmDialog.tsx`**:

```tsx
import type { Download } from '../types';

interface Props {
  download: Download;
  onCancel: () => void;
  onConfirm: (deleteFile: boolean) => void;
}

/** Shown when deleting a COMPLETED download: choose whether to also remove the
 *  file from disk. Non-completed deletes don't use this (no finished file). */
export function DeleteConfirmDialog({ download, onCancel, onConfirm }: Props) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '380px', maxWidth: 'calc(100% - 48px)',
          background: 'var(--dm-color-bg-elevated)',
          border: '1px solid var(--dm-color-border-default)',
          borderRadius: 'var(--dm-radius-lg)',
          padding: '20px', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 'var(--dm-text-lg)', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-primary)' }}>
          Delete download
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 'var(--dm-text-sm)', color: 'var(--dm-color-fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {download.file_name}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onConfirm(false)}
            style={btn('var(--dm-color-bg-recessed)', 'var(--dm-color-fg-primary)')}
          >
            Remove from list (keep file)
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={btn('var(--dm-color-status-danger-surface)', 'var(--dm-color-status-danger-text)')}
          >
            Delete file from disk too
          </button>
          <button
            onClick={onCancel}
            style={{ ...btn('transparent', 'var(--dm-color-fg-tertiary)'), border: 'none' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--dm-radius-md)',
    border: '1px solid var(--dm-color-border-subtle)', background: bg, color: fg,
    fontSize: 'var(--dm-text-sm)', fontWeight: 'var(--dm-weight-medium)', cursor: 'pointer',
    textAlign: 'center',
  };
}
```

- [ ] **Step 2: Typecheck**

Run (in `apps/desktop`): `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/DeleteConfirmDialog.tsx
git commit -m "feat(ui): DeleteConfirmDialog for completed-item deletes"
```

---

## Task 10: Wire pause + delete-confirm in App.tsx

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Pull `pauseDownload` from the hook and add dialog state.** Change the destructure on line ~30:

```typescript
  const { downloads, progress, loading, error, startDownload, pauseDownload, addDownload, deleteDownload, refresh } = useDownloads();
```

Add near the other `useState` calls:

```typescript
  const [deleteTarget, setDeleteTarget] = useState<import('./types').Download | null>(null);
```

- [ ] **Step 2: Add `handlePause` and rework `handleDelete`.** Add `handlePause` next to `handleStart`, and replace `handleDelete`:

```typescript
  async function handlePause(id: string) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await pauseDownload(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to pause');
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  async function performDelete(id: string, deleteFile: boolean) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await deleteDownload(id, deleteFile);
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  function handleDelete(id: string) {
    const d = downloads.find(x => x.id === id);
    const status = d ? (progress[d.id]?.status ?? d.status) : undefined;
    if (d && status === 'completed') {
      setDeleteTarget(d);            // ask: keep file or delete file
      return;
    }
    if (!confirm('Delete this download from the list?')) return;
    void performDelete(id, false);   // incomplete/paused/failed: no finished file
  }
```

- [ ] **Step 3: Thread `onPause` to the list and render the dialog.** Add `onPause={handlePause}` to the `<DownloadRow .../>` in the `filtered.map(...)` (around line 353) and to the `<PlaylistView .../>` (around line 304). Then, just before the closing of the Modals section (after the `{showAdd && (...)}` block, near line 422), add:

```tsx
      {deleteTarget && (
        <DeleteConfirmDialog
          download={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(deleteFile) => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            void performDelete(id, deleteFile);
          }}
        />
      )}
```

Add the import at the top with the other component imports:

```typescript
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
```

- [ ] **Step 4: Typecheck**

Run (in `apps/desktop`): `npx tsc -b`
Expected: errors about `DownloadRow`/`PlaylistView` not accepting `onPause` — fixed in Task 11. If you implement Task 11 first, expect no errors. Otherwise proceed to Task 11 then re-run.

- [ ] **Step 5: Commit** (after Task 11 typechecks clean, commit together or separately):

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat(ui): wire pause + delete-confirm flow in App"
```

---

## Task 11: Wire `onPause` through DownloadRow + PlaylistView

**Files:**
- Modify: `apps/desktop/src/components/DownloadRow.tsx`
- Modify: `apps/desktop/src/components/PlaylistView.tsx`

- [ ] **Step 1: Add `onPause` to `DownloadRowProps`** (after `onStart`):

```typescript
  onStart: (id: string) => void;
  onPause: (id: string) => void;
```

Add it to the destructured params in `export function DownloadRow({ ... })`.

- [ ] **Step 2: Wire the two dead pause buttons.** In BOTH the grid variant (~line 735) and the list variant (~line 920), replace the empty pause handler:

```tsx
            {isActive && (
              <ActionButton
                aria-label="Pause download"
                onClick={(e) => { e.stopPropagation(); onPause(download.id); }}
              >
                <IcoPause size={14} />
              </ActionButton>
            )}
```

(Use `size={13}` in the grid variant to match the surrounding code.)

- [ ] **Step 3: Fix the context-menu pause/resume routing.** In all three `<ContextMenu ... onPauseResume={...}>` usages (playlist ~line 598, grid ~line 793, list ~line 978), change so an active item pauses and a paused item resumes:

```tsx
            onPauseResume={
              isActive ? () => { onPause(download.id); setMenuOpen(false); }
              : isPaused ? () => { onStart(download.id); setMenuOpen(false); }
              : undefined
            }
```

- [ ] **Step 4: Add `onPause` to PlaylistView and pass it down.** In `PlaylistView.tsx`, add `onPause: (id: string) => void;` to its props interface, destructure it, and pass `onPause={onPause}` to every `<DownloadRow .../>` it renders.

- [ ] **Step 5: Typecheck**

Run (in `apps/desktop`): `npx tsc -b`
Expected: no errors (App.tsx from Task 10 now satisfied).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/DownloadRow.tsx apps/desktop/src/components/PlaylistView.tsx
git commit -m "feat(ui): wire real pause action through rows + playlist"
```

---

## Task 12: End-to-end manual verification on the running app

**Files:** none (verification only).

- [ ] **Step 1: Rebuild the sidecar + run the app.** Follow `README.md` "Build from source" steps 5-6 to rebuild the PyInstaller sidecar and stage it, then launch via `./run_app.sh` (it handles this machine's snap `XDG_DATA_HOME` + GStreamer quirks). For a faster loop, dev mode also works: API `uv run python -m dm_api.presentation.main`, UI `npm run dev`, shell `cargo tauri dev`.

- [ ] **Step 2: Pause / Resume.** Start a real download (a long YouTube video). Click Pause — status badge shows "paused", progress stops. In a terminal confirm no orphan: `pgrep -fa yt-dlp` (should show nothing for that download). Click Resume — it continues from where it stopped (downloaded bytes don't reset to 0) and reaches "completed".

- [ ] **Step 3: Cancel active.** Start a download, then Delete it mid-flight (3-dot → Delete). It disappears with no 409 error, and `pgrep -fa yt-dlp` shows no leftover process.

- [ ] **Step 4: Retry failed.** Force a failure (start a download with no network, or pick a known-bad URL). When it's "failed", click Retry — it transitions to downloading.

- [ ] **Step 5: Ask-on-delete.** Delete a *completed* item → the dialog appears. "Remove from list" → item gone, file still in the folder. Delete another completed item → "Delete file too" → item gone AND file removed from the folder (verify in the file manager).

- [ ] **Step 6: Final gate + branch summary.**

```bash
cd apps/api && uv run pytest -q && uv run ruff check . && uv run mypy --strict src && cd ../..
cd apps/desktop && npx tsc -b && cd ../..
git log --oneline feat/download-lifecycle-controls
```

Expected: backend green (≥90% coverage), frontend typechecks, commit history shows the task series.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** pause (Tasks 1,2,5,9-11), resume (Task 4 + UI), retry (Task 4 + UI), delete-active (Tasks 1,6 + UI), ask-on-delete/`delete_file` (Tasks 6-10), no-orphan guarantee (Task 2 + Task 12 Step 2/3), no schema migration (relies on existing `PAUSED`/`CANCELLED` enum values). All design sections map to a task.
- **`client._transport.app.state` in tests** is a placeholder for however `test_api_routes.py` already reaches the app/runner/repo — mirror the existing tests in that file rather than copying this verbatim; the fixture there already builds the app with a runner on `app.state`.
- **Type consistency:** `pauseDownload(id)` and `deleteDownload(id, deleteFile=false)` names are used identically across `api.ts`, `useDownloads.ts`, and `App.tsx`; `onPause(id: string)` prop name is identical across `App.tsx`, `DownloadRow.tsx`, `PlaylistView.tsx`. Backend `runner.stop(id)` signature is consistent across runner, `/pause`, and `DELETE`.
