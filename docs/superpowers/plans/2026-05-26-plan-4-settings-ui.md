# Plan 4 — Settings UI + REST Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user a real Settings screen where they can change the download directory, max parallel downloads, default quality, theme, and a few other preferences. Persist via the existing `settings` SQLite table. Wire the values into actual app behavior (the worker honors `max_parallel`, the API uses `download_dir`, etc.).

**Architecture:** A new `SqliteSettingsRepository` reads/writes key-value pairs in the existing `settings` table. A new `/api/settings` REST endpoint exposes a typed schema (read all settings as one JSON object, update one or more at a time). The React UI gains a Settings route with a focused form. The download runner reads `max_parallel` from settings at runtime; the worker reads `download_dir`.

**Tech Stack:** Continues with FastAPI + SQLAlchemy + Pydantic on the backend; React + TypeScript + Tailwind v4 on the frontend; existing Tauri shell unchanged.

**Spec:** `docs/superpowers/specs/2026-05-26-desktop-app-packaging-design.md` — "Settings persistence" bullet under apps/api component, plus Settings screen line items under apps/desktop UI polish list.

**Out of scope (deferred to Plan 5):** auto-updater UI, cross-platform CI, Sentry crash reporting, settings export/import, settings schema versioning.

---

## File Structure

**New files (6):**

- `apps/api/src/dm_api/application/ports/settings_repository.py` — `SettingsRepository` abstract base (read all, update one).
- `apps/api/src/dm_api/infrastructure/persistence/sqlite_settings_repository.py` — concrete SQLite implementation.
- `apps/api/src/dm_api/presentation/routers/settings.py` — `/api/settings` GET + PUT.
- `apps/api/src/dm_api/presentation/schemas/settings_dto.py` — `SettingsDTO` Pydantic model with typed fields.
- `apps/api/tests/unit/infrastructure/test_sqlite_settings_repository.py`
- `apps/desktop/src/screens/SettingsScreen.tsx`

**Modified files (5):**

- `apps/api/src/dm_api/presentation/app.py` — register the new router and inject the repository into app state.
- `apps/api/src/dm_api/application/services/download_runner.py` — read `max_parallel` from settings at startup.
- `apps/api/src/dm_api/infrastructure/media/ytdlp_worker.py` — read `download_dir` from settings to override the task's default `save_path` when none is set.
- `apps/desktop/src/App.tsx` — add the Settings route + nav.
- `apps/desktop/src/hooks/useSettings.ts` — NEW, but listed here since it's tied to the App.tsx integration.

---

## Schema

The `settings` table already exists with shape `(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. No migration needed.

### Canonical keys (this plan's source of truth)

| key | type | default | purpose |
|---|---|---|---|
| `download_dir` | string (absolute path) | `~/Downloads/DownloadMgr` | Where new downloads land when the task has no explicit save_path. |
| `max_parallel` | int 1–10 | `3` | How many downloads run at once. |
| `default_quality` | enum `best`/`1080p`/`720p`/`480p`/`audio` | `best` | Pre-selected in AddDownloadDialog. |
| `theme` | enum `light`/`dark`/`system` | `system` | UI theme. (Mirror of the existing localStorage value; backend copy enables sync.) |
| `language` | string (BCP-47) | `en` | Reserved — no i18n yet. |
| `auto_start_downloads` | bool | `true` | If false, new downloads land in `paused` instead of starting immediately. |

Values are stored as JSON-encoded strings in the `value` column to round-trip int / bool / string cleanly. `SettingsRepository.get_all()` returns a `dict[str, Any]` with the values decoded.

---

## Task 1: SettingsRepository abstraction + SQLite implementation

**Files:**
- Create: `apps/api/src/dm_api/application/ports/settings_repository.py`
- Create: `apps/api/src/dm_api/infrastructure/persistence/sqlite_settings_repository.py`
- Create: `apps/api/tests/unit/infrastructure/test_sqlite_settings_repository.py`

### Step 1.1: Write the abstract port

`apps/api/src/dm_api/application/ports/settings_repository.py`:

```python
"""Settings persistence — read/write a key→value store of user preferences.

The repository deals in JSON-decoded Python values: an int comes out as an
``int``, a bool as a ``bool``, etc. JSON-encoding is the repository's concern,
not the caller's.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class SettingsRepository(ABC):
    @abstractmethod
    async def get_all(self) -> dict[str, Any]:
        """Return every stored key with its decoded value. Missing keys are
        absent from the dict — callers apply defaults."""

    @abstractmethod
    async def set_many(self, values: dict[str, Any]) -> None:
        """Upsert each key. Values are JSON-encoded internally."""
```

### Step 1.2: Write the failing tests

`apps/api/tests/unit/infrastructure/test_sqlite_settings_repository.py`:

```python
"""Tests for SqliteSettingsRepository."""
from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from dm_api.infrastructure.persistence.sqlite_settings_repository import (
    SqliteSettingsRepository,
)
from dm_api.infrastructure.persistence.models import metadata  # the SQLAlchemy MetaData


@pytest.fixture
async def repo(tmp_path: Path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    yield SqliteSettingsRepository(engine)
    await engine.dispose()


async def test_get_all_returns_empty_dict_for_new_db(repo: SqliteSettingsRepository) -> None:
    assert await repo.get_all() == {}


async def test_set_then_get_roundtrips_ints_bools_strings(
    repo: SqliteSettingsRepository,
) -> None:
    await repo.set_many({"max_parallel": 5, "theme": "dark", "auto_start_downloads": True})
    values = await repo.get_all()
    assert values == {"max_parallel": 5, "theme": "dark", "auto_start_downloads": True}


async def test_set_many_upserts_existing_keys(repo: SqliteSettingsRepository) -> None:
    await repo.set_many({"theme": "dark"})
    await repo.set_many({"theme": "light"})
    assert (await repo.get_all())["theme"] == "light"


async def test_set_many_with_empty_dict_is_a_noop(repo: SqliteSettingsRepository) -> None:
    await repo.set_many({})
    assert await repo.get_all() == {}
```

Run them — all should fail because the file we test doesn't exist yet:
```bash
cd /home/robotics1025/Documents/project/apps/api
uv run pytest tests/unit/infrastructure/test_sqlite_settings_repository.py -v
```

### Step 1.3: Implement the repository

`apps/api/src/dm_api/infrastructure/persistence/sqlite_settings_repository.py`:

```python
"""SQLite implementation of SettingsRepository.

Persists to the existing ``settings`` table (key TEXT PRIMARY KEY, value TEXT
NOT NULL). Values are stored JSON-encoded so any JSON-compatible Python value
round-trips cleanly.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from dm_api.application.ports.settings_repository import SettingsRepository
from dm_api.infrastructure.persistence.models import settings_table


class SqliteSettingsRepository(SettingsRepository):
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def get_all(self) -> dict[str, Any]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(settings_table))).all()
        return {row.key: json.loads(row.value) for row in rows}

    async def set_many(self, values: dict[str, Any]) -> None:
        if not values:
            return
        rows = [{"key": k, "value": json.dumps(v)} for k, v in values.items()]
        async with self._engine.begin() as conn:
            stmt = insert(settings_table).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["key"],
                set_={"value": stmt.excluded.value},
            )
            await conn.execute(stmt)
```

**Important:** if `apps/api/src/dm_api/infrastructure/persistence/models.py` does not already define a `settings_table = Table("settings", metadata, Column("key", String, primary_key=True), Column("value", String, nullable=False))`, add it. Read the file first to check.

### Step 1.4: Run the tests

```bash
cd /home/robotics1025/Documents/project/apps/api
uv run pytest tests/unit/infrastructure/test_sqlite_settings_repository.py -v
```
Expected: all 4 tests pass.

### Step 1.5: Commit

```bash
cd /home/robotics1025/Documents/project
git add apps/api/src/dm_api/application/ports/settings_repository.py \
        apps/api/src/dm_api/infrastructure/persistence/sqlite_settings_repository.py \
        apps/api/tests/unit/infrastructure/test_sqlite_settings_repository.py \
        apps/api/src/dm_api/infrastructure/persistence/models.py
git commit -m "feat(api): SqliteSettingsRepository for key-value preferences"
```

---

## Task 2: `/api/settings` REST endpoint

**Files:**
- Create: `apps/api/src/dm_api/presentation/routers/settings.py`
- Create: `apps/api/src/dm_api/presentation/schemas/settings_dto.py`
- Modify: `apps/api/src/dm_api/presentation/app.py` (wire the router + inject repo)

### Step 2.1: Define the DTO

`apps/api/src/dm_api/presentation/schemas/settings_dto.py`:

```python
"""Settings DTO — the on-the-wire shape of /api/settings.

We use a typed Pydantic model rather than a free dict so the frontend gets a
schema, missing keys auto-fill with documented defaults, and validation
catches obvious bad values (max_parallel out of range, etc).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Theme = Literal["light", "dark", "system"]
Quality = Literal["best", "1080p", "720p", "480p", "audio"]


class SettingsDTO(BaseModel):
    download_dir: str = Field(default="")  # empty means "use platform default"
    max_parallel: int = Field(default=3, ge=1, le=10)
    default_quality: Quality = "best"
    theme: Theme = "system"
    language: str = "en"
    auto_start_downloads: bool = True

    model_config = ConfigDict(extra="forbid")


class SettingsPatchDTO(BaseModel):
    """Partial update — every field is optional. Only present fields are written."""

    download_dir: str | None = None
    max_parallel: int | None = Field(default=None, ge=1, le=10)
    default_quality: Quality | None = None
    theme: Theme | None = None
    language: str | None = None
    auto_start_downloads: bool | None = None

    model_config = ConfigDict(extra="forbid")

    def to_overrides(self) -> dict[str, object]:
        """Return only the explicitly-set fields, for writing to the repo."""
        return {k: v for k, v in self.model_dump().items() if v is not None}
```

### Step 2.2: Implement the router

`apps/api/src/dm_api/presentation/routers/settings.py`:

```python
"""Settings router — GET reads merged-with-defaults, PUT applies a partial patch."""
from __future__ import annotations

from fastapi import APIRouter, Request

from dm_api.application.ports.settings_repository import SettingsRepository
from dm_api.presentation.schemas.settings_dto import SettingsDTO, SettingsPatchDTO

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _repo(request: Request) -> SettingsRepository:
    return request.app.state.settings_repo


@router.get("", response_model=SettingsDTO)
async def get_settings(request: Request) -> SettingsDTO:
    """Return the current settings, merged with defaults for missing keys."""
    stored = await _repo(request).get_all()
    return SettingsDTO(**stored)


@router.put("", response_model=SettingsDTO)
async def update_settings(request: Request, body: SettingsPatchDTO) -> SettingsDTO:
    """Apply a partial patch and return the updated settings."""
    overrides = body.to_overrides()
    if overrides:
        await _repo(request).set_many(overrides)
    stored = await _repo(request).get_all()
    return SettingsDTO(**stored)
```

### Step 2.3: Wire into `app.py`

In `apps/api/src/dm_api/presentation/app.py`:

1. Add the import:
```python
from dm_api.infrastructure.persistence.sqlite_settings_repository import SqliteSettingsRepository
from dm_api.presentation.routers import settings as settings_router
```

2. In the `lifespan` (or wherever other repos are instantiated), build the repo:
```python
app.state.settings_repo = SqliteSettingsRepository(engine)
```
(`engine` is the existing `AsyncEngine` already in scope.)

3. In `create_app()`, after `include_router` for other routers:
```python
app.include_router(settings_router.router)
```

### Step 2.4: Smoke-test against a running API

```bash
cd /home/robotics1025/Documents/project/apps/api
pkill -f "dm_api.presentation.main" 2>/dev/null; sleep 1
DM_DATA_DIR=/tmp/dm_settings_test nohup uv run python -m dm_api.presentation.main --port 0 > /tmp/dm_settings_stdout.txt 2>&1 &
sleep 5
PORT=$(grep "^DM_PORT " /tmp/dm_settings_stdout.txt | awk '{print $2}')
echo "API on port $PORT"
echo "=== GET defaults ==="
curl -s http://127.0.0.1:$PORT/api/settings | python3 -m json.tool
echo "=== PUT max_parallel=5 theme=dark ==="
curl -s -X PUT http://127.0.0.1:$PORT/api/settings \
  -H "Content-Type: application/json" \
  -d '{"max_parallel":5,"theme":"dark"}' | python3 -m json.tool
echo "=== GET again — should reflect changes ==="
curl -s http://127.0.0.1:$PORT/api/settings | python3 -m json.tool
pkill -f "dm_api.presentation.main" 2>/dev/null
```

Expected:
- First GET returns all defaults.
- PUT returns the merged result with `max_parallel: 5` and `theme: "dark"`.
- Second GET reflects the same — proves persistence to disk.

### Step 2.5: Commit

```bash
cd /home/robotics1025/Documents/project
git add apps/api/src/dm_api/presentation/routers/settings.py \
        apps/api/src/dm_api/presentation/schemas/settings_dto.py \
        apps/api/src/dm_api/presentation/app.py
git commit -m "feat(api): /api/settings GET + PUT with typed DTO"
```

---

## Task 3: useSettings hook + Settings screen scaffold

**Files:**
- Create: `apps/desktop/src/hooks/useSettings.ts`
- Create: `apps/desktop/src/screens/SettingsScreen.tsx`
- Modify: `apps/desktop/src/App.tsx` (add route + nav)

### Step 3.1: Hook

`apps/desktop/src/hooks/useSettings.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "../api-port";

export type Theme = "light" | "dark" | "system";
export type Quality = "best" | "1080p" | "720p" | "480p" | "audio";

export type Settings = {
  download_dir: string;
  max_parallel: number;
  default_quality: Quality;
  theme: Theme;
  language: string;
  auto_start_downloads: boolean;
};

export type SettingsPatch = Partial<Settings>;

type State = {
  data: Settings | null;
  loading: boolean;
  error: Error | null;
};

export function useSettings() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const fetchOnce = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`${getApiBase()}/api/settings`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as Settings;
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err as Error });
    }
  }, []);

  useEffect(() => { void fetchOnce(); }, [fetchOnce]);

  const update = useCallback(
    async (patch: SettingsPatch): Promise<Settings | null> => {
      try {
        const r = await fetch(`${getApiBase()}/api/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Settings;
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        setState((s) => ({ ...s, error: err as Error }));
        return null;
      }
    },
    [],
  );

  return { ...state, update, refetch: fetchOnce };
}
```

### Step 3.2: Screen scaffold

Use the `frontend-design` skill via the Skill tool with this brief, then drop the result into `apps/desktop/src/screens/SettingsScreen.tsx`:

```
Brief: Design a Settings screen for DownloadMgr (Tauri + React + Tailwind v4 +
lucide-react). Visual language: dark-first pro-tool, inspired by Linear /
Raycast / Figma. Use existing tokens from apps/desktop/src/design/tokens.css
(--dm-* CSS vars) and tokens.ts.

Layout:
- Full-page screen (no modal). Top header: title "Settings" (text-xl,
  weight-semibold, fg-primary), subtitle "Configure how DownloadMgr behaves"
  (text-sm, fg-tertiary). 24px margin below header.
- Content: centered column, max-width 720px. Sections separated by 32px
  vertical gap, each section is its own card (bg-elevated, border subtle,
  radius-lg, padding 24px).

Sections (use lucide icons in section headers — 18px, fg-secondary, gap 12px
before label):
  1. Downloads (FolderDown icon)
     - download_dir: a row with label "Download directory" (text-sm fg-secondary
       on left), value (path or "(default)" if empty) in fg-primary on right,
       and a "Browse" button that opens a native folder picker.
     - max_parallel: row with label "Concurrent downloads" and a number stepper
       (1–10) on the right with current value.
     - auto_start_downloads: toggle switch row "Start downloads automatically".

  2. Quality (Video icon)
     - default_quality: row with segmented control "Best | 1080p | 720p |
       480p | Audio".

  3. Appearance (Palette icon)
     - theme: same three-state segmented control already used in TopBar
       (Light / Auto / Dark). The settings screen mirror writes through both
       the API and the existing useTheme hook so changes propagate.
     - language: dropdown — for v1 only "English" is offered; keep the
       control visible but disabled with "More languages coming soon".

Below all sections: a sticky save bar (only visible when there are unsaved
changes) at the bottom-center, ~480px wide, bg-elevated, border subtle,
radius-full, padding 8px 16px, shadow. Contents:
  - left: "Unsaved changes" (text-sm fg-secondary)
  - right: Cancel button (ghost) + Save button (primary accent).

When loading: render 3 skeleton cards (use the existing SkeletonRow vibe but
for cards).
When error: use EmptyState with AlertTriangle icon + Retry CTA.

Each input uses the existing color tokens. Stepper +/- buttons are 32×32
icon buttons (bg-recessed, fg-secondary, hover bg-hover, radius-md). Toggle
switch is 36×20 (track) with 14×14 thumb that slides, off=bg-recessed
on=accent-primary, motion-fast.

Deliver the full TypeScript + React source as one file ready to drop into
apps/desktop/src/screens/SettingsScreen.tsx. The component uses
useSettings() and useTheme() hooks (already defined). Local component state
tracks "draft" values; save commits via useSettings.update.
```

### Step 3.3: Wire into routing/navigation

In `apps/desktop/src/App.tsx`:

1. Import the screen:
```typescript
import { SettingsScreen } from "./screens/SettingsScreen";
```

2. Add a state to track the current top-level view (downloads vs settings). If the existing sidebar already has a "Settings" entry, hook its click handler to set the view:

```typescript
const [view, setView] = useState<"downloads" | "settings">("downloads");
```

3. In the main content area:
```typescript
{view === "settings" ? <SettingsScreen onClose={() => setView("downloads")} /> : (
  // existing downloads list
)}
```

4. In the sidebar's "Settings" handler:
```typescript
onClick={() => setView("settings")}
```

### Step 3.4: Verify

```bash
cd /home/robotics1025/Documents/project/apps/desktop
npx tsc --noEmit 2>&1 | tail -5
nohup npm run dev > /tmp/vite.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f vite 2>/dev/null
```

Click "Settings" in the sidebar → the Settings screen renders. Make a change, click Save → confirm via the API:
```bash
curl -s http://127.0.0.1:6543/api/settings | python3 -m json.tool
```

### Step 3.5: Commit

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/hooks/useSettings.ts \
        apps/desktop/src/screens/SettingsScreen.tsx \
        apps/desktop/src/App.tsx
git commit -m "feat(desktop): Settings screen + useSettings hook"
```

---

## Task 4: Wire settings into the app behavior

The Settings UI now writes values, but nothing reads them yet. This task makes:
- `max_parallel` actually control the `DownloadRunner` semaphore.
- `download_dir` actually be the default `save_path` for new tasks.
- `auto_start_downloads = false` causes new downloads to land paused.

**Files:**
- Modify: `apps/api/src/dm_api/application/services/download_runner.py`
- Modify: `apps/api/src/dm_api/application/use_cases/add_download.py`
- Modify: `apps/api/src/dm_api/presentation/app.py` (load settings into runner at startup)

### Step 4.1: Read max_parallel at startup

In `apps/api/src/dm_api/presentation/app.py`, in the lifespan / startup block, after the `SqliteSettingsRepository` is built and before the `DownloadRunner` is created, load the current settings:

```python
settings_at_startup = await app.state.settings_repo.get_all()
max_parallel = int(settings_at_startup.get("max_parallel", 3))
```

Then pass `max_parallel=max_parallel` into `DownloadRunner(...)`.

**Caveat:** changes to `max_parallel` made through the UI only take effect on the NEXT API restart. We don't dynamically resize the semaphore in v1. Document this in a TODO comment.

### Step 4.2: Honour download_dir default

In `apps/api/src/dm_api/application/use_cases/add_download.py`, find where `save_path` is derived. If the request has no explicit `save_path`, look up `settings.download_dir` (read via the repo) and use it. Fall back to platform default if the setting is empty.

```python
if download_request.save_path is None or not download_request.save_path.strip():
    settings = await self._settings_repo.get_all()
    download_dir = settings.get("download_dir", "")
    if download_dir:
        download_request.save_path = download_dir
    # else: fall through to existing platform-default code path.
```

(Inject `settings_repo: SettingsRepository` into the use case's constructor; add it to the dependency-wiring in `app.py`.)

### Step 4.3: Honour auto_start_downloads

Where the use case currently calls `runner.spawn(task)` (or sets `status = DOWNLOADING`), gate it:

```python
settings = await self._settings_repo.get_all()
auto_start = bool(settings.get("auto_start_downloads", True))
if auto_start:
    self._runner.spawn(task)
else:
    task.status = DownloadStatus.PAUSED
    await self._repo.update(task)
```

### Step 4.4: Verify end-to-end

```bash
cd /home/robotics1025/Documents/project/apps/api
pkill -f "dm_api.presentation.main" 2>/dev/null; sleep 1
DM_DATA_DIR=/tmp/dm_settings_e2e nohup uv run python -m dm_api.presentation.main --port 0 > /tmp/dm_e2e.txt 2>&1 &
sleep 5
PORT=$(grep "^DM_PORT " /tmp/dm_e2e.txt | awk '{print $2}')

# Set custom download dir and auto_start_downloads=false
curl -s -X PUT http://127.0.0.1:$PORT/api/settings \
  -H "Content-Type: application/json" \
  -d '{"download_dir":"/tmp/dm_custom_dir","auto_start_downloads":false}'

# Add a download — must land in paused state, not downloading
curl -s -X POST http://127.0.0.1:$PORT/api/downloads \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/test.zip"}' | python3 -m json.tool

# Inspect the task — status should be "paused", save_path should be "/tmp/dm_custom_dir"
curl -s http://127.0.0.1:$PORT/api/downloads | python3 -m json.tool

pkill -f "dm_api.presentation.main" 2>/dev/null
```

Expected: status `paused`, save_path `/tmp/dm_custom_dir`. Proves the setting was honored.

### Step 4.5: Commit

```bash
cd /home/robotics1025/Documents/project
git add apps/api/src/dm_api/application/services/download_runner.py \
        apps/api/src/dm_api/application/use_cases/add_download.py \
        apps/api/src/dm_api/presentation/app.py
git commit -m "feat(api): honor settings.download_dir + max_parallel + auto_start_downloads"
```

---

## Task 5: Rebuild AppImage + smoke test

- [ ] **Step 5.1: Re-stage sidecar**

The API gained a new endpoint and a new internal dependency. Rebuild the PyInstaller bundle:

```bash
cd /home/robotics1025/Documents/project/apps/api
uv run pyinstaller --noconfirm \
  --distpath ../../build/pyinstaller/dist \
  --workpath ../../build/pyinstaller/build \
  ../../build/pyinstaller/dm-api.spec

cd /home/robotics1025/Documents/project
TRIPLE=$(/home/robotics1025/.cargo/bin/rustc -vV | grep "host:" | awk '{print $2}')
cp build/pyinstaller/dist/dm-api apps/shell/binaries/dm-api-$TRIPLE
chmod +x apps/shell/binaries/dm-api-$TRIPLE
```

- [ ] **Step 5.2: Rebuild Tauri AppImage**

```bash
cd /home/robotics1025/Documents/project/apps/shell
/home/robotics1025/.cargo/bin/cargo tauri build 2>&1 | tail -10
ls -la target/release/bundle/appimage/
```

- [ ] **Step 5.3: E2E smoke**

```bash
DISPLAY=:0 ./target/release/bundle/appimage/DownloadMgr_0.1.0_amd64.AppImage &
sleep 8
echo "In the open window:"
echo "  - Click Settings in the sidebar"
echo "  - Change max_parallel to 5, theme to Light, save"
echo "  - Reopen the AppImage — settings persist"
echo "  - Queue a download — it goes to the configured download_dir"
sleep 30
pkill -f DownloadMgr || true
```

- [ ] **Step 5.4: No commit needed for AppImage artifacts** (they're gitignored).

---

## Done

After Task 5, Plan 4 is complete. The Settings screen is live; preferences persist across restarts; the worker honors `download_dir`, the runner honors `max_parallel`, and `auto_start_downloads = false` correctly creates downloads in a paused state.

Plan 5 covers cross-platform CI (Windows + macOS in GitHub Actions matrix), the Tauri auto-updater with signed update manifests, and opt-in Sentry crash reporting. That's the final production-feel step — after Plan 5 you have a signed, auto-updating, crash-monitored desktop app shipped to all three OSes.
