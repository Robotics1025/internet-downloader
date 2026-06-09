# File Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when a completed download's file is removed/moved/renamed outside the app, mark it **Missing**, and let the user Remove it; self-heal when the file returns.

**Architecture:** A `file_missing` boolean is added to the download row. A background `ReconcileService` (mirroring the existing `ProgressService`) stats completed downloads' files on startup and every ~15s and flips `file_missing` on change. The flag rides the existing list/poll to the UI, which shows a "Missing" badge and disables play. No new endpoint; Remove uses the existing DELETE. Reconcile only reads the filesystem — it never deletes or moves files.

**Tech Stack:** Python 3.14, FastAPI, asyncio, alembic, aiosqlite, pytest (`asyncio_mode=auto`); React + TS (`tsc -b`, no JS test runner).

**Reference spec:** `docs/superpowers/specs/2026-06-07-file-reconcile-design.md`

**Working dirs:** `apps/api` for backend (`uv run …`), `apps/desktop` for frontend (`npx …`).

---

## File Structure
- Modify: `apps/api/src/dm_api/domain/entities/download_task.py` — add `file_missing`
- Create: `apps/api/src/dm_api/infrastructure/persistence/migrations/versions/0003_file_missing.py`
- Modify: `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py` — persist `file_missing`
- Create: `apps/api/src/dm_api/application/services/reconcile_service.py`
- Modify: `apps/api/src/dm_api/presentation/schemas/download_dto.py` — expose `file_missing`
- Modify: `apps/api/src/dm_api/presentation/app.py` — start/stop ReconcileService in lifespan
- Modify: `apps/desktop/src/types.ts` — add `file_missing`
- Modify: `apps/desktop/src/components/StatusBadge.tsx` — Missing variant
- Modify: `apps/desktop/src/components/DownloadRow.tsx` — show Missing, disable play
- Tests: `apps/api/tests/unit/application/test_reconcile_service.py` (create),
  `apps/api/tests/integration/test_sqlite_download_repository.py` (extend),
  `apps/api/tests/integration/test_api_routes.py` (extend)

---

## Task 1: `file_missing` on the entity, schema, and repo

**Files:**
- Modify: `apps/api/src/dm_api/domain/entities/download_task.py`
- Create: `apps/api/src/dm_api/infrastructure/persistence/migrations/versions/0003_file_missing.py`
- Modify: `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py`
- Test: `apps/api/tests/integration/test_sqlite_download_repository.py`

- [ ] **Step 1: Add the entity field.** In `download_task.py`, the dataclass ends with
`media_format_id: str | None = None`. Add a new defaulted field after it:
```python
    media_format_id: str | None = None
    file_missing: bool = False
```

- [ ] **Step 2: Create migration 0003.** Create
`apps/api/src/dm_api/infrastructure/persistence/migrations/versions/0003_file_missing.py`:
```python
"""add file_missing to downloads (external-deletion reconcile)

Revision ID: 0003_file_missing
Revises: 0002_media_format_id
Create Date: 2026-06-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_file_missing"
down_revision: str | Sequence[str] | None = "0002_media_format_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "downloads",
        sa.Column(
            "file_missing",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("downloads", "file_missing")
```

- [ ] **Step 3: Write the failing repo round-trip test.** Append to
`tests/integration/test_sqlite_download_repository.py` a test mirroring the file's
existing style (it already builds a repo against a temp DB and a task builder — reuse
whatever helper/fixture it uses; the snippet below assumes a `repo` fixture and a task
factory `make_task()` — adapt names to the file):
```python
async def test_file_missing_round_trips(repo) -> None:
    task = make_task()  # use this file's existing task builder
    task.file_missing = True
    await repo.save(task)
    loaded = await repo.get_by_id(task.id)
    assert loaded is not None
    assert loaded.file_missing is True

    loaded.file_missing = False
    await repo.update(loaded)
    again = await repo.get_by_id(task.id)
    assert again.file_missing is False
```
If the file has no shared `repo`/`make_task` helpers, construct them the way the other
tests in the file do (temp DB path → run migrations or create schema → `SQLiteDownloadRepository(url)`).

- [ ] **Step 4: Run it, confirm FAIL.**
Run: `uv run pytest tests/integration/test_sqlite_download_repository.py -k file_missing -v`
Expected: FAIL — repo doesn't persist `file_missing` yet (and/or column missing).

- [ ] **Step 5: Persist `file_missing` in the repo.** In
`sqlite_download_repository.py`:

(a) In `_row_to_task`, add the field to the constructor (backward-compatible like
`media_format_id`):
```python
        media_format_id=row["media_format_id"] if "media_format_id" in row.keys() else None,
        file_missing=bool(row["file_missing"]) if "file_missing" in row.keys() else False,
    )
```

(b) In `save`, add `int(task.file_missing)` as the final param and `file_missing` to the
column list + one more `?`:
```python
            task.completed_at.isoformat() if task.completed_at else None,
            task.media_format_id,
            int(task.file_missing),
        )
```
```python
                INSERT INTO downloads (
                    id, url, file_name, save_path, total_size, downloaded_size,
                    status, resume_supported, segment_count, category, speed_limit,
                    checksum, checksum_algorithm, error_message,
                    created_at, started_at, completed_at, media_format_id, file_missing
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

(c) In `update`, add `int(task.file_missing)` to params **before** the trailing
`str(task.id)`, and add `file_missing = ?` to the SET clause:
```python
            task.media_format_id,
            int(task.file_missing),
            str(task.id),
        )
```
```python
                    error_message = ?, created_at = ?, started_at = ?, completed_at = ?,
                    media_format_id = ?, file_missing = ?
                WHERE id = ?
```

- [ ] **Step 6: Run it, confirm PASS.**
Run: `uv run pytest tests/integration/test_sqlite_download_repository.py -k file_missing -v`
Expected: PASS. Then run the whole file to catch regressions:
`uv run pytest tests/integration/test_sqlite_download_repository.py -v`.

- [ ] **Step 7: ruff + mypy on touched files**, then commit.
```bash
uv run ruff check src tests && uv run mypy --strict src
git add apps/api/src/dm_api/domain/entities/download_task.py \
        apps/api/src/dm_api/infrastructure/persistence/migrations/versions/0003_file_missing.py \
        apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py \
        apps/api/tests/integration/test_sqlite_download_repository.py
git commit -m "feat(persistence): file_missing column + entity field"
```

---

## Task 2: ReconcileService

**Files:**
- Create: `apps/api/src/dm_api/application/services/reconcile_service.py`
- Test: `apps/api/tests/unit/application/test_reconcile_service.py`

- [ ] **Step 1: Write the failing unit test.** Create
`tests/unit/application/test_reconcile_service.py`:
```python
"""ReconcileService marks completed downloads missing when their file is gone."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from dm_api.application.services.reconcile_service import ReconcileService
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


class _FakeRepo:
    def __init__(self, tasks: list[DownloadTask]) -> None:
        self._tasks = {t.id: t for t in tasks}
        self.updates: list[DownloadTask] = []

    async def list_all(self) -> list[DownloadTask]:
        return list(self._tasks.values())

    async def update(self, task: DownloadTask) -> None:
        self.updates.append(task)
        self._tasks[task.id] = task


def _task(tmp_path, name: str, status: DownloadStatus, exists: bool) -> DownloadTask:
    if exists:
        (tmp_path / name).write_bytes(b"x")
    return DownloadTask(
        id=uuid4(), url="https://e/x", file_name=name, save_path=str(tmp_path),
        total_size=1, downloaded_size=1, status=status, resume_supported=False,
        segment_count=1, category="general", speed_limit=None, checksum=None,
        checksum_algorithm=None, error_message=None, created_at=datetime.now(UTC),
        started_at=None, completed_at=None,
    )


async def test_marks_completed_missing_when_file_absent(tmp_path) -> None:
    gone = _task(tmp_path, "gone.bin", DownloadStatus.COMPLETED, exists=False)
    here = _task(tmp_path, "here.bin", DownloadStatus.COMPLETED, exists=True)
    repo = _FakeRepo([gone, here])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert gone.file_missing is True
    assert here.file_missing is False
    assert gone in repo.updates and here not in repo.updates  # only changed rows persisted


async def test_clears_missing_when_file_returns(tmp_path) -> None:
    t = _task(tmp_path, "back.bin", DownloadStatus.COMPLETED, exists=True)
    t.file_missing = True  # stale
    repo = _FakeRepo([t])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert t.file_missing is False
    assert t in repo.updates


async def test_ignores_non_completed(tmp_path) -> None:
    dl = _task(tmp_path, "dl.bin", DownloadStatus.DOWNLOADING, exists=False)
    repo = _FakeRepo([dl])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert dl.file_missing is False
    assert repo.updates == []
```

- [ ] **Step 2: Run it, confirm FAIL.**
Run: `uv run pytest tests/unit/application/test_reconcile_service.py -v`
Expected: FAIL — module/class doesn't exist.

- [ ] **Step 3: Implement the service.** Create
`apps/api/src/dm_api/application/services/reconcile_service.py`:
```python
"""Background service that flags downloads whose file vanished from disk.

Mirrors ProgressService's lifecycle. Read-only against the filesystem: it never
deletes or moves files — it only stats completed downloads and toggles the
`file_missing` flag so the UI can surface externally-deleted files.
"""
from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.value_objects.download_status import DownloadStatus

RECONCILE_INTERVAL_SECONDS = 15.0


class ReconcileService:
    def __init__(self, repo: DownloadRepository) -> None:
        self._repo = repo
        self._running = False
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self) -> None:
        while self._running:
            try:
                await self.reconcile_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                # In production we would log this. Keep running.
                pass
            await asyncio.sleep(RECONCILE_INTERVAL_SECONDS)

    async def reconcile_once(self) -> None:
        tasks = await self._repo.list_all()
        for task in tasks:
            if task.status != DownloadStatus.COMPLETED:
                continue
            missing = not (Path(task.save_path) / task.file_name).exists()
            if missing != task.file_missing:
                task.file_missing = missing
                await self._repo.update(task)
```

- [ ] **Step 4: Run it, confirm PASS.**
Run: `uv run pytest tests/unit/application/test_reconcile_service.py -v`
Expected: PASS.

- [ ] **Step 5: ruff + mypy, commit.**
```bash
uv run ruff check src tests && uv run mypy --strict src
git add apps/api/src/dm_api/application/services/reconcile_service.py apps/api/tests/unit/application/test_reconcile_service.py
git commit -m "feat(reconcile): ReconcileService flags externally-deleted files"
```

---

## Task 3: Expose `file_missing` in the DTO + wire the service into lifespan

**Files:**
- Modify: `apps/api/src/dm_api/presentation/schemas/download_dto.py`
- Modify: `apps/api/src/dm_api/presentation/app.py`
- Test: `apps/api/tests/integration/test_api_routes.py`

- [ ] **Step 1: Write the failing integration test.** Append to
`tests/integration/test_api_routes.py` (mirror the file's client/app.state pattern used
by the pause/delete tests — `client._transport.app.state`):
```python
async def test_reconcile_marks_missing_file(client, tmp_path) -> None:
    from uuid import UUID
    from dm_api.domain.value_objects.download_status import DownloadStatus
    from dm_api.application.services.reconcile_service import ReconcileService

    f = tmp_path / "vid.mp4"
    f.write_bytes(b"data")
    created = (await client.post("/api/downloads", json={
        "url": "https://example.com/vid.mp4", "save_path": str(tmp_path),
        "category": "video", "file_name": "vid.mp4",
    })).json()
    did = created["id"]
    assert created["file_missing"] is False  # DTO exposes the flag

    repo = client._transport.app.state.repo
    task = await repo.get_by_id(UUID(did))
    task.status = DownloadStatus.COMPLETED
    await repo.update(task)

    svc = ReconcileService(repo)
    await svc.reconcile_once()
    assert (await client.get(f"/api/downloads/{did}")).json()["file_missing"] is False

    f.unlink()
    await svc.reconcile_once()
    assert (await client.get(f"/api/downloads/{did}")).json()["file_missing"] is True
```

- [ ] **Step 2: Run it, confirm FAIL.**
Run: `uv run pytest tests/integration/test_api_routes.py -k reconcile -v`
Expected: FAIL — `KeyError: 'file_missing'` (DTO doesn't expose it).

- [ ] **Step 3: Add `file_missing` to the DTO.** In `download_dto.py`, add the field to
`DownloadDTO` (after `media_format_id`) and to `from_entity`:
```python
    media_format_id: str | None
    file_missing: bool
```
```python
            media_format_id=task.media_format_id,
            file_missing=task.file_missing,
        )
```

- [ ] **Step 4: Wire ReconcileService into the lifespan.** In `app.py`:

(a) Import near the other service imports:
```python
from dm_api.application.services.progress_service import ProgressService
```
is imported inline already; add at top-level imports (with the other `application.services`):
```python
from dm_api.application.services.reconcile_service import ReconcileService
```

(b) After the existing `progress_service.start()` block (which sets
`app.state.progress_service`), add:
```python
        reconcile_service = ReconcileService(repo)
        reconcile_service.start()
        app.state.reconcile_service = reconcile_service
```
Place this *after* `repo` is constructed (it is, just above `progress_service`). 

(c) In the `finally:` of the lifespan, stop it alongside `progress_service`:
```python
        finally:
            await progress_service.stop()
            await reconcile_service.stop()
            await sa_engine.dispose()
```

- [ ] **Step 5: Run it, confirm PASS + full integration file.**
Run: `uv run pytest tests/integration/test_api_routes.py -k reconcile -v`
then `uv run pytest tests/integration/test_api_routes.py -v`
Expected: PASS, no regressions.

- [ ] **Step 6: Full backend gate.**
Run: `uv run pytest -q && uv run ruff check . && uv run mypy --strict src`
Expected: green (≥90% coverage, modulo the known pre-existing flakiness around
`progress_service`/network tests — if coverage dips just below, re-run; do not add
unrelated tests).

- [ ] **Step 7: Commit.**
```bash
git add apps/api/src/dm_api/presentation/schemas/download_dto.py apps/api/src/dm_api/presentation/app.py apps/api/tests/integration/test_api_routes.py
git commit -m "feat(api): expose file_missing + run ReconcileService in lifespan"
```

---

## Task 4: Frontend — show Missing, disable play

**Files:**
- Modify: `apps/desktop/src/types.ts`
- Modify: `apps/desktop/src/components/StatusBadge.tsx`
- Modify: `apps/desktop/src/components/DownloadRow.tsx`

- [ ] **Step 1: Add the field to the type.** In `types.ts`, in `interface Download`,
after `media_format_id: string | null;` add:
```typescript
  media_format_id: string | null;
  file_missing: boolean;
```

- [ ] **Step 2: Add a Missing variant to StatusBadge.** In `StatusBadge.tsx`, change the
props and short-circuit to a Missing badge:
```tsx
interface StatusBadgeProps {
  status: DownloadStatus;
  missing?: boolean;
}
```
In the component body, before computing `cfg`, add:
```tsx
export function StatusBadge({ status, missing = false }: StatusBadgeProps) {
  const cfg = missing
    ? {
        bg: 'var(--dm-color-status-danger-surface)',
        fg: 'var(--dm-color-status-danger-text)',
        label: 'Missing',
        dot: false,
      }
    : (STATUS_CONFIG[status] ?? STATUS_CONFIG.pending);
```
(Leave the rest of the render unchanged; `cfg.dot` is now always defined.)

- [ ] **Step 3: Use it in DownloadRow + disable play for missing.** In
`DownloadRow.tsx`, after the existing status derivations (where `isCompleted`,
`isPaused`, etc. are computed near the top of the component), add:
```tsx
  const isMissing = isCompleted && download.file_missing;
```
Then:
- Every `<StatusBadge status={status} />` usage → `<StatusBadge status={status} missing={isMissing} />` (there are usages in the playlist, grid, and list variants).
- Guard play so missing files can't be opened. The component plays on double-click via
  `onDoubleClick={(e) => { e.preventDefault(); if (isCompleted) onPlay(download.id); }}`
  in each variant — change `if (isCompleted)` to `if (isCompleted && !isMissing)`.
- For the completed action buttons (Play/Open and "Play file"/"Open file") that render
  under `{isCompleted && (...)}`, change those conditions to `{isCompleted && !isMissing && (...)}`
  so a missing file shows no Play/Open button. Leave **Open folder** and the 3-dot
  menu (which has **Delete/Remove**) available.

(Note: `file_missing` comes from the `download` record, not the progress snapshot, so
read `download.file_missing` directly — don't try to get it from `progress`.)

- [ ] **Step 4: Typecheck.**
Run: `cd apps/desktop && npx tsc -b`
Expected: zero errors. (If a `StatusBadge` call site elsewhere now needs the prop — it's
optional with a default, so existing calls remain valid.)

- [ ] **Step 5: Commit.**
```bash
git add apps/desktop/src/types.ts apps/desktop/src/components/StatusBadge.tsx apps/desktop/src/components/DownloadRow.tsx
git commit -m "feat(ui): show Missing badge + disable play for externally-deleted files"
```

---

## Task 5: End-to-end verification

**Files:** none.

- [ ] **Step 1: Full gates.**
```bash
cd apps/api && uv run pytest -q && uv run ruff check . && uv run mypy --strict src && cd ../..
cd apps/desktop && npx tsc -b && cd ../..
```
Expected: backend green (≥90% modulo known flakiness), frontend clean.

- [ ] **Step 2: Live check (dev API + DB).** Start the API from source on a temp data
dir (`DM_DATA_DIR=/tmp/recon uv run python -m dm_api.presentation.main --port 6543`),
add + complete a small download (or force a row to `completed` with a real file present),
confirm `GET /api/downloads/{id}` shows `file_missing:false`; delete the file on disk;
within ~15s (the reconcile interval) `GET` shows `file_missing:true`; restore/re-create
the file → next pass shows `file_missing:false`. Then stop the API and remove the temp dir.

- [ ] **Step 3: UI check (optional, needs Tauri build).** In the running app, a completed
item whose file you delete on disk shows the **Missing** badge within ~15s, has no Play
button, and can be Removed via the 3-dot menu.

---

## Self-Review notes (for the implementer)
- **Spec coverage:** schema+entity+repo (Task 1), ReconcileService startup+interval+once
  (Task 2), DTO + lifespan wiring (Task 3), Missing badge + play-disable + Remove-stays
  (Task 4), gates + manual (Task 5). All DoD items map to a task.
- **No placeholders:** every code edit is shown in full.
- **Type/name consistency:** `file_missing` (snake) is used identically across entity,
  migration column, repo, DTO, and (as `file_missing`) the TS `Download` type and
  `download.file_missing` reads; `reconcile_once()` is the name used by both tests and the
  lifespan-started loop; `ReconcileService.start()/stop()` match the ProgressService
  lifecycle the lifespan expects.
- **No-data-loss invariant:** ReconcileService only calls `.exists()` and `repo.update`;
  it never deletes/moves files. Removal stays an explicit user action via existing DELETE.
- **Test fixtures:** Tasks 1 & 3 say to mirror the existing test files' fixture style
  (`repo`/`make_task` in the repo test; `client._transport.app.state` in the routes test);
  adapt names to what those files actually define.
