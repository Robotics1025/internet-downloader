# Phase 2a — Persistence + API Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the application layer (ports + use cases), SQLite-backed persistence (aiosqlite), in-memory event bus, FastAPI server bound to 127.0.0.1:6543, and Pydantic v2 DTOs. Tasks persist across restarts; no actual download logic yet — tasks sit at `status=PENDING`.

**Architecture:** Continues Clean Architecture from Phase 1. New `application/` and `presentation/` layers join the existing `domain/` and `infrastructure/persistence/migrations/`. Domain stays pure stdlib. Application imports domain only. Infrastructure implements ports. Presentation maps DTOs ↔ entities and wires the dependency tree in a FastAPI lifespan.

**Tech Stack:** Python 3.14, `uv`, `fastapi`, `uvicorn`, `aiosqlite`, `pydantic` v2, `httpx` (test client transport only), `pytest-asyncio` (`asyncio_mode = "auto"`), existing `alembic` + `sqlalchemy` from Phase 1.

**Spec:** `docs/superpowers/specs/2026-05-23-phase-2a-persistence-api-design.md`

**Working directory for `uv`/`pytest`/`alembic` commands:** `apps/api/`. All paths in this plan are relative to repo root unless they already start with `apps/api/`.

---

## Task 1: Add dependencies and pytest-asyncio config

**Files:**
- Modify: `apps/api/pyproject.toml`

- [ ] **Step 1: Add runtime dependencies, dev dependencies, asyncio mode, and update coverage scope**

Open `apps/api/pyproject.toml`. Apply these three edits:

**Edit 1 — add to the `[project]` `dependencies` array** (after the existing `"sqlalchemy>=2.0",` line, inside the same list):
```toml
dependencies = [
    "alembic>=1.13",
    "sqlalchemy>=2.0",
    "fastapi>=0.110",
    "uvicorn[standard]>=0.30",
    "aiosqlite>=0.20",
    "pydantic>=2.7",
]
```

**Edit 2 — add to the `[dependency-groups]` `dev` array**:
```toml
[dependency-groups]
dev = [
    "ruff>=0.6",
    "mypy>=1.11",
    "pytest>=8.3",
    "pytest-cov>=5.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
]
```

**Edit 3 — update `[tool.pytest.ini_options]`** to add `asyncio_mode` and extend coverage to include `application/`. Change the `addopts` to also cover `src/dm_api/application`. The new `addopts` value (one line):

```
-ra --strict-markers --cov=src/dm_api/domain --cov=src/dm_api/application --cov-fail-under=90 --cov-report=term-missing -p no:launch_testing -p no:launch_ros -p no:ament_flake8 -p no:ament_xmllint -p no:ament_copyright -p no:ament_pep257 -p no:ament_lint
```

And add `asyncio_mode = "auto"` to the same section. The resulting `[tool.pytest.ini_options]` block should look like:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-ra --strict-markers --cov=src/dm_api/domain --cov=src/dm_api/application --cov-fail-under=90 --cov-report=term-missing -p no:launch_testing -p no:launch_ros -p no:ament_flake8 -p no:ament_xmllint -p no:ament_copyright -p no:ament_pep257 -p no:ament_lint"
markers = [
    "integration: tests that hit the filesystem or database",
]
```

Note: the coverage gate drops from 95% (Phase 1) to 90% (combined domain + application). The reasoning is in the spec §8.2.

- [ ] **Step 2: Install the new dependencies**

Run from `apps/api/`: `uv sync`

Expected: prints something like `Resolved N packages` then `Installed N packages`. The new packages (fastapi, uvicorn, aiosqlite, pydantic, pytest-asyncio, httpx) should appear in the install list.

- [ ] **Step 3: Verify existing tests still pass with new config**

Run from `apps/api/`: `uv run pytest`

Expected: 106 tests still pass; coverage now reports both `src/dm_api/domain` AND `src/dm_api/application` (the latter will show as "no statements" or 0% since nothing exists yet — that's fine because the gate is `--cov-fail-under=90` over the combined total, which the 100%-covered domain easily satisfies).

- [ ] **Step 4: Commit**

```bash
git add apps/api/pyproject.toml apps/api/uv.lock
git commit -m "chore(api): add fastapi/uvicorn/aiosqlite/pydantic deps + pytest-asyncio"
```

---

## Task 2: `DownloadRepository` port

**Files:**
- Create: `apps/api/src/dm_api/application/__init__.py`
- Create: `apps/api/src/dm_api/application/ports/__init__.py`
- Create: `apps/api/src/dm_api/application/ports/download_repository.py`

- [ ] **Step 1: Create the application package directories**

```bash
mkdir -p apps/api/src/dm_api/application/ports
touch apps/api/src/dm_api/application/__init__.py
touch apps/api/src/dm_api/application/ports/__init__.py
```

- [ ] **Step 2: Write the port**

Create `apps/api/src/dm_api/application/ports/download_repository.py`:

```python
"""Port (interface) for persisting DownloadTask entities.

Defined as a typing.Protocol so any concrete implementation in the
infrastructure layer is a structural subtype — no inheritance required.
"""
from typing import Protocol
from uuid import UUID

from dm_api.domain.entities.download_task import DownloadTask


class DownloadRepository(Protocol):
    async def save(self, task: DownloadTask) -> None: ...

    async def get_by_id(self, id: UUID) -> DownloadTask | None: ...

    async def list_all(self) -> list[DownloadTask]: ...
```

- [ ] **Step 3: Verify imports cleanly**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.application.ports.download_repository import DownloadRepository; print(DownloadRepository)"
```
Expected: prints `<class 'dm_api.application.ports.download_repository.DownloadRepository'>`. No errors.

- [ ] **Step 4: Verify ruff + mypy still clean**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/application/
git commit -m "feat(application): add DownloadRepository port"
```

---

## Task 3: `EventBus` port

**Files:**
- Create: `apps/api/src/dm_api/application/ports/event_bus.py`

- [ ] **Step 1: Write the port**

Create `apps/api/src/dm_api/application/ports/event_bus.py`:

```python
"""Port for an async pub/sub event bus.

Use cases publish domain events; infrastructure or other use cases subscribe.
Phase 2a ships an InMemoryEventBus implementation; Phase 2c will introduce
a WebSocket bridge that subscribes to progress events.
"""
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

- [ ] **Step 2: Verify imports**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.application.ports.event_bus import EventBus; print(EventBus)"
```
Expected: prints the class.

- [ ] **Step 3: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/dm_api/application/ports/event_bus.py
git commit -m "feat(application): add EventBus port"
```

---

## Task 4: `AddDownloadUseCase`

**Files:**
- Create: `apps/api/src/dm_api/application/use_cases/__init__.py`
- Create: `apps/api/src/dm_api/application/use_cases/add_download.py`
- Create: `apps/api/tests/unit/application/__init__.py`
- Create: `apps/api/tests/unit/application/test_add_download.py`

Strict TDD: failing test first, then implementation.

- [ ] **Step 1: Create the use_cases package + tests directory**

```bash
mkdir -p apps/api/src/dm_api/application/use_cases apps/api/tests/unit/application
touch apps/api/src/dm_api/application/use_cases/__init__.py
touch apps/api/tests/unit/application/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/tests/unit/application/test_add_download.py`:

```python
"""AddDownloadUseCase tests.

Uses AsyncMock for the DownloadRepository and EventBus ports — Protocol-based
ports work with any object that has the right methods, so we don't need to
build a concrete fake.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from dm_api.application.use_cases.add_download import (
    AddDownloadUseCase,
    InvalidUrlError,
)
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.events.domain_events import DownloadCreated
from dm_api.domain.value_objects.download_status import DownloadStatus


def _make_use_case() -> tuple[AddDownloadUseCase, AsyncMock, AsyncMock]:
    repo = AsyncMock()
    event_bus = AsyncMock()
    return AddDownloadUseCase(repo=repo, event_bus=event_bus), repo, event_bus


async def test_happy_path_persists_and_publishes() -> None:
    use_case, repo, event_bus = _make_use_case()

    task = await use_case.execute(url="https://example.com/file.zip")

    assert isinstance(task, DownloadTask)
    assert task.url == "https://example.com/file.zip"
    assert task.file_name == "file.zip"
    assert task.status == DownloadStatus.PENDING
    assert task.total_size is None
    assert task.resume_supported is False
    assert task.segment_count == 1
    assert task.downloaded_size == 0
    assert task.category == "general"
    assert task.completed_at is None
    repo.save.assert_awaited_once_with(task)
    event_bus.publish.assert_awaited_once()
    published_event = event_bus.publish.await_args.args[0]
    assert isinstance(published_event, DownloadCreated)
    assert published_event.download_id == task.id


async def test_default_save_path_is_platform_downloads() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(url="https://example.com/file.zip")
    expected = str(Path.home() / "Downloads")
    assert task.save_path == expected


async def test_explicit_save_path_is_used() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/file.zip", save_path="/mnt/external/dl"
    )
    assert task.save_path == "/mnt/external/dl"


async def test_custom_category_is_used() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/movie.mp4", category="video"
    )
    assert task.category == "video"


async def test_relative_save_path_rejected() -> None:
    use_case, _, _ = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(
            url="https://example.com/file.zip", save_path="relative/dl"
        )


async def test_save_path_with_dotdot_rejected() -> None:
    use_case, _, _ = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(
            url="https://example.com/file.zip", save_path="/tmp/../etc"
        )


@pytest.mark.parametrize(
    "bad_url",
    [
        "ftp://example.com/file.zip",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://example.com/",            # no file name
        "https://example.com",             # no path
        "https://example.com/dir/",        # trailing slash, no file name
        "https://example.com/%2e%2e/etc",  # url-encoded ".."
        "not a url at all",
    ],
)
async def test_invalid_urls_rejected(bad_url: str) -> None:
    use_case, repo, event_bus = _make_use_case()
    with pytest.raises(InvalidUrlError):
        await use_case.execute(url=bad_url)
    repo.save.assert_not_awaited()
    event_bus.publish.assert_not_awaited()


async def test_url_with_query_string_extracts_clean_filename() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/path/file.zip?token=abc&v=2"
    )
    assert task.file_name == "file.zip"


async def test_url_with_percent_encoded_filename_is_decoded() -> None:
    use_case, _, _ = _make_use_case()
    task = await use_case.execute(
        url="https://example.com/My%20File%20Name.zip"
    )
    assert task.file_name == "My File Name.zip"
```

- [ ] **Step 3: Run failing tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_add_download.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'dm_api.application.use_cases.add_download'`.

- [ ] **Step 4: Implement the use case**

Create `apps/api/src/dm_api/application/use_cases/add_download.py`:

```python
"""AddDownloadUseCase — validates input, constructs a DownloadTask, persists it,
and publishes a DownloadCreated event.

Pure async. Imports only domain + stdlib + sibling application ports.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.application.ports.event_bus import EventBus
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.events.domain_events import DownloadCreated
from dm_api.domain.value_objects.download_status import DownloadStatus


class InvalidUrlError(ValueError):
    """Raised when the input URL or derived file name is unacceptable."""


def _default_save_path() -> str:
    return str(Path.home() / "Downloads")


def _validate_save_path(path: str) -> str:
    p = Path(path)
    if not p.is_absolute():
        raise InvalidUrlError(f"save_path must be absolute: {path!r}")
    if any(part == ".." for part in p.parts):
        raise InvalidUrlError(f"save_path must not contain '..': {path!r}")
    return path


def _derive_file_name(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise InvalidUrlError(f"unsupported URL scheme: {parsed.scheme!r}")
    if not parsed.netloc:
        raise InvalidUrlError(f"URL missing host: {url!r}")
    path_part = parsed.path or ""
    last_segment = path_part.rstrip("/").rsplit("/", 1)[-1]
    decoded = unquote(last_segment).strip()
    if not decoded:
        raise InvalidUrlError(f"URL has no file name in path: {url!r}")
    if "\x00" in decoded:
        raise InvalidUrlError("file name contains null byte")
    if "/" in decoded or "\\" in decoded:
        raise InvalidUrlError(f"file name contains path separator: {decoded!r}")
    if decoded == "." or decoded == "..":
        raise InvalidUrlError(f"file name resolves to traversal: {decoded!r}")
    return decoded


class AddDownloadUseCase:
    def __init__(self, repo: DownloadRepository, event_bus: EventBus) -> None:
        self._repo = repo
        self._event_bus = event_bus

    async def execute(
        self,
        *,
        url: str,
        save_path: str | None = None,
        category: str | None = None,
    ) -> DownloadTask:
        file_name = _derive_file_name(url)
        resolved_save_path = (
            _validate_save_path(save_path) if save_path else _default_save_path()
        )
        task = DownloadTask(
            id=uuid4(),
            url=url,
            file_name=file_name,
            save_path=resolved_save_path,
            total_size=None,
            downloaded_size=0,
            status=DownloadStatus.PENDING,
            resume_supported=False,
            segment_count=1,
            category=category or "general",
            speed_limit=None,
            checksum=None,
            checksum_algorithm=None,
            error_message=None,
            created_at=datetime.now(UTC),
            started_at=None,
            completed_at=None,
        )
        await self._repo.save(task)
        await self._event_bus.publish(DownloadCreated(download_id=task.id))
        return task
```

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_add_download.py -v`
Expected: all PASS.

- [ ] **Step 6: Run ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dm_api/application/use_cases/ apps/api/tests/unit/application/
git commit -m "feat(application): add AddDownloadUseCase with URL/filename validation"
```

---

## Task 5: `GetDownloadUseCase` + `ListDownloadsUseCase`

**Files:**
- Create: `apps/api/src/dm_api/application/use_cases/get_download.py`
- Create: `apps/api/tests/unit/application/test_get_download.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/application/test_get_download.py`:

```python
"""GetDownloadUseCase and ListDownloadsUseCase tests."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from dm_api.application.use_cases.get_download import (
    GetDownloadUseCase,
    ListDownloadsUseCase,
)
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


def _make_task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://example.com/file.zip",
        file_name="file.zip",
        save_path="/tmp",
        total_size=None,
        downloaded_size=0,
        status=DownloadStatus.PENDING,
        resume_supported=False,
        segment_count=1,
        category="general",
        speed_limit=None,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime.now(UTC),
        started_at=None,
        completed_at=None,
    )


async def test_get_download_hit() -> None:
    task = _make_task()
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = GetDownloadUseCase(repo=repo)

    result = await use_case.execute(task.id)

    assert result is task
    repo.get_by_id.assert_awaited_once_with(task.id)


async def test_get_download_miss() -> None:
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = GetDownloadUseCase(repo=repo)

    missing_id = uuid4()
    result = await use_case.execute(missing_id)

    assert result is None
    repo.get_by_id.assert_awaited_once_with(missing_id)


async def test_list_downloads_returns_repo_output() -> None:
    tasks = [_make_task(), _make_task(), _make_task()]
    repo = AsyncMock()
    repo.list_all.return_value = tasks
    use_case = ListDownloadsUseCase(repo=repo)

    result = await use_case.execute()

    assert result == tasks
    repo.list_all.assert_awaited_once_with()


async def test_list_downloads_empty() -> None:
    repo = AsyncMock()
    repo.list_all.return_value = []
    use_case = ListDownloadsUseCase(repo=repo)

    result = await use_case.execute()

    assert result == []
```

- [ ] **Step 2: Run failing tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_get_download.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

Create `apps/api/src/dm_api/application/use_cases/get_download.py`:

```python
"""Query-side use cases: fetch a single download or list all of them.

Both are thin wrappers around the repository port. They exist so the
presentation layer never depends directly on infrastructure.
"""
from __future__ import annotations

from uuid import UUID

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask


class GetDownloadUseCase:
    def __init__(self, repo: DownloadRepository) -> None:
        self._repo = repo

    async def execute(self, id: UUID) -> DownloadTask | None:
        return await self._repo.get_by_id(id)


class ListDownloadsUseCase:
    def __init__(self, repo: DownloadRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[DownloadTask]:
        return await self._repo.list_all()
```

- [ ] **Step 4: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_get_download.py -v`
Expected: 4 PASSED.

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/application/use_cases/get_download.py \
        apps/api/tests/unit/application/test_get_download.py
git commit -m "feat(application): add GetDownloadUseCase and ListDownloadsUseCase"
```

---

## Task 6: Application dependency-rule AST test

**Files:**
- Create: `apps/api/tests/unit/application/test_dependency_rule.py`

- [ ] **Step 1: Write the test**

Create `apps/api/tests/unit/application/test_dependency_rule.py`:

```python
"""Static enforcement of the Clean Architecture dependency rule for the
application layer.

application/ MUST NOT import:
- Web/HTTP libraries (fastapi, httpx, requests, pydantic, uvicorn)
- ORMs / DB drivers (sqlalchemy, alembic, aiosqlite)
- Sibling layers (dm_api.infrastructure, dm_api.presentation)

Allowed: stdlib, dm_api.domain.*, dm_api.application.*
"""
import ast
from pathlib import Path

import pytest

_DENY_TOP_LEVEL = frozenset({
    "fastapi",
    "httpx",
    "requests",
    "pydantic",
    "sqlalchemy",
    "alembic",
    "aiosqlite",
    "uvicorn",
})

_DENY_DM_API_SUBPACKAGES = frozenset({
    "dm_api.infrastructure",
    "dm_api.presentation",
})


def _application_files() -> list[Path]:
    here = Path(__file__).resolve()
    application_root = here.parent.parent.parent.parent / "src" / "dm_api" / "application"
    return sorted(p for p in application_root.rglob("*.py"))


def _module_is_forbidden(module: str) -> bool:
    top = module.split(".")[0]
    if top in _DENY_TOP_LEVEL:
        return True
    return any(module == sub or module.startswith(sub + ".") for sub in _DENY_DM_API_SUBPACKAGES)


def test_application_files_were_discovered() -> None:
    files = _application_files()
    assert files, "no Python files found under src/dm_api/application"


@pytest.mark.parametrize("path", _application_files(), ids=lambda p: str(p))
def test_application_file_imports_are_clean(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))

    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _module_is_forbidden(alias.name):
                    violations.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module and _module_is_forbidden(module):
                violations.append(f"from {module} import ...")

    assert not violations, f"{path} has forbidden imports: {violations}"
```

Note: the path resolution `here.parent.parent.parent.parent / "src" / "dm_api" / "application"` resolves from `tests/unit/application/test_dependency_rule.py`:
- `here` = the test file
- `.parent` = `tests/unit/application/`
- `.parent.parent` = `tests/unit/`
- `.parent.parent.parent` = `tests/`
- `.parent.parent.parent.parent` = `apps/api/`
- + `src/dm_api/application` = the application source root.

- [ ] **Step 2: Run the test — must PASS immediately**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v`
Expected: all PASS (the application code written in T2–T5 uses only stdlib + sibling domain + sibling application modules).

- [ ] **Step 3: Verify synthetic violation is caught**

Edit `apps/api/src/dm_api/application/use_cases/get_download.py` and add a line at the top (after the docstring):

```python
import fastapi  # synthetic violation, will be reverted
```

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v`
Expected: at least one FAIL with `... has forbidden imports: ['import fastapi']`.

- [ ] **Step 4: Revert the synthetic violation**

Remove the `import fastapi` line. Verify by reading the file that it's gone.

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v`
Expected: all PASS again.

Run from `apps/api/`: `git status`
Expected: working tree clean (only the new test file is the addition; `get_download.py` should match HEAD).

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/unit/application/test_dependency_rule.py
git commit -m "test(application): add static AST dependency-rule enforcement"
```

---

## Task 7: `InMemoryEventBus`

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/events/__init__.py`
- Create: `apps/api/src/dm_api/infrastructure/events/in_memory_event_bus.py`
- Create: `apps/api/tests/integration/test_in_memory_event_bus.py`

- [ ] **Step 1: Create the events package directory**

```bash
mkdir -p apps/api/src/dm_api/infrastructure/events
touch apps/api/src/dm_api/infrastructure/events/__init__.py
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/integration/test_in_memory_event_bus.py`:

```python
"""InMemoryEventBus pub/sub behavior."""
from __future__ import annotations

import pytest

from dm_api.infrastructure.events.in_memory_event_bus import InMemoryEventBus


class _EventA:
    pass


class _EventB:
    pass


@pytest.mark.integration
async def test_single_subscriber_receives_event() -> None:
    bus = InMemoryEventBus()
    received: list[object] = []

    async def handler(event: _EventA) -> None:
        received.append(event)

    bus.subscribe(_EventA, handler)
    event = _EventA()
    await bus.publish(event)

    assert received == [event]


@pytest.mark.integration
async def test_multiple_subscribers_fire_in_subscription_order() -> None:
    bus = InMemoryEventBus()
    order: list[str] = []

    async def first(event: _EventA) -> None:
        order.append("first")

    async def second(event: _EventA) -> None:
        order.append("second")

    bus.subscribe(_EventA, first)
    bus.subscribe(_EventA, second)
    await bus.publish(_EventA())

    assert order == ["first", "second"]


@pytest.mark.integration
async def test_no_subscribers_is_a_noop() -> None:
    bus = InMemoryEventBus()
    # Should not raise.
    await bus.publish(_EventA())


@pytest.mark.integration
async def test_subscribers_only_receive_their_event_type() -> None:
    bus = InMemoryEventBus()
    a_received: list[object] = []
    b_received: list[object] = []

    async def a_handler(event: _EventA) -> None:
        a_received.append(event)

    async def b_handler(event: _EventB) -> None:
        b_received.append(event)

    bus.subscribe(_EventA, a_handler)
    bus.subscribe(_EventB, b_handler)

    await bus.publish(_EventA())
    await bus.publish(_EventB())
    await bus.publish(_EventA())

    assert len(a_received) == 2
    assert len(b_received) == 1


@pytest.mark.integration
async def test_handler_exception_propagates() -> None:
    bus = InMemoryEventBus()

    async def broken(event: _EventA) -> None:
        raise RuntimeError("boom")

    bus.subscribe(_EventA, broken)
    with pytest.raises(RuntimeError, match="boom"):
        await bus.publish(_EventA())
```

- [ ] **Step 3: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/integration/test_in_memory_event_bus.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dm_api.infrastructure.events.in_memory_event_bus'`.

- [ ] **Step 4: Implement**

Create `apps/api/src/dm_api/infrastructure/events/in_memory_event_bus.py`:

```python
"""In-process pub/sub implementation of the EventBus port.

Handlers are stored per-event-type. Publishing iterates the handler list in
subscription order and awaits each one sequentially. Exceptions propagate.

Phase 2c will replace or wrap this with a WebSocket-broadcasting bus.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any


class InMemoryEventBus:
    def __init__(self) -> None:
        self._handlers: defaultdict[type, list[Callable[[Any], Awaitable[None]]]] = (
            defaultdict(list)
        )

    def subscribe(
        self,
        event_type: type,
        handler: Callable[[Any], Awaitable[None]],
    ) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: object) -> None:
        for handler in self._handlers[type(event)]:
            await handler(event)
```

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_in_memory_event_bus.py -v`
Expected: 5 PASSED.

- [ ] **Step 6: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```

Note: mypy strict applies only to `domain/` and `application/`. The new infrastructure file is checked with default settings.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/events/ \
        apps/api/tests/integration/test_in_memory_event_bus.py
git commit -m "feat(infrastructure): add InMemoryEventBus"
```

---

## Task 8: `SQLiteDownloadRepository`

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py`
- Create: `apps/api/tests/integration/test_sqlite_download_repository.py`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/tests/integration/test_sqlite_download_repository.py`:

```python
"""SQLiteDownloadRepository round-trip tests against real aiosqlite.

Uses the actual Phase 1 migration to set up the schema.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.persistence.sqlite_download_repository import (
    SQLiteDownloadRepository,
)

REPO_API_ROOT = Path(__file__).resolve().parents[2]  # apps/api
ALEMBIC_INI = REPO_API_ROOT / "alembic.ini"


@pytest.fixture
def db_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("DM_DATABASE_URL", url)
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option(
        "script_location",
        str(REPO_API_ROOT / "src/dm_api/infrastructure/persistence/migrations"),
    )
    command.upgrade(cfg, "head")
    return url


def _make_task(**overrides: object) -> DownloadTask:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "url": "https://example.com/file.zip",
        "file_name": "file.zip",
        "save_path": "/tmp/dl",
        "total_size": 1024,
        "downloaded_size": 0,
        "status": DownloadStatus.PENDING,
        "resume_supported": False,
        "segment_count": 1,
        "category": "general",
        "speed_limit": None,
        "checksum": None,
        "checksum_algorithm": None,
        "error_message": None,
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
    }
    defaults.update(overrides)
    return DownloadTask(**defaults)  # type: ignore[arg-type]


@pytest.mark.integration
async def test_save_then_get_round_trip(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()

    await repo.save(task)
    fetched = await repo.get_by_id(task.id)

    assert fetched is not None
    assert fetched.id == task.id
    assert fetched.url == task.url
    assert fetched.file_name == task.file_name
    assert fetched.status == DownloadStatus.PENDING
    assert fetched.total_size == 1024
    assert fetched.downloaded_size == 0
    assert fetched.resume_supported is False
    assert fetched.created_at == task.created_at


@pytest.mark.integration
async def test_get_missing_returns_none(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    missing = uuid4()
    assert await repo.get_by_id(missing) is None


@pytest.mark.integration
async def test_list_all_returns_newest_first(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)

    t1 = _make_task(created_at=datetime(2026, 1, 1, tzinfo=UTC))
    t2 = _make_task(created_at=datetime(2026, 3, 1, tzinfo=UTC))
    t3 = _make_task(created_at=datetime(2026, 2, 1, tzinfo=UTC))
    await repo.save(t1)
    await repo.save(t2)
    await repo.save(t3)

    all_tasks = await repo.list_all()
    assert [t.id for t in all_tasks] == [t2.id, t3.id, t1.id]


@pytest.mark.integration
async def test_save_then_list_empty(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    assert await repo.list_all() == []


@pytest.mark.integration
async def test_optional_fields_roundtrip(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task(
        total_size=None,
        speed_limit=2_000_000,
        checksum="abc123",
        checksum_algorithm="md5",
        error_message=None,
        started_at=datetime(2026, 4, 1, 12, 0, tzinfo=UTC),
        completed_at=None,
    )
    await repo.save(task)
    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.total_size is None
    assert fetched.speed_limit == 2_000_000
    assert fetched.checksum == "abc123"
    assert fetched.checksum_algorithm == "md5"
    assert fetched.error_message is None
    assert fetched.started_at == datetime(2026, 4, 1, 12, 0, tzinfo=UTC)
    assert fetched.completed_at is None
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/integration/test_sqlite_download_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dm_api.infrastructure.persistence.sqlite_download_repository'`.

- [ ] **Step 3: Implement the repository**

Create `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py`:

```python
"""Async SQLite implementation of DownloadRepository.

Connection-per-call: simple, correct, fast enough for Phase 2a. Phase 2b
will revisit if benchmarks demand a shared connection.

Datetime is stored as ISO-8601 UTC strings. UUID as string. Enum via .value.
Booleans as 0/1.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import aiosqlite

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


def _db_path_from_url(url: str) -> str:
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise ValueError(f"unsupported database URL: {url!r}")
    return url[len(prefix):]


def _row_to_task(row: aiosqlite.Row) -> DownloadTask:
    return DownloadTask(
        id=UUID(row["id"]),
        url=row["url"],
        file_name=row["file_name"],
        save_path=row["save_path"],
        total_size=row["total_size"],
        downloaded_size=row["downloaded_size"],
        status=DownloadStatus(row["status"]),
        resume_supported=bool(row["resume_supported"]),
        segment_count=row["segment_count"],
        category=row["category"],
        speed_limit=row["speed_limit"],
        checksum=row["checksum"],
        checksum_algorithm=row["checksum_algorithm"],
        error_message=row["error_message"],
        created_at=datetime.fromisoformat(row["created_at"]),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
    )


class SQLiteDownloadRepository:
    def __init__(self, database_url: str) -> None:
        self._db_path = _db_path_from_url(database_url)

    async def _connect(self) -> aiosqlite.Connection:
        conn = await aiosqlite.connect(self._db_path)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON")
        return conn

    async def save(self, task: DownloadTask) -> None:
        params: tuple[Any, ...] = (
            str(task.id),
            task.url,
            task.file_name,
            task.save_path,
            task.total_size,
            task.downloaded_size,
            task.status.value,
            int(task.resume_supported),
            task.segment_count,
            task.category,
            task.speed_limit,
            task.checksum,
            task.checksum_algorithm,
            task.error_message,
            task.created_at.isoformat(),
            task.started_at.isoformat() if task.started_at else None,
            task.completed_at.isoformat() if task.completed_at else None,
        )
        async with await self._connect() as conn:
            await conn.execute(
                """
                INSERT INTO downloads (
                    id, url, file_name, save_path, total_size, downloaded_size,
                    status, resume_supported, segment_count, category, speed_limit,
                    checksum, checksum_algorithm, error_message,
                    created_at, started_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                params,
            )
            await conn.commit()

    async def get_by_id(self, id: UUID) -> DownloadTask | None:
        async with await self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM downloads WHERE id = ?", (str(id),)
            ) as cursor:
                row = await cursor.fetchone()
                return _row_to_task(row) if row else None

    async def list_all(self) -> list[DownloadTask]:
        async with await self._connect() as conn:
            async with conn.execute(
                "SELECT * FROM downloads ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [_row_to_task(r) for r in rows]
```

- [ ] **Step 4: Run tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_sqlite_download_repository.py -v`
Expected: 5 PASSED.

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py \
        apps/api/tests/integration/test_sqlite_download_repository.py
git commit -m "feat(infrastructure): add SQLiteDownloadRepository (aiosqlite)"
```

---

## Task 9: Pydantic DTOs

**Files:**
- Create: `apps/api/src/dm_api/presentation/__init__.py`
- Create: `apps/api/src/dm_api/presentation/schemas/__init__.py`
- Create: `apps/api/src/dm_api/presentation/schemas/download_dto.py`
- Create: `apps/api/tests/unit/presentation/__init__.py`
- Create: `apps/api/tests/unit/presentation/test_download_dto.py`

- [ ] **Step 1: Create directories**

```bash
mkdir -p apps/api/src/dm_api/presentation/schemas apps/api/tests/unit/presentation
touch apps/api/src/dm_api/presentation/__init__.py \
      apps/api/src/dm_api/presentation/schemas/__init__.py \
      apps/api/tests/unit/presentation/__init__.py
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/unit/presentation/test_download_dto.py`:

```python
"""DTO mapping tests."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.presentation.schemas.download_dto import AddDownloadRequest, DownloadDTO


def _make_task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://example.com/file.zip",
        file_name="file.zip",
        save_path="/tmp/dl",
        total_size=1024,
        downloaded_size=0,
        status=DownloadStatus.PENDING,
        resume_supported=False,
        segment_count=1,
        category="general",
        speed_limit=None,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime(2026, 5, 23, 12, 0, tzinfo=UTC),
        started_at=None,
        completed_at=None,
    )


def test_download_dto_from_entity_preserves_all_fields() -> None:
    task = _make_task()
    dto = DownloadDTO.from_entity(task)
    assert dto.id == task.id
    assert dto.url == task.url
    assert dto.file_name == "file.zip"
    assert dto.status == "pending"
    assert dto.total_size == 1024
    assert dto.resume_supported is False
    assert dto.segment_count == 1
    assert dto.category == "general"
    assert dto.created_at == task.created_at


def test_download_dto_serializes_uuid_and_datetime_to_json() -> None:
    task = _make_task()
    dto = DownloadDTO.from_entity(task)
    data = dto.model_dump(mode="json")
    assert isinstance(data["id"], str)
    UUID(data["id"])  # parseable
    assert data["created_at"].startswith("2026-05-23T12:00:00")
    assert data["status"] == "pending"


def test_add_download_request_minimum_payload() -> None:
    req = AddDownloadRequest(url="https://example.com/file.zip")
    assert req.url == "https://example.com/file.zip"
    assert req.save_path is None
    assert req.category is None


def test_add_download_request_full_payload() -> None:
    req = AddDownloadRequest(
        url="https://example.com/movie.mp4",
        save_path="/mnt/external/dl",
        category="video",
    )
    assert req.save_path == "/mnt/external/dl"
    assert req.category == "video"


def test_add_download_request_rejects_empty_url() -> None:
    with pytest.raises(ValidationError):
        AddDownloadRequest(url="")


def test_add_download_request_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        AddDownloadRequest(url="https://example.com/file.zip", malicious_field="x")  # type: ignore[call-arg]
```

- [ ] **Step 3: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/presentation/test_download_dto.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement the schemas**

Create `apps/api/src/dm_api/presentation/schemas/download_dto.py`:

```python
"""Pydantic v2 request/response schemas for the downloads API.

The presentation layer is the only place Pydantic is imported. Domain and
application stay framework-free.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from dm_api.domain.entities.download_task import DownloadTask


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

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/presentation/test_download_dto.py -v`
Expected: 6 PASSED.

- [ ] **Step 6: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dm_api/presentation/ apps/api/tests/unit/presentation/
git commit -m "feat(presentation): add Pydantic v2 AddDownloadRequest and DownloadDTO"
```

---

## Task 10: FastAPI `app.py` with lifespan

**Files:**
- Create: `apps/api/src/dm_api/presentation/app.py`

This task creates the FastAPI app factory but no routers yet — those come in T12 and T13. The integration test for the lifespan itself happens in T13 (because it needs at least one route to exercise).

- [ ] **Step 1: Implement the app factory**

Create `apps/api/src/dm_api/presentation/app.py`:

```python
"""FastAPI app factory + lifespan.

Lifespan responsibilities (in order):
1. Resolve the database URL (env var or platform default).
2. Ensure the data directory exists.
3. Run `alembic upgrade head` to make sure the schema is current.
4. Instantiate the repository, event bus, and use cases.
5. Stash them on `app.state` so routers can pick them up.
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI

from dm_api.application.use_cases.add_download import (
    AddDownloadUseCase,
    InvalidUrlError,
)
from dm_api.application.use_cases.get_download import (
    GetDownloadUseCase,
    ListDownloadsUseCase,
)
from dm_api.infrastructure.events.in_memory_event_bus import InMemoryEventBus
from dm_api.infrastructure.persistence.sqlite_download_repository import (
    SQLiteDownloadRepository,
)


def _platform_default_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "DownloadManager"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / "DownloadManager"
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / "download-manager"


def _resolve_database_url() -> str:
    explicit = os.environ.get("DM_DATABASE_URL")
    if explicit:
        return explicit
    data_dir_env = os.environ.get("DM_DATA_DIR")
    data_dir = Path(data_dir_env) if data_dir_env else _platform_default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{data_dir / 'app.db'}"


def _alembic_root() -> Path:
    # apps/api/src/dm_api/presentation/app.py -> apps/api
    return Path(__file__).resolve().parents[3]


def _run_migrations_sync() -> None:
    api_root = _alembic_root()
    cfg = Config(str(api_root / "alembic.ini"))
    cfg.set_main_option(
        "script_location",
        str(api_root / "src/dm_api/infrastructure/persistence/migrations"),
    )
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db_url = _resolve_database_url()
    await asyncio.to_thread(_run_migrations_sync)

    repo = SQLiteDownloadRepository(db_url)
    event_bus = InMemoryEventBus()

    app.state.repo = repo
    app.state.event_bus = event_bus
    app.state.add_download = AddDownloadUseCase(repo=repo, event_bus=event_bus)
    app.state.get_download = GetDownloadUseCase(repo=repo)
    app.state.list_downloads = ListDownloadsUseCase(repo=repo)

    yield


def create_app() -> FastAPI:
    app = FastAPI(title="dm-api", version="0.2.0", lifespan=lifespan)

    @app.exception_handler(InvalidUrlError)
    async def _invalid_url_handler(request, exc):  # type: ignore[no-untyped-def]
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=422, content={"detail": str(exc)})

    # Routers added in T12 and T13:
    from dm_api.presentation.routers import downloads, health
    app.include_router(health.router)
    app.include_router(downloads.router)

    return app
```

Note: `app.py` imports `routers.downloads` and `routers.health` at the bottom of `create_app()` — these don't exist yet, so the import will fail until T12 and T13. For now, comment those two lines out so the file is syntactically valid and importable. Replace them with:

```python
    # Routers added in T12 and T13:
    # from dm_api.presentation.routers import downloads, health
    # app.include_router(health.router)
    # app.include_router(downloads.router)
```

The router imports will be uncommented in T13.

- [ ] **Step 2: Verify the module imports without error**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.presentation.app import create_app; print(create_app())"
```
Expected: prints something like `<fastapi.applications.FastAPI object at 0x...>`. The lifespan only fires when the app actually starts serving — bare creation should succeed.

- [ ] **Step 3: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/dm_api/presentation/app.py
git commit -m "feat(presentation): add FastAPI app factory and lifespan"
```

---

## Task 11: uvicorn entry point

**Files:**
- Create: `apps/api/src/dm_api/presentation/main.py`
- Create: `apps/api/tests/unit/presentation/test_main.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/presentation/test_main.py`:

```python
"""Unit tests for the uvicorn entry point. We don't actually start the server
here — we just verify the host validation logic."""
from __future__ import annotations

import pytest

from dm_api.presentation import main


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1"])
def test_loopback_hosts_are_accepted(host: str) -> None:
    main._validate_host(host)  # must not raise


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.1", "example.com"])
def test_non_loopback_hosts_are_rejected(host: str) -> None:
    with pytest.raises(RuntimeError, match="loopback"):
        main._validate_host(host)
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/presentation/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement `main.py`**

Create `apps/api/src/dm_api/presentation/main.py`:

```python
"""uvicorn entry point.

Bind defaults to 127.0.0.1:6543. The host check rejects any non-loopback
address even if the user tries to override it — this app is local-only by
design.
"""
from __future__ import annotations

import os

import uvicorn

from dm_api.presentation.app import create_app

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6543
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _validate_host(host: str) -> None:
    if host not in _LOOPBACK_HOSTS:
        raise RuntimeError(
            f"DM_API_HOST must be a loopback address; got {host!r}. "
            "This app is local-only by design."
        )


def main() -> None:
    host = os.environ.get("DM_API_HOST", DEFAULT_HOST)
    _validate_host(host)
    port = int(os.environ.get("DM_API_PORT", DEFAULT_PORT))
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/presentation/test_main.py -v`
Expected: 7 PASSED (3 loopback + 4 non-loopback).

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/presentation/main.py \
        apps/api/tests/unit/presentation/test_main.py
git commit -m "feat(presentation): add uvicorn entry point with loopback enforcement"
```

---

## Task 12: Health router

**Files:**
- Create: `apps/api/src/dm_api/presentation/routers/__init__.py`
- Create: `apps/api/src/dm_api/presentation/routers/health.py`
- Create: `apps/api/tests/integration/test_health.py`

- [ ] **Step 1: Create the routers package**

```bash
mkdir -p apps/api/src/dm_api/presentation/routers
touch apps/api/src/dm_api/presentation/routers/__init__.py
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/tests/integration/test_health.py`:

```python
"""Health endpoint integration test."""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("DM_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    # Important: import inside the fixture so the env var is set before
    # the lifespan reads it.
    from dm_api.presentation.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        async with app.router.lifespan_context(app):
            yield ac


@pytest.mark.integration
async def test_health_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.2.0"
    assert data["active_downloads"] == 0
```

- [ ] **Step 3: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/integration/test_health.py -v`
Expected: FAIL — either `ModuleNotFoundError` on `dm_api.presentation.routers.health` (once we uncomment in T13) or 404 since the router isn't registered yet. Either way: failure expected.

- [ ] **Step 4: Implement the health router**

Create `apps/api/src/dm_api/presentation/routers/health.py`:

```python
"""GET /api/health — simple liveness + version + active_downloads count."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from dm_api.domain.value_objects.download_status import DownloadStatus

router = APIRouter(prefix="/api", tags=["health"])

_ACTIVE_STATUSES = {
    DownloadStatus.QUEUED,
    DownloadStatus.DOWNLOADING,
    DownloadStatus.MERGING,
}


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    tasks = await request.app.state.list_downloads.execute()
    active = sum(1 for t in tasks if t.status in _ACTIVE_STATUSES)
    return {"status": "ok", "version": "0.2.0", "active_downloads": active}
```

- [ ] **Step 5: Uncomment the router wiring in `app.py`**

Edit `apps/api/src/dm_api/presentation/app.py` and change the commented-out section near the bottom of `create_app()`:

From:
```python
    # Routers added in T12 and T13:
    # from dm_api.presentation.routers import downloads, health
    # app.include_router(health.router)
    # app.include_router(downloads.router)
```

To:
```python
    from dm_api.presentation.routers import health
    app.include_router(health.router)
    # downloads router added in T13:
    # from dm_api.presentation.routers import downloads
    # app.include_router(downloads.router)
```

- [ ] **Step 6: Run tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_health.py -v`
Expected: 1 PASSED.

- [ ] **Step 7: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/dm_api/presentation/routers/__init__.py \
        apps/api/src/dm_api/presentation/routers/health.py \
        apps/api/src/dm_api/presentation/app.py \
        apps/api/tests/integration/test_health.py
git commit -m "feat(presentation): add GET /api/health endpoint"
```

---

## Task 13: Downloads router

**Files:**
- Create: `apps/api/src/dm_api/presentation/routers/downloads.py`
- Create: `apps/api/tests/integration/test_api_routes.py`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/tests/integration/test_api_routes.py`:

```python
"""Downloads API end-to-end via httpx ASGITransport."""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("DM_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    from dm_api.presentation.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        async with app.router.lifespan_context(app):
            yield ac


@pytest.mark.integration
async def test_post_create_then_get(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["url"] == "https://example.com/file.zip"
    assert body["file_name"] == "file.zip"
    assert body["status"] == "pending"
    assert body["category"] == "general"
    download_id = body["id"]

    get_response = await client.get(f"/api/downloads/{download_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == download_id


@pytest.mark.integration
async def test_post_with_explicit_save_path_and_category(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={
            "url": "https://example.com/movie.mp4",
            "save_path": "/mnt/external/dl",
            "category": "video",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["save_path"] == "/mnt/external/dl"
    assert body["category"] == "video"


@pytest.mark.integration
async def test_list_returns_newest_first(client: AsyncClient) -> None:
    for i in range(3):
        r = await client.post(
            "/api/downloads",
            json={"url": f"https://example.com/file{i}.zip"},
        )
        assert r.status_code == 201

    list_response = await client.get("/api/downloads")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 3
    # newest first means file2.zip should appear before file0.zip
    file_names = [it["file_name"] for it in items]
    assert file_names == ["file2.zip", "file1.zip", "file0.zip"]


@pytest.mark.integration
async def test_get_unknown_id_returns_404(client: AsyncClient) -> None:
    missing = uuid4()
    response = await client.get(f"/api/downloads/{missing}")
    assert response.status_code == 404


@pytest.mark.integration
async def test_get_malformed_uuid_returns_422(client: AsyncClient) -> None:
    response = await client.get("/api/downloads/not-a-uuid")
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_ftp_url_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "ftp://example.com/file.zip"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_extra_field_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip", "evil": "x"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_relative_save_path_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip", "save_path": "relative"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_health_active_downloads_is_zero_when_all_pending(
    client: AsyncClient,
) -> None:
    await client.post("/api/downloads", json={"url": "https://example.com/a.zip"})
    await client.post("/api/downloads", json={"url": "https://example.com/b.zip"})
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["active_downloads"] == 0
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/integration/test_api_routes.py -v`
Expected: FAIL on every test — the downloads router isn't registered yet.

- [ ] **Step 3: Implement the downloads router**

Create `apps/api/src/dm_api/presentation/routers/downloads.py`:

```python
"""REST endpoints for download tasks.

In Phase 2a, tasks are created but never started — they remain at
status=PENDING. Phase 2b will add /start.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from dm_api.presentation.schemas.download_dto import AddDownloadRequest, DownloadDTO

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.post("", status_code=201, response_model=DownloadDTO)
async def create_download(request: Request, body: AddDownloadRequest) -> DownloadDTO:
    task = await request.app.state.add_download.execute(
        url=body.url,
        save_path=body.save_path,
        category=body.category,
    )
    return DownloadDTO.from_entity(task)


@router.get("/{id}", response_model=DownloadDTO)
async def get_download(request: Request, id: UUID) -> DownloadDTO:
    task = await request.app.state.get_download.execute(id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"download {id} not found")
    return DownloadDTO.from_entity(task)


@router.get("", response_model=list[DownloadDTO])
async def list_downloads(request: Request) -> list[DownloadDTO]:
    tasks = await request.app.state.list_downloads.execute()
    return [DownloadDTO.from_entity(t) for t in tasks]
```

- [ ] **Step 4: Wire the router in `app.py`**

Edit `apps/api/src/dm_api/presentation/app.py`. Change the section near the bottom of `create_app()`:

From:
```python
    from dm_api.presentation.routers import health
    app.include_router(health.router)
    # downloads router added in T13:
    # from dm_api.presentation.routers import downloads
    # app.include_router(downloads.router)
```

To:
```python
    from dm_api.presentation.routers import downloads, health
    app.include_router(health.router)
    app.include_router(downloads.router)
```

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_api_routes.py -v`
Expected: 9 PASSED.

- [ ] **Step 6: Full test run**

Run from `apps/api/`: `uv run pytest`
Expected: ALL tests pass (Phase 1's 106 + everything new from Phase 2a tasks). Coverage gate (combined domain + application ≥ 90%) holds.

- [ ] **Step 7: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/dm_api/presentation/routers/downloads.py \
        apps/api/src/dm_api/presentation/app.py \
        apps/api/tests/integration/test_api_routes.py
git commit -m "feat(presentation): add POST/GET/list /api/downloads endpoints"
```

---

## Task 14: README update + restart-survival smoke test + final verification

**Files:**
- Modify: `apps/api/README.md`
- Create: `apps/api/tests/integration/test_restart_survival.py`

- [ ] **Step 1: Add restart-survival integration test**

Create `apps/api/tests/integration/test_restart_survival.py`:

```python
"""Verify that downloads persist across server restarts by booting two
separate FastAPI apps backed by the same SQLite file.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.integration
async def test_downloads_survive_app_restart(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_url = f"sqlite:///{tmp_path / 'shared.db'}"
    monkeypatch.setenv("DM_DATABASE_URL", db_url)

    # First app instance — create a download
    from dm_api.presentation.app import create_app

    app1 = create_app()
    async with AsyncClient(transport=ASGITransport(app=app1), base_url="http://testserver") as ac:
        async with app1.router.lifespan_context(app1):
            create_response = await ac.post(
                "/api/downloads",
                json={"url": "https://example.com/keepme.zip"},
            )
            assert create_response.status_code == 201
            saved_id = create_response.json()["id"]

    # Second app instance — read it back
    app2 = create_app()
    async with AsyncClient(transport=ASGITransport(app=app2), base_url="http://testserver") as ac:
        async with app2.router.lifespan_context(app2):
            get_response = await ac.get(f"/api/downloads/{saved_id}")
            assert get_response.status_code == 200
            assert get_response.json()["file_name"] == "keepme.zip"
```

- [ ] **Step 2: Run the test**

Run from `apps/api/`: `uv run pytest tests/integration/test_restart_survival.py -v`
Expected: 1 PASSED.

- [ ] **Step 3: Overwrite `apps/api/README.md`**

Replace the entire contents of `apps/api/README.md` with:

```markdown
# dm-api — Download Manager Backend

Phase 2a ships the persistence layer and a FastAPI server bound to
127.0.0.1:6543. Downloads can be created and queried — actual downloading
arrives in Phase 2b.

## Quickstart

```bash
cd apps/api
uv sync                                          # install deps
uv run ruff check                                # lint
uv run mypy --strict src/dm_api/domain src/dm_api/application
uv run pytest                                    # all unit + integration tests
uv run alembic upgrade head                      # create the SQLite DB
uv run python -m dm_api.presentation.main        # boot the API on 127.0.0.1:6543
```

In another shell:

```bash
curl -s http://127.0.0.1:6543/api/health | python -m json.tool
curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/file.zip"}' | python -m json.tool
curl -s http://127.0.0.1:6543/api/downloads | python -m json.tool
```

## Layout

```
src/dm_api/
├── domain/                       # pure-Python, framework-free
│   ├── entities/
│   ├── value_objects/
│   ├── policies/
│   └── events/
├── application/                  # use cases + ports
│   ├── ports/
│   │   ├── download_repository.py
│   │   └── event_bus.py
│   └── use_cases/
│       ├── add_download.py
│       └── get_download.py
├── infrastructure/
│   ├── events/
│   │   └── in_memory_event_bus.py
│   └── persistence/
│       ├── sqlite_download_repository.py
│       └── migrations/
└── presentation/
    ├── app.py                    # FastAPI factory + lifespan
    ├── main.py                   # uvicorn entry point
    ├── routers/
    │   ├── health.py
    │   └── downloads.py
    └── schemas/
        └── download_dto.py
```

## API surface (Phase 2a)

| Method | Path | Description |
|---|---|---|
| GET | /api/health | Liveness + active-downloads count |
| POST | /api/downloads | Create a download (status=PENDING) |
| GET | /api/downloads/{id} | Fetch one |
| GET | /api/downloads | List newest-first |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Server bind (loopback only — enforced at startup) |
| `DM_API_PORT` | `6543` | Server port |
| `DM_DATABASE_URL` | derived | Full SQLAlchemy URL (used by tests) |
| `DM_DATA_DIR` | platform default | Directory for `app.db` (Linux: `~/.local/share/download-manager`) |

## Dependency rules

- `domain/` may import stdlib + sibling `domain` only
- `application/` may import stdlib + `domain` + sibling `application` only
- `infrastructure/` and `presentation/` may import anything

These rules are enforced by static AST tests in `tests/unit/test_dependency_rule.py`
and `tests/unit/application/test_dependency_rule.py`.
```

- [ ] **Step 4: Run the full verification chain**

Run from `apps/api/`:

```bash
uv run ruff check
uv run mypy --strict src/dm_api/domain src/dm_api/application
uv run pytest
```

Expected:
- `ruff check`: All checks passed!
- `mypy`: Success.
- `pytest`: ALL tests pass; combined coverage on `domain` + `application` ≥ 90%.

- [ ] **Step 5: Boot the server manually and smoke-test**

Run from `apps/api/`:
```bash
uv run python -m dm_api.presentation.main &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:6543/api/health
echo
curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/smoke.zip"}'
echo
curl -s http://127.0.0.1:6543/api/downloads
echo
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
```

Expected: each `curl` returns valid JSON; first command shows status ok; second returns a 201-style body with `"file_name":"smoke.zip"`; third shows the same download in a list.

Note: the server will write its DB to the platform default data dir during this smoke test. That's fine — it'll be reused on next boot, demonstrating real persistence.

- [ ] **Step 6: Reject non-loopback host**

```bash
DM_API_HOST=0.0.0.0 uv run python -m dm_api.presentation.main 2>&1 | head -5
```
Expected: prints a `RuntimeError` about loopback and exits non-zero.

- [ ] **Step 7: Commit the README and restart-survival test**

```bash
git add apps/api/README.md apps/api/tests/integration/test_restart_survival.py
git commit -m "docs(api): update README for phase 2a; add restart-survival test"
```

- [ ] **Step 8: Final repo verification**

Run from repo root: `git log --oneline | head -25`
Expected: a clear story — Phase 1 commits + Phase 2a commits, all `<type>(<scope>): <message>` format.

Run: `git status`
Expected: clean.

---

## Phase 2a Definition of Done — verify all true

- [ ] `uv sync` installs the new deps (fastapi, uvicorn, aiosqlite, pydantic, httpx, pytest-asyncio)
- [ ] `uv run ruff check` is green
- [ ] `uv run mypy --strict src/dm_api/domain src/dm_api/application` is green
- [ ] `uv run pytest` is green; combined `domain + application` coverage ≥90%
- [ ] `uv run python -m dm_api.presentation.main` boots on 127.0.0.1:6543
- [ ] `POST /api/downloads` returns 201 with a valid DownloadDTO
- [ ] `GET /api/downloads/{id}` and `GET /api/downloads` work
- [ ] Server refuses `DM_API_HOST=0.0.0.0` with a clear error
- [ ] Downloads persist across restarts (test in `tests/integration/test_restart_survival.py`)
- [ ] FTP URLs and unknown JSON fields return 422
- [ ] `apps/api/README.md` reflects the Phase 2a state
- [ ] Application-layer dependency-rule test catches synthetic violations
