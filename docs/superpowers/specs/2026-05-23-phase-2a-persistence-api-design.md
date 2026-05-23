---
title: Phase 2a — Persistence + API Skeleton
date: 2026-05-23
status: approved
project: download-manager
phase: 2a of 8 (Phase 2 decomposed into 2a/2b/2c/2d)
references:
  - SYSTEM_DESIGN.md
  - SKILL.md
  - docs/superpowers/specs/2026-05-22-phase-1-foundation-design.md
---

# Phase 2a — Persistence + API Skeleton

## 1. Goal

Exercise every Clean Architecture layer end-to-end — HTTP → DTO → use case → port → SQLite — without yet doing any actual downloading. When this phase ships, a user can `curl -X POST http://127.0.0.1:6543/api/downloads -d '{"url":"https://example.com/file.zip"}'`, receive a JSON `DownloadDTO` back, and then fetch the persisted task via `curl http://127.0.0.1:6543/api/downloads/{id}`. The task sits at `status=PENDING` forever — actual download logic arrives in Phase 2b.

**Definition of done (binary):**
- `uv sync` installs the new dependencies cleanly on Python 3.14
- `uv run ruff check` is green
- `uv run mypy --strict src/dm_api/domain src/dm_api/application` is green
- `uv run pytest` exits 0 with ≥95% domain coverage (existing gate) and ≥90% application coverage (new gate)
- Running `uv run python -m dm_api.presentation.main` boots a uvicorn server on 127.0.0.1:6543
- `curl -X POST http://127.0.0.1:6543/api/downloads -d '{"url":"https://example.com/file.zip"}' -H "Content-Type: application/json"` returns 201 with a valid `DownloadDTO`
- Restarting the server preserves downloads (SQLite persistence verified)
- `git log` shows clean, atomic commits

## 2. Scope

### In scope
- Application layer: `DownloadRepository` and `EventBus` ports; `AddDownloadUseCase`, `GetDownloadUseCase`, `ListDownloadsUseCase`
- Infrastructure: `SQLiteDownloadRepository` (aiosqlite), `InMemoryEventBus`
- Presentation: FastAPI app with `POST /api/downloads`, `GET /api/downloads/{id}`, `GET /api/downloads`, `GET /api/health`
- Server lifecycle: `alembic upgrade head` on startup; bind to 127.0.0.1:6543 (configurable via `DM_API_HOST`/`DM_API_PORT` but defaults stay loopback)
- Pydantic v2 DTOs at the presentation boundary; domain stays Pydantic-free
- Dependency-rule AST scan extended to cover `application/`
- Unit tests for use cases (mocked ports); integration tests for the SQLite repo, the event bus, and the API surface
- Updated `apps/api/README.md` quickstart

### Out of scope (deferred to later sub-phases)
- `MetadataProbe` (HEAD-request to learn file size + Range support) → Phase 2b
- `StartDownloadUseCase`, segment workers, file merger → Phase 2b
- Pause/resume/cancel/retry/delete use cases → Phase 2b+
- `ProgressService`, `/ws/progress`, WebSocket events → Phase 2c
- Electron, React renderer, browser extension → Phase 2d / Phase 6
- Queue manager, scheduler → Phase 7
- SSRF protection, allow-list of hosts → not in 2a (the app is local-only)

## 3. Repository Layout

New code added to existing `apps/api/`:

```
apps/api/src/dm_api/
├── application/                            ← NEW LAYER
│   ├── __init__.py
│   ├── ports/
│   │   ├── __init__.py
│   │   ├── download_repository.py          # Protocol
│   │   └── event_bus.py                    # Protocol
│   └── use_cases/
│       ├── __init__.py
│       ├── add_download.py                 # AddDownloadUseCase
│       └── get_download.py                 # GetDownloadUseCase + ListDownloadsUseCase
├── infrastructure/
│   ├── persistence/
│   │   └── sqlite_download_repository.py   ← NEW
│   └── events/                             ← NEW
│       ├── __init__.py
│       └── in_memory_event_bus.py
└── presentation/                           ← NEW LAYER
    ├── __init__.py
    ├── app.py                              # create_app() factory + lifespan
    ├── main.py                             # uvicorn entry point
    ├── routers/
    │   ├── __init__.py
    │   ├── downloads.py
    │   └── health.py
    └── schemas/
        ├── __init__.py
        └── download_dto.py                 # Pydantic v2

apps/api/tests/
├── unit/
│   └── application/                        ← NEW
│       ├── __init__.py
│       ├── test_add_download.py
│       ├── test_get_download.py
│       └── test_dependency_rule.py
└── integration/
    ├── test_sqlite_download_repository.py  ← NEW
    ├── test_in_memory_event_bus.py         ← NEW
    ├── test_api_routes.py                  ← NEW
    └── test_health.py                      ← NEW
```

## 4. Application Layer

All application code is stdlib + `dm_api.domain` only — no framework imports. Enforced by a new dependency-rule test (see §7).

### 4.1 Ports

**`ports/download_repository.py`** — async `Protocol`:

```python
from typing import Protocol
from uuid import UUID

from dm_api.domain.entities.download_task import DownloadTask


class DownloadRepository(Protocol):
    async def save(self, task: DownloadTask) -> None: ...
    async def get_by_id(self, id: UUID) -> DownloadTask | None: ...
    async def list_all(self) -> list[DownloadTask]: ...
```

**`ports/event_bus.py`** — async `Protocol`:

```python
from collections.abc import Awaitable, Callable
from typing import Any, Protocol


class EventBus(Protocol):
    async def publish(self, event: object) -> None: ...

    def subscribe(
        self,
        event_type: type,
        handler: Callable[[Any], Awaitable[None]],
    ) -> None: ...
```

### 4.2 Use Cases

**`use_cases/add_download.py`** — `AddDownloadUseCase`:

Constructor takes `DownloadRepository` and `EventBus`.

`async def execute(*, url: str, save_path: str | None = None, category: str | None = None) -> DownloadTask`:

1. Validate URL scheme — must be `http` or `https`. Raise `InvalidUrlError` otherwise.
2. Extract `file_name` from URL path (last segment, percent-decoded). Reject if it contains `..`, contains a path separator (`/` or `\`), contains null bytes, or resolves to empty after stripping whitespace.
3. Default `save_path` to platform Downloads directory if `None`:
   - Linux / macOS: `~/Downloads`
   - Windows: `%USERPROFILE%\Downloads` (i.e. `Path.home() / "Downloads"`)

   If a `save_path` is provided, it must be an absolute path. After resolving, reject if any path component contains `..` (path traversal). The path itself does not need to be under `$HOME` — users are allowed to download to mounted drives, external storage, etc.
4. Default `category` to `"general"`.
5. Construct `DownloadTask`:
   - `id = uuid4()`
   - `status = DownloadStatus.PENDING`
   - `total_size = None`, `resume_supported = False`, `segment_count = 1`
   - `downloaded_size = 0`, `speed_limit = None`, `checksum = None`, `checksum_algorithm = None`, `error_message = None`
   - `created_at = datetime.now(UTC)`, `started_at = None`, `completed_at = None`
6. `await self._repo.save(task)`
7. `await self._event_bus.publish(DownloadCreated(download_id=task.id))`
8. Return the task.

Custom exception `InvalidUrlError(ValueError)` raised by URL/filename validation.

**`use_cases/get_download.py`** — two use cases in one file:

```python
class GetDownloadUseCase:
    def __init__(self, repo: DownloadRepository) -> None: ...
    async def execute(self, id: UUID) -> DownloadTask | None: ...


class ListDownloadsUseCase:
    def __init__(self, repo: DownloadRepository) -> None: ...
    async def execute(self) -> list[DownloadTask]: ...
```

No filtering, sorting, or pagination in Phase 2a.

## 5. Infrastructure Layer

### 5.1 `SQLiteDownloadRepository`

Async repository using `aiosqlite`. Connection-per-call (simple; pooling deferred to Phase 2b if needed).

Constructor takes the database URL (string starting with `sqlite:///`). Strips the `sqlite:///` prefix to get the file path.

Mapping rules:
- `UUID` ↔ `TEXT` (string form via `str(uuid)` / `UUID(str)`)
- `datetime` ↔ `TEXT` (ISO-8601 via `isoformat()` / `datetime.fromisoformat()`); always UTC
- `DownloadStatus` ↔ `TEXT` (via `.value` / `DownloadStatus(value)`)
- `bool` ↔ `INTEGER` (0/1)
- `None` ↔ `NULL`

Every connection sets `PRAGMA foreign_keys = ON`.

A private `_row_to_task(row)` helper does the inverse mapping.

`list_all()` orders by `created_at DESC` so the newest downloads are first.

### 5.2 `InMemoryEventBus`

Simple async pub/sub:

```python
class InMemoryEventBus:
    def __init__(self) -> None:
        self._handlers: defaultdict[type, list[Callable]] = defaultdict(list)

    def subscribe(self, event_type, handler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event) -> None:
        for handler in self._handlers[type(event)]:
            await handler(event)
```

Handler exceptions propagate (no swallowing in 2a). Order of delivery = order of subscription.

## 6. Presentation Layer

### 6.1 `app.py` — `create_app()` factory

Uses FastAPI's `lifespan` context manager:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db_path = _resolve_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _run_migrations(db_path)
    app.state.repo = SQLiteDownloadRepository(f"sqlite:///{db_path}")
    app.state.event_bus = InMemoryEventBus()
    app.state.add_download = AddDownloadUseCase(app.state.repo, app.state.event_bus)
    app.state.get_download = GetDownloadUseCase(app.state.repo)
    app.state.list_downloads = ListDownloadsUseCase(app.state.repo)
    yield
```

`_run_migrations(db_path)` invokes `alembic.command.upgrade()` synchronously (Alembic doesn't need an event loop). Runs inside `await asyncio.to_thread(...)` to avoid blocking.

DB path resolution mirrors the existing Alembic `env.py`: `DM_DATABASE_URL` → `DM_DATA_DIR` → platform default.

### 6.2 `main.py` — uvicorn entry point

```python
import os
import uvicorn
from dm_api.presentation.app import create_app

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6543


def main() -> None:
    host = os.environ.get("DM_API_HOST", DEFAULT_HOST)
    port = int(os.environ.get("DM_API_PORT", DEFAULT_PORT))
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError(
            f"DM_API_HOST must be a loopback address; got {host!r}. "
            "This app is local-only by design."
        )
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
```

The host check is defensive — even if someone sets `DM_API_HOST=0.0.0.0`, the server refuses to start.

### 6.3 Routers

**`routers/downloads.py`** — three endpoints:

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/downloads` | `AddDownloadRequest` | 201 `DownloadDTO` | 422 on invalid URL or invalid file_name; 500 on persistence error |
| GET | `/api/downloads/{id}` | — | `DownloadDTO` | Path param is `UUID` — malformed UUID returns 422 (FastAPI default); valid-but-missing UUID returns 404 |
| GET | `/api/downloads` | — | `list[DownloadDTO]` | newest first |

Use cases retrieved via `request.app.state` (FastAPI's idiomatic way for lifespan-managed singletons). No `Depends(...)` complexity in 2a.

`InvalidUrlError` from the use case maps to `HTTPException(422, detail=str(e))` via a registered exception handler in `app.py`.

**`routers/health.py`**:

```
GET /api/health → {"status": "ok", "version": "0.2.0", "active_downloads": <count>}
```

`active_downloads` is the count of tasks with `status in {QUEUED, DOWNLOADING, MERGING}`. In Phase 2a this is always 0 (nothing transitions out of PENDING), but the field exists so consumers can rely on the shape.

### 6.4 Schemas (`schemas/download_dto.py`)

Pydantic v2. Snake_case fields matching the entity.

```python
class AddDownloadRequest(BaseModel):
    url: str = Field(min_length=1)
    save_path: str | None = None
    category: str | None = None
    model_config = ConfigDict(extra="forbid")


class DownloadDTO(BaseModel):
    id: UUID
    url: str
    file_name: str
    save_path: str
    total_size: int | None
    downloaded_size: int
    status: str
    resume_supported: bool
    segment_count: int
    category: str
    speed_limit: int | None
    checksum: str | None
    checksum_algorithm: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def from_entity(cls, task: DownloadTask) -> "DownloadDTO":
        return cls(
            id=task.id,
            url=task.url,
            file_name=task.file_name,
            save_path=task.save_path,
            total_size=task.total_size,
            downloaded_size=task.downloaded_size,
            status=task.status.value,
            resume_supported=task.resume_supported,
            segment_count=task.segment_count,
            category=task.category,
            speed_limit=task.speed_limit,
            checksum=task.checksum,
            checksum_algorithm=task.checksum_algorithm,
            error_message=task.error_message,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
        )
```

## 7. Dependency-Rule Extension

A new file `apps/api/tests/unit/application/test_dependency_rule.py` mirrors the existing domain test but scans `src/dm_api/application/`. Forbidden:

- Top-level: `fastapi`, `httpx`, `requests`, `pydantic`, `sqlalchemy`, `alembic`, `aiosqlite`, `uvicorn`
- Sibling layers: `dm_api.infrastructure`, `dm_api.presentation`
- Allowed: stdlib, `dm_api.domain.*`, `dm_api.application.*`

Same static AST scan pattern as Task 12. Must catch a synthetic violation (e.g., adding `import fastapi` to a use case file).

## 8. Tests

### 8.1 Test inventory

| File | What it proves |
|---|---|
| `tests/unit/application/test_add_download.py` | Happy path; URL scheme rejection; file_name sanitization (`../`, absolute, null bytes); default save_path; default category; event published exactly once with correct ID. |
| `tests/unit/application/test_get_download.py` | Get hit / miss; list returns newest-first ordering. |
| `tests/unit/application/test_dependency_rule.py` | Static AST scan of `application/` — synthetic violation verification. |
| `tests/integration/test_sqlite_download_repository.py` | Round-trip save → get_by_id → list_all over real aiosqlite. Datetime preservation (UTC, microseconds). Enum preservation. FK to a not-yet-existing parent (skipped — segments come in 2b). |
| `tests/integration/test_in_memory_event_bus.py` | Subscribe + publish; multiple handlers fire in order; no subscribers is a no-op; handler exception propagates. |
| `tests/integration/test_api_routes.py` | Using `httpx.AsyncClient(transport=ASGITransport(app=app))` against the FastAPI app. POST → 201 → GET → 200 → list → 200. 404 on bad ID. 422 on bad URL. Restart-survival smoke test (start app, post, shutdown, start app again, GET should return the task). |
| `tests/integration/test_health.py` | GET /api/health returns the expected shape; `active_downloads == 0` in 2a. |

All integration tests marked `@pytest.mark.integration` (existing marker from Phase 1).

### 8.2 Coverage thresholds

Update `pyproject.toml` `addopts` to maintain dual gates:

```
--cov=src/dm_api/domain --cov=src/dm_api/application --cov-fail-under=90
```

Drop the per-package strict 95% gate; the 90% combined floor catches regressions in either layer. (95% on domain alone was a Phase 1 acceptance — at the project level, 90% across the testable layers is sufficient and more sustainable.)

### 8.3 Test fixtures

Extend `tests/conftest.py` with:
- `app_db_url(tmp_path)` — yields an `sqlite:///{tmp_path}/test.db` URL with `DM_DATABASE_URL` set via monkeypatch
- `app(app_db_url, monkeypatch)` — yields a FastAPI app with migrations applied
- `async_client(app)` — yields an `httpx.AsyncClient` with `ASGITransport(app=app)`

## 9. New Dependencies

Added to `apps/api/pyproject.toml`:

**Runtime:**
- `fastapi>=0.110`
- `uvicorn[standard]>=0.30`
- `aiosqlite>=0.20`
- `pydantic>=2.7`

**Dev only:**
- `httpx>=0.27` (test client transport)
- `pytest-asyncio>=0.24`

`pytest-asyncio` configuration in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

## 10. Configuration

Environment variables consumed in Phase 2a:

| Variable | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Server bind address (loopback enforced) |
| `DM_API_PORT` | `6543` | Server port |
| `DM_DATABASE_URL` | derived from `DM_DATA_DIR` or platform default | Full SQLAlchemy URL for the DB |
| `DM_DATA_DIR` | platform default (Phase 1 spec §14.1) | Directory containing `app.db` |

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `alembic.command.upgrade` is sync and blocks the event loop | Wrap in `asyncio.to_thread()` during lifespan startup. Lifespan completes before uvicorn accepts connections, so user latency is unaffected. |
| `aiosqlite` connection-per-call is slow under load | Acceptable for Phase 2a (no concurrency yet). Phase 2b will add a shared connection if needed. |
| Pydantic v1 patterns appear in copy-pasted snippets | Strictly use v2 syntax (`model_config = ConfigDict`, `field_validator`, `model_validator`). Pin `pydantic>=2.7`. |
| Tests for the FastAPI lifespan accidentally run migrations against the user's real DB | Every test fixture sets `DM_DATABASE_URL` to a temp path via `monkeypatch.setenv` **before** instantiating the app. Verified in `app` fixture. |
| File-name sanitization is incomplete | Cover all of: `..`, absolute paths, null bytes, empty after percent-decode. Each gets a parametrized test. |
| Adding `pydantic` to deps could tempt someone to import it in domain/application | Dependency-rule tests forbid it in both layers. |

## 12. Acceptance Checklist

- [ ] All new dependencies install via `uv sync` on Python 3.14
- [ ] `uv run ruff check` exits 0
- [ ] `uv run mypy --strict src/dm_api/domain src/dm_api/application` exits 0
- [ ] `uv run pytest` exits 0; coverage gate (combined domain + application ≥90%) holds
- [ ] `uv run python -m dm_api.presentation.main` boots; `curl http://127.0.0.1:6543/api/health` returns `{"status": "ok", ...}`
- [ ] `POST /api/downloads` with a valid URL returns 201 with a fully-populated `DownloadDTO`
- [ ] `GET /api/downloads/{id}` returns the same task
- [ ] `GET /api/downloads` returns the list, newest first
- [ ] Server refuses to start with `DM_API_HOST=0.0.0.0`
- [ ] Tasks persist across server restarts
- [ ] FTP URL → 422
- [ ] `../etc/passwd` in URL path → 422 (file_name sanitization rejects it)
- [ ] Dependency-rule test for `application/` catches a synthetic `import fastapi`

## 13. Next Phase Hook

Phase 2b picks up here by adding:
- `application/ports/metadata_probe.py` (port interface)
- `infrastructure/http/metadata_probe_impl.py` (httpx implementation)
- `application/use_cases/start_download.py` (StartDownloadUseCase)
- `infrastructure/http/segment_worker.py` (single-segment, sync write to final path)
- `application/services/download_runner.py` (background task that drives workers)
- `POST /api/downloads/{id}/start` endpoint
- A subscriber to `DownloadCreated` events that auto-queues the task

Phase 2a's ports stay stable; Phase 2b only adds new ports and new use cases.
