---
title: Phase 1 — Foundation
date: 2026-05-22
status: approved
project: download-manager
phase: 1 of 8
references:
  - SYSTEM_DESIGN.md
  - SKILL.md
---

# Phase 1 — Foundation

## 1. Goal

Establish a tested, framework-free core that every later phase builds on.

**Definition of done (binary):**
- `uv sync` installs cleanly on Python 3.14
- `uv run ruff check` is green
- `uv run mypy --strict src/dm_api/domain` is green
- `uv run pytest` runs and all tests pass with ≥95% coverage on `src/dm_api/domain/`
- `uv run alembic upgrade head` on a fresh SQLite file creates all five tables
- `git log` shows the foundation commit

No HTTP server, no UI, no actual download logic. Phase 1 ships the testable core only.

## 2. Scope

### In scope
- Monorepo skeleton with `apps/api/` populated, `apps/desktop/` and `apps/browser-extension/` as `.gitkeep` placeholders
- Domain layer: entities, value objects/enums, four policies (IDM-style defaults), domain events — all stdlib only
- SQLite schema for all five tables in one Alembic migration
- Alembic configuration that resolves DB path from `DM_DATA_DIR` env var
- Test suite covering entities, value objects, policies, dependency-rule enforcement, and migration
- `uv`-managed `pyproject.toml`, `ruff`, `mypy`, `pytest` configuration
- Project-level `.gitignore`, `.python-version`, and root README
- `apps/api/README.md` with quickstart commands

### Out of scope (deferred to later phases)
- FastAPI server, routers, schemas, WebSocket gateway → Phase 2
- Repository ports and implementations → Phase 2
- HTTP segment workers, file merger, metadata probe → Phases 2–4
- Event bus implementation (events are defined as dataclasses but never dispatched in Phase 1)
- Electron, React renderer, browser extension
- CI workflows → Phase 8

## 3. Repository Layout

```
download-manager/
├── .gitignore
├── .python-version                       ("3.14")
├── README.md                             (project overview, points to SYSTEM_DESIGN.md)
├── SKILL.md                              (existing)
├── SYSTEM_DESIGN.md                      (existing)
├── apps/
│   ├── api/
│   │   ├── pyproject.toml                (PEP 621, uv-managed)
│   │   ├── uv.lock                       (committed)
│   │   ├── alembic.ini
│   │   ├── README.md
│   │   ├── src/
│   │   │   └── dm_api/
│   │   │       ├── __init__.py
│   │   │       ├── domain/
│   │   │       │   ├── __init__.py
│   │   │       │   ├── entities/
│   │   │       │   │   ├── __init__.py
│   │   │       │   │   ├── download_task.py
│   │   │       │   │   ├── download_segment.py
│   │   │       │   │   └── download_queue.py
│   │   │       │   ├── value_objects/
│   │   │       │   │   ├── __init__.py
│   │   │       │   │   ├── download_status.py
│   │   │       │   │   ├── segment_status.py
│   │   │       │   │   └── queue_status.py
│   │   │       │   ├── policies/
│   │   │       │   │   ├── __init__.py
│   │   │       │   │   ├── segmentation_policy.py
│   │   │       │   │   ├── retry_policy.py
│   │   │       │   │   ├── checksum_policy.py
│   │   │       │   │   └── speed_limit_policy.py
│   │   │       │   └── events/
│   │   │       │       ├── __init__.py
│   │   │       │       └── domain_events.py
│   │   │       └── infrastructure/
│   │   │           └── persistence/
│   │   │               └── migrations/
│   │   │                   ├── env.py
│   │   │                   ├── script.py.mako
│   │   │                   └── versions/
│   │   │                       └── 0001_initial.py
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── conftest.py
│   │       ├── unit/
│   │       │   ├── domain/
│   │       │   │   ├── test_entities.py
│   │       │   │   └── test_value_objects.py
│   │       │   ├── policies/
│   │       │   │   ├── test_segmentation_policy.py
│   │       │   │   ├── test_retry_policy.py
│   │       │   │   ├── test_checksum_policy.py
│   │       │   │   └── test_speed_limit_policy.py
│   │       │   └── test_dependency_rule.py
│   │       └── integration/
│   │           └── test_initial_migration.py
│   ├── desktop/
│   │   └── .gitkeep
│   └── browser-extension/
│       └── .gitkeep
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-22-phase-1-foundation-design.md
```

## 4. Toolchain & Configuration

| Tool | Version | Configuration location |
|---|---|---|
| Python | 3.14 (pinned via `.python-version`) | root |
| `uv` | latest installed (0.11+) | `apps/api/pyproject.toml`, `apps/api/uv.lock` |
| `ruff` | latest stable | `[tool.ruff]` in `pyproject.toml` |
| `mypy` | latest stable | `[tool.mypy]` in `pyproject.toml` (strict for `src/dm_api/domain`, default elsewhere) |
| `pytest` + `pytest-cov` | latest stable | `[tool.pytest.ini_options]` in `pyproject.toml` |
| `alembic` | latest stable | `apps/api/alembic.ini` + `migrations/env.py` |
| `sqlalchemy` | latest stable (used only for Alembic metadata + migrations, not by domain) | `pyproject.toml` |

### Dependency layout
- **Runtime dependencies:** `alembic`, `sqlalchemy` (Alembic transitively requires it; not imported by domain layer)
- **Dev dependencies:** `ruff`, `mypy`, `pytest`, `pytest-cov`

No `aiosqlite`, no `httpx`, no `fastapi` in Phase 1 — they arrive when their phase needs them.

## 5. Domain Layer Specification

All domain code is **pure Python stdlib**. The dependency-rule test enforces this.

### 5.1 Entities

`@dataclass(slots=True)` — mutable, since state transitions occur. UUIDs from `uuid.UUID`, timestamps from `datetime.datetime` (timezone-aware UTC).

- **`DownloadTask`** — fields per SYSTEM_DESIGN.md §4.1
- **`DownloadSegment`** — uses `segment_index: int` (matches DB schema)
- **`DownloadQueue`**

### 5.2 Value Objects (Enums)

`StrEnum` (Python 3.11+). String values match the DB schema exactly:

```python
class DownloadStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    MERGING = "merging"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
```

Same pattern for `SegmentStatus` and `QueueStatus`.

### 5.3 Policies (IDM-style defaults)

All policies are pure functions or pure data — no I/O, no time, no randomness (RetryPolicy uses caller-supplied retry count, not wall-clock).

| Policy | Signature | Behavior |
|---|---|---|
| `SegmentationPolicy.plan(size_bytes: int \| None, accepts_ranges: bool, max_segments: int = 16) -> int` | Returns segment count. `< 5 MB → 1`, `5–50 MB → 4`, `50–500 MB → 8`, `> 500 MB → 16`. If `accepts_ranges` is False or `size_bytes` is None: returns 1. Capped at `max_segments`. |
| `RetryPolicy.next_delay_seconds(retry_count: int) -> int \| None` | Returns `2 ** retry_count` for `retry_count ∈ [0, 4]` (so 1, 2, 4, 8, 16). Returns `None` for `retry_count ≥ 5` to signal "give up". |
| `ChecksumPolicy.from_headers(headers: Mapping[str, str]) -> tuple[str, str] \| None` | Inspects `Content-MD5` and `Digest` headers (RFC 3230). Returns `(algorithm, expected_hex_or_base64)` if a supported algorithm is present and parseable. Supports `md5` and `sha-256` only — any other `Digest` algorithm value returns `None`. Header lookup is case-insensitive. |
| `SpeedLimitPolicy.bucket_capacity(rate_bps: int) -> int` | Returns `2 * rate_bps` (burst headroom). Refill rate = `rate_bps` per second. Phase 1 ships this as a pure calculation; actual rate-limiting loop comes in a later phase. |

### 5.4 Domain Events

All `@dataclass(frozen=True)`. The 11 events from SYSTEM_DESIGN.md §4.4:

`DownloadCreated`, `DownloadStarted`, `DownloadPaused`, `DownloadResumed`, `DownloadCompleted`, `DownloadFailed`, `DownloadCancelled`, `SegmentFailed`, `SegmentCompleted`, `MergeStarted`, `MergeCompleted`.

No event bus implementation in Phase 1 — only the dataclass definitions, so later phases can import and dispatch them.

## 6. Database Schema & Migration

### 6.1 Single initial migration `0001_initial.py`

Creates all five tables per SYSTEM_DESIGN.md §8:
- `downloads`
- `segments` (with `ON DELETE CASCADE` on `download_id`)
- `queues` (with `UNIQUE` constraint on `name`)
- `queue_items`
- `settings`

Plus the `alembic_version` table, managed by Alembic itself.

### 6.2 Alembic configuration

- `script_location = src/dm_api/infrastructure/persistence/migrations`
- `env.py` resolves the database URL in this order: `DM_DATABASE_URL` env var (full SQLAlchemy URL, used by tests) → `DM_DATA_DIR` env var → platform-specific data directory (Linux: `~/.local/share/download-manager`, macOS: `~/Library/Application Support/DownloadManager`, Windows: `%APPDATA%\DownloadManager`)
- Default online mode URL: `sqlite:///{resolved_data_dir}/app.db`
- Offline mode emits SQL to stdout (for review)
- `env.py` creates the data directory if it does not exist

### 6.3 Idempotency

Running `alembic upgrade head` twice in a row must be a no-op (Alembic handles this natively via `alembic_version`).

## 7. Testing Strategy

### 7.1 Test inventory

| File | Coverage |
|---|---|
| `tests/unit/domain/test_entities.py` | Entity construction, field defaults, equality semantics, mutability of mutable fields |
| `tests/unit/domain/test_value_objects.py` | Enum string values match exactly: parametrized table compares each enum member's value to a hardcoded expected string |
| `tests/unit/policies/test_segmentation_policy.py` | Each size bucket (parametrized), no-range fallback, None size fallback, max_segments cap, edge cases at bucket boundaries |
| `tests/unit/policies/test_retry_policy.py` | Sequence `[1, 2, 4, 8, 16]` then `None` at retry 5+ |
| `tests/unit/policies/test_checksum_policy.py` | `Content-MD5: <base64>` parsing, `Digest: sha-256=<base64>` parsing, missing headers, malformed headers |
| `tests/unit/policies/test_speed_limit_policy.py` | Bucket capacity = 2× rate, zero rate handling |
| `tests/unit/test_dependency_rule.py` | Static AST scan of every `.py` file under `src/dm_api/domain/`. Fails if any `import X` or `from X import …` resolves to a top-level module in the deny list (`fastapi`, `httpx`, `aiosqlite`, `sqlalchemy`, `alembic`, `requests`, `pydantic`) or to any module under `dm_api.infrastructure`, `dm_api.application`, or `dm_api.presentation`. Matching is on the dotted module path, not substrings. |
| `tests/integration/test_initial_migration.py` | Uses a temporary file SQLite DB (via `tmp_path` fixture), sets `DM_DATABASE_URL` to point at it, runs `command.upgrade(alembic_cfg, "head")` programmatically, then asserts via `sqlalchemy.inspect()`: all five tables exist (`downloads`, `segments`, `queues`, `queue_items`, `settings`); `segments.download_id` has a foreign key to `downloads.id` with `ON DELETE CASCADE`; running upgrade a second time is a no-op. |

### 7.2 Coverage threshold

`pytest --cov=src/dm_api/domain --cov-fail-under=95` in CI/local. Phase 1 should easily hit this since the domain has no branching I/O.

### 7.3 Test data conventions

- `conftest.py` provides a `make_task()` factory with sensible defaults so test bodies stay focused
- No external fixtures (no testcontainers, no real network)

## 8. README Content

### 8.1 Root `README.md`
- One-paragraph project description
- Links to `SYSTEM_DESIGN.md`, `SKILL.md`, and current phase spec
- "Status: Phase 1 — Foundation"

### 8.2 `apps/api/README.md`
Quickstart only:
```bash
cd apps/api
uv sync
uv run ruff check
uv run mypy --strict src/dm_api/domain
uv run pytest
uv run alembic upgrade head
```

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Python 3.14 is very new (Oct 2025); some libraries may not have wheels | `uv` will fall back to source builds. If `sqlalchemy` or `alembic` fail, fall back to Python 3.12 — `.python-version` is the only change needed. |
| `StrEnum` was added in 3.11, behaves slightly differently than `Enum` for string comparisons | Tests assert exact string-equality with DB values; this catches any drift. |
| Dependency-rule test is a static scan and can be fooled by dynamic imports | Acceptable for Phase 1 — domain code is small and obvious; the test catches the common cases. |
| Choosing to commit `uv.lock` vs not | Committed. Reproducible builds matter more than diff noise for a project this small. |

## 10. Acceptance Checklist

- [ ] `apps/api/` scaffolded; `uv sync` succeeds on Python 3.14
- [ ] All entity, value-object, policy, and event modules exist and are importable
- [ ] `uv run ruff check` exits 0
- [ ] `uv run mypy --strict src/dm_api/domain` exits 0
- [ ] `uv run pytest` exits 0 with ≥95% coverage on `src/dm_api/domain/`
- [ ] `uv run alembic upgrade head` against a fresh SQLite file creates all 5 tables
- [ ] Dependency-rule test catches a synthetic violation (verify by temporarily adding `import httpx` to a domain file — test should fail, then revert)
- [ ] `git log` shows a single foundation commit on `main`
- [ ] `apps/api/README.md` quickstart works verbatim on a fresh clone

## 11. Next Phase Hook

Phase 2 picks up here by adding:
- `application/ports/download_repository.py` (port interface)
- `infrastructure/persistence/sqlite_download_repository.py` (aiosqlite implementation)
- First use case `AddDownloadUseCase`
- FastAPI `apps/api/src/dm_api/presentation/routers/downloads.py` with a single `POST /api/downloads` endpoint
- Minimal Electron window that pings `/api/health` and shows "connected"

Phase 1's domain layer is consumed unchanged by Phase 2 — no domain edits expected.
