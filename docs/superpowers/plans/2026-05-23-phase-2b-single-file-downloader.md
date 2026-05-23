# Phase 2b — Single-File Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real HTTP downloads to the Download Manager. `POST /api/downloads/{id}/start` triggers an async background download via httpx + aiofiles, writing bytes to `{save_path}/{file_name}.part` and atomically renaming on success. Polling `GET /api/downloads/{id}` shows live `downloaded_size` progress.

**Architecture:** New `MetadataProbe` and `SegmentWorker` ports in `application/ports/`. Concrete `HttpxMetadataProbe` + `SingleSegmentWorker` in `infrastructure/http/`. A `DownloadRunner` service in `application/services/` wraps `asyncio.create_task` so background workers don't get GC'd. The FastAPI lifespan instantiates a shared `httpx.AsyncClient` and wires everything together. No retries, no resume, no WebSocket — those are Phase 2c.

**Tech Stack:** Python 3.14, `httpx` (already added in 2a), `aiofiles` (new runtime dep), `respx` (new dev dep, for httpx mocking), stdlib `http.server` for integration test fixture, `aiosqlite` (existing).

**Spec:** `docs/superpowers/specs/2026-05-23-phase-2b-single-file-downloader-design.md`

**Working directory for `uv`/`pytest`/`alembic` commands:** `apps/api/`. All paths in this plan are relative to repo root unless they already start with `apps/api/`.

---

## Task 1: Add new dependencies

**Files:**
- Modify: `apps/api/pyproject.toml`

- [ ] **Step 1: Add `aiofiles` to runtime deps and `respx` to dev deps**

Open `apps/api/pyproject.toml`. Apply two edits.

**Edit 1 — extend the `[project]` `dependencies` array** to add `aiofiles`. Resulting block:

```toml
dependencies = [
    "alembic>=1.13",
    "sqlalchemy>=2.0",
    "fastapi>=0.110",
    "uvicorn[standard]>=0.30",
    "aiosqlite>=0.20",
    "pydantic>=2.7",
    "aiofiles>=24",
]
```

**Edit 2 — extend the `[dependency-groups]` `dev` array** to add `respx`. Resulting block:

```toml
[dependency-groups]
dev = [
    "ruff>=0.6",
    "mypy>=1.11",
    "pytest>=8.3",
    "pytest-cov>=5.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "respx>=0.21",
]
```

- [ ] **Step 2: Sync dependencies**

Run from `apps/api/`: `uv sync`
Expected: `Resolved N packages` / `Installed N packages` — new packages include `aiofiles` and `respx`.

- [ ] **Step 3: Verify existing suite still passes**

Run from `apps/api/`: `uv run pytest --no-cov`
Expected: all 168 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/pyproject.toml apps/api/uv.lock
git commit -m "chore(api): add aiofiles (runtime) and respx (dev) deps"
```

---

## Task 2: Application ports — `MetadataProbe` and `SegmentWorker`

**Files:**
- Create: `apps/api/src/dm_api/application/ports/metadata_probe.py`
- Create: `apps/api/src/dm_api/application/ports/segment_worker.py`

Two ports defined together. Both are Protocols. `SegmentWorker` exists so `DownloadRunner` (in `application/services/`) doesn't need to import the concrete `SingleSegmentWorker` from `infrastructure/` — that would violate the dependency rule.

- [ ] **Step 1: Create `metadata_probe.py`**

Create `apps/api/src/dm_api/application/ports/metadata_probe.py`:

```python
"""Port for fetching file metadata from an HTTP URL (HEAD or GET probe).

The Phase 2b implementation lives in infrastructure/http/httpx_metadata_probe.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class FileMetadata:
    total_size: int | None
    accepts_ranges: bool
    suggested_filename: str | None


class MetadataProbe(Protocol):
    async def probe(self, url: str) -> FileMetadata: ...
```

- [ ] **Step 2: Create `segment_worker.py`**

Create `apps/api/src/dm_api/application/ports/segment_worker.py`:

```python
"""Port for a download segment worker.

Phase 2b's implementation is SingleSegmentWorker — downloads the whole file
in one stream. Phase 3 will add multi-segment workers that satisfy the same
protocol.
"""
from __future__ import annotations

from typing import Protocol

from dm_api.domain.entities.download_task import DownloadTask


class SegmentWorker(Protocol):
    async def run(self, task: DownloadTask) -> None: ...
```

- [ ] **Step 3: Verify imports**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.application.ports.metadata_probe import FileMetadata, MetadataProbe; from dm_api.application.ports.segment_worker import SegmentWorker; print(FileMetadata, MetadataProbe, SegmentWorker)"
```
Expected: prints three class objects with no errors.

- [ ] **Step 4: Run dependency-rule test**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v --no-cov`
Expected: all pass — the new ports import only stdlib and `dm_api.domain.*`.

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/application/ports/metadata_probe.py \
        apps/api/src/dm_api/application/ports/segment_worker.py
git commit -m "feat(application): add MetadataProbe and SegmentWorker ports"
```

---

## Task 3: Extend `DownloadRepository` port with `update()`

**Files:**
- Modify: `apps/api/src/dm_api/application/ports/download_repository.py`

- [ ] **Step 1: Add `update()` method to the Protocol**

Open `apps/api/src/dm_api/application/ports/download_repository.py`. Replace the entire file contents with:

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

    async def update(self, task: DownloadTask) -> None: ...

    async def get_by_id(self, id: UUID) -> DownloadTask | None: ...

    async def list_all(self) -> list[DownloadTask]: ...
```

The new `update()` method comes between `save` and `get_by_id`.

- [ ] **Step 2: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean. Note: mypy will NOT complain about `SQLiteDownloadRepository` missing `update()` because Protocols only constrain at call sites; the concrete class is not declared as inheriting from the Protocol. The implementation gap is closed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/dm_api/application/ports/download_repository.py
git commit -m "feat(application): add update() to DownloadRepository port"
```

---

## Task 4: Implement `update()` in `SQLiteDownloadRepository`

**Files:**
- Modify: `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py`
- Modify: `apps/api/tests/integration/test_sqlite_download_repository.py` (append tests)

Strict TDD: failing tests first, then implementation.

- [ ] **Step 1: Append failing tests**

Append these tests to the END of `apps/api/tests/integration/test_sqlite_download_repository.py` (keep the existing 5 tests intact):

```python
@pytest.mark.integration
async def test_update_persists_changed_fields(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()
    await repo.save(task)

    task.status = DownloadStatus.DOWNLOADING
    task.total_size = 8192
    task.downloaded_size = 4096
    task.started_at = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    await repo.update(task)

    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.status == DownloadStatus.DOWNLOADING
    assert fetched.total_size == 8192
    assert fetched.downloaded_size == 4096
    assert fetched.started_at == datetime(2026, 5, 23, 12, 0, tzinfo=UTC)


@pytest.mark.integration
async def test_update_missing_id_raises(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()  # never saved
    with pytest.raises(LookupError):
        await repo.update(task)


@pytest.mark.integration
async def test_update_preserves_all_other_fields(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task(
        url="https://example.com/keep.zip",
        file_name="keep.zip",
        save_path="/tmp/keep",
        category="archive",
    )
    await repo.save(task)

    task.status = DownloadStatus.PAUSED  # mutate only one field
    await repo.update(task)

    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.url == "https://example.com/keep.zip"
    assert fetched.file_name == "keep.zip"
    assert fetched.save_path == "/tmp/keep"
    assert fetched.category == "archive"
    assert fetched.status == DownloadStatus.PAUSED
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/integration/test_sqlite_download_repository.py -v --no-cov`
Expected: 3 NEW tests FAIL with `AttributeError: 'SQLiteDownloadRepository' object has no attribute 'update'`. The 5 original tests still pass.

- [ ] **Step 3: Add the `update()` method**

Open `apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py`. Add the method between `save` and `get_by_id`:

```python
    async def update(self, task: DownloadTask) -> None:
        params: tuple[Any, ...] = (
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
            str(task.id),
        )
        async with aiosqlite.connect(self._db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            cursor = await conn.execute(
                """
                UPDATE downloads SET
                    url = ?, file_name = ?, save_path = ?,
                    total_size = ?, downloaded_size = ?, status = ?,
                    resume_supported = ?, segment_count = ?, category = ?,
                    speed_limit = ?, checksum = ?, checksum_algorithm = ?,
                    error_message = ?, created_at = ?, started_at = ?, completed_at = ?
                WHERE id = ?
                """,
                params,
            )
            if cursor.rowcount == 0:
                raise LookupError(f"no download with id {task.id}")
            await conn.commit()
```

- [ ] **Step 4: Run all SQLite tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_sqlite_download_repository.py -v --no-cov`
Expected: 8 PASSED (5 original + 3 new).

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
git commit -m "feat(infrastructure): add update() to SQLiteDownloadRepository"
```

---

## Task 5: `http_client.py` factory

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/http/__init__.py`
- Create: `apps/api/src/dm_api/infrastructure/http/http_client.py`

This is a one-function module — no dedicated tests; it's exercised end-to-end in T12.

- [ ] **Step 1: Create the package**

```bash
mkdir -p apps/api/src/dm_api/infrastructure/http
touch apps/api/src/dm_api/infrastructure/http/__init__.py
```

- [ ] **Step 2: Create the factory**

Create `apps/api/src/dm_api/infrastructure/http/http_client.py`:

```python
"""Shared httpx.AsyncClient factory.

Called from the FastAPI lifespan. The returned client must be used as an
async context manager so it gets closed cleanly on shutdown.
"""
from __future__ import annotations

import httpx

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_CONNECT_TIMEOUT_SECONDS = 10.0
USER_AGENT = "dm-api/0.2.0 (+local)"


def create_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(DEFAULT_TIMEOUT_SECONDS, connect=DEFAULT_CONNECT_TIMEOUT_SECONDS),
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
```

- [ ] **Step 3: Verify importable**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.infrastructure.http.http_client import create_http_client; c = create_http_client(); print(type(c).__name__)"
```
Expected: prints `AsyncClient`.

- [ ] **Step 4: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/http/__init__.py \
        apps/api/src/dm_api/infrastructure/http/http_client.py
git commit -m "feat(infrastructure): add shared httpx client factory"
```

---

## Task 6: `HttpxMetadataProbe`

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/http/httpx_metadata_probe.py`
- Create: `apps/api/tests/unit/infrastructure/__init__.py`
- Create: `apps/api/tests/unit/infrastructure/test_httpx_metadata_probe.py`

Strict TDD with `respx` for httpx mocking.

- [ ] **Step 1: Create the unit/infrastructure test package**

```bash
mkdir -p apps/api/tests/unit/infrastructure
touch apps/api/tests/unit/infrastructure/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/tests/unit/infrastructure/test_httpx_metadata_probe.py`:

```python
"""HttpxMetadataProbe behavior via respx (httpx mock)."""
from __future__ import annotations

import httpx
import pytest
import respx

from dm_api.infrastructure.http.httpx_metadata_probe import HttpxMetadataProbe


@pytest.fixture
async def client() -> httpx.AsyncClient:
    return httpx.AsyncClient()


async def test_head_with_content_length_and_accept_ranges(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/big.zip").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "1048576",
                    "Accept-Ranges": "bytes",
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/big.zip")
        assert metadata.total_size == 1048576
        assert metadata.accepts_ranges is True
        assert metadata.suggested_filename is None


async def test_head_405_falls_back_to_get(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/no-head.zip").mock(return_value=httpx.Response(405))
        mock.get("/no-head.zip").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "2048",
                    "Accept-Ranges": "none",
                },
                content=b"x" * 2048,
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/no-head.zip")
        assert metadata.total_size == 2048
        assert metadata.accepts_ranges is False


async def test_missing_content_length(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/unknown-size.zip").mock(
            return_value=httpx.Response(200, headers={"Accept-Ranges": "bytes"})
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/unknown-size.zip")
        assert metadata.total_size is None
        assert metadata.accepts_ranges is True


async def test_content_disposition_quoted_filename(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/file").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "100",
                    "Content-Disposition": 'attachment; filename="report.pdf"',
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/file")
        assert metadata.suggested_filename == "report.pdf"


async def test_content_disposition_rfc6266_utf8(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/file").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "100",
                    "Content-Disposition": "attachment; filename*=UTF-8''My%20File.zip",
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/file")
        assert metadata.suggested_filename == "My File.zip"


async def test_http_error_raises(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/gone.zip").mock(return_value=httpx.Response(404))
        # 405 fallback triggers GET, so GET must also fail
        mock.get("/gone.zip").mock(return_value=httpx.Response(404))
        probe = HttpxMetadataProbe(client)
        with pytest.raises(httpx.HTTPStatusError):
            await probe.probe("https://files.example.com/gone.zip")
```

- [ ] **Step 3: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/infrastructure/test_httpx_metadata_probe.py -v --no-cov`
Expected: FAIL with `ModuleNotFoundError: No module named 'dm_api.infrastructure.http.httpx_metadata_probe'`.

- [ ] **Step 4: Implement the probe**

Create `apps/api/src/dm_api/infrastructure/http/httpx_metadata_probe.py`:

```python
"""HTTP metadata probe using httpx.AsyncClient.

Tries HEAD first; falls back to a streamed GET (closed after headers arrive)
when the server returns 405 Method Not Allowed.
"""
from __future__ import annotations

import re
from urllib.parse import unquote

import httpx

from dm_api.application.ports.metadata_probe import FileMetadata


class HttpxMetadataProbe:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def probe(self, url: str) -> FileMetadata:
        response = await self._client.head(url)
        if response.status_code == 405:
            async with self._client.stream("GET", url) as stream_response:
                stream_response.raise_for_status()
                return _parse(stream_response)
        response.raise_for_status()
        return _parse(response)


def _parse(response: httpx.Response) -> FileMetadata:
    content_length = response.headers.get("content-length")
    total_size = int(content_length) if content_length is not None else None
    accepts_ranges = response.headers.get("accept-ranges", "").lower() == "bytes"
    suggested_filename = _parse_content_disposition(
        response.headers.get("content-disposition")
    )
    return FileMetadata(
        total_size=total_size,
        accepts_ranges=accepts_ranges,
        suggested_filename=suggested_filename,
    )


_RFC6266_STAR = re.compile(r"filename\*\s*=\s*([^']*)'[^']*'(.+?)(?:;|$)", re.IGNORECASE)
_RFC6266_PLAIN = re.compile(r'filename\s*=\s*"([^"]+)"', re.IGNORECASE)


def _parse_content_disposition(header: str | None) -> str | None:
    if not header:
        return None
    star_match = _RFC6266_STAR.search(header)
    if star_match:
        return unquote(star_match.group(2).strip())
    plain_match = _RFC6266_PLAIN.search(header)
    if plain_match:
        return plain_match.group(1).strip()
    return None
```

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/infrastructure/test_httpx_metadata_probe.py -v --no-cov`
Expected: 6 PASSED.

- [ ] **Step 6: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/http/httpx_metadata_probe.py \
        apps/api/tests/unit/infrastructure/__init__.py \
        apps/api/tests/unit/infrastructure/test_httpx_metadata_probe.py
git commit -m "feat(infrastructure): add HttpxMetadataProbe with HEAD+GET fallback"
```

---

## Task 7: `SingleSegmentWorker`

**Files:**
- Create: `apps/api/src/dm_api/infrastructure/http/single_segment_worker.py`
- Create: `apps/api/tests/unit/infrastructure/test_single_segment_worker.py`

Strict TDD. This is the largest infrastructure component — streams chunks, writes to `.part`, renames on success, marks FAILED on errors.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/infrastructure/test_single_segment_worker.py`:

```python
"""SingleSegmentWorker behavior using respx + tmp_path."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
import respx

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.http.single_segment_worker import SingleSegmentWorker


def _make_task(save_path: Path, file_name: str = "test.bin") -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://files.example.com/test.bin",
        file_name=file_name,
        save_path=str(save_path),
        total_size=2048,
        downloaded_size=0,
        status=DownloadStatus.DOWNLOADING,
        resume_supported=False,
        segment_count=1,
        category="general",
        speed_limit=None,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        completed_at=None,
    )


async def test_successful_download_writes_file_and_marks_completed(tmp_path: Path) -> None:
    payload = b"hello world" * 200  # 2200 bytes
    repo = AsyncMock()
    task = _make_task(tmp_path)

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(200, content=payload))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    final = tmp_path / "test.bin"
    part = tmp_path / "test.bin.part"
    assert final.exists()
    assert not part.exists()
    assert final.read_bytes() == payload
    assert task.status == DownloadStatus.COMPLETED
    assert task.downloaded_size == len(payload)
    assert task.completed_at is not None
    # The final update() call sets COMPLETED.
    assert repo.update.await_count >= 1
    last_call_task = repo.update.await_args_list[-1].args[0]
    assert last_call_task.status == DownloadStatus.COMPLETED


async def test_http_404_marks_failed(tmp_path: Path) -> None:
    repo = AsyncMock()
    task = _make_task(tmp_path)

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(404))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert task.status == DownloadStatus.FAILED
    assert task.error_message is not None
    assert "404" in task.error_message
    # .part should not have been finalized
    final = tmp_path / "test.bin"
    assert not final.exists()


async def test_creates_parent_directories(tmp_path: Path) -> None:
    nested = tmp_path / "deep" / "nested" / "dir"
    repo = AsyncMock()
    task = _make_task(nested, file_name="t.bin")

    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(return_value=httpx.Response(200, content=b"x" * 10))
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert (nested / "t.bin").exists()


async def test_error_message_truncated_to_500_chars(tmp_path: Path) -> None:
    repo = AsyncMock()
    task = _make_task(tmp_path)

    # Simulate a connection error via respx's side_effect
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.get("/test.bin").mock(
            side_effect=httpx.ConnectError("x" * 1000)
        )
        async with httpx.AsyncClient() as client:
            worker = SingleSegmentWorker(client, repo)
            await worker.run(task)

    assert task.status == DownloadStatus.FAILED
    assert task.error_message is not None
    assert len(task.error_message) <= 500
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/infrastructure/test_single_segment_worker.py -v --no-cov`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the worker**

Create `apps/api/src/dm_api/infrastructure/http/single_segment_worker.py`:

```python
"""Streaming single-segment download worker.

Downloads `task.url` in one streamed GET, writes chunks to `{file_name}.part`,
atomically renames to the final name on success, and updates the repository
periodically so polled progress is fresh.
"""
from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import aiofiles
import httpx

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

CHUNK_SIZE_BYTES = 512 * 1024            # 512 KB — balances syscall overhead vs progress granularity
PERSIST_EVERY_BYTES = 1024 * 1024        # 1 MB
PERSIST_EVERY_SECONDS = 1.0
ERROR_MESSAGE_MAX_LEN = 500


class SingleSegmentWorker:
    def __init__(
        self,
        client: httpx.AsyncClient,
        repo: DownloadRepository,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._repo = repo
        self._clock = clock

    async def run(self, task: DownloadTask) -> None:
        final_path = Path(task.save_path) / task.file_name
        part_path = final_path.with_suffix(final_path.suffix + ".part")
        try:
            final_path.parent.mkdir(parents=True, exist_ok=True)
            await self._download_to(part_path, task)
            part_path.rename(final_path)
            task.status = DownloadStatus.COMPLETED
            task.completed_at = self._clock()
            await self._repo.update(task)
        except Exception as exc:
            task.status = DownloadStatus.FAILED
            task.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
            try:
                await self._repo.update(task)
            except Exception:
                # If even the failure-mark write fails, swallow it — we already lost.
                pass

    async def _download_to(self, part_path: Path, task: DownloadTask) -> None:
        async with self._client.stream("GET", task.url) as response:
            response.raise_for_status()
            async with aiofiles.open(part_path, "wb") as f:
                last_persist_bytes = task.downloaded_size
                last_persist_ts = time.monotonic()
                async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE_BYTES):
                    await f.write(chunk)
                    task.downloaded_size += len(chunk)
                    now = time.monotonic()
                    if (
                        task.downloaded_size - last_persist_bytes >= PERSIST_EVERY_BYTES
                        or now - last_persist_ts >= PERSIST_EVERY_SECONDS
                    ):
                        await self._repo.update(task)
                        last_persist_bytes = task.downloaded_size
                        last_persist_ts = now
```

- [ ] **Step 4: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/infrastructure/test_single_segment_worker.py -v --no-cov`
Expected: 4 PASSED.

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dm_api/infrastructure/http/single_segment_worker.py \
        apps/api/tests/unit/infrastructure/test_single_segment_worker.py
git commit -m "feat(infrastructure): add SingleSegmentWorker (streaming download)"
```

---

## Task 8: `DownloadRunner` service

**Files:**
- Create: `apps/api/src/dm_api/application/services/__init__.py`
- Create: `apps/api/src/dm_api/application/services/download_runner.py`
- Create: `apps/api/tests/unit/application/test_download_runner.py`

Strict TDD.

- [ ] **Step 1: Create the services package**

```bash
mkdir -p apps/api/src/dm_api/application/services
touch apps/api/src/dm_api/application/services/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/tests/unit/application/test_download_runner.py`:

```python
"""DownloadRunner — wraps asyncio.create_task with lifecycle management."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from dm_api.application.services.download_runner import DownloadRunner
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
        status=DownloadStatus.DOWNLOADING,
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


async def test_spawn_creates_running_task() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)
    task = _make_task()

    runner.spawn(task)
    await runner.wait_idle()

    worker.run.assert_awaited_once_with(task)


async def test_spawn_multiple_tasks_all_run() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)

    runner.spawn(_make_task())
    runner.spawn(_make_task())
    runner.spawn(_make_task())
    await runner.wait_idle()

    assert worker.run.await_count == 3


async def test_wait_idle_with_no_tasks_returns_quickly() -> None:
    runner = DownloadRunner(worker_factory=lambda: AsyncMock())
    # Should not hang
    await asyncio.wait_for(runner.wait_idle(), timeout=1.0)


async def test_completed_tasks_are_removed() -> None:
    worker = AsyncMock()
    runner = DownloadRunner(worker_factory=lambda: worker)

    runner.spawn(_make_task())
    await runner.wait_idle()

    # Internal _tasks should be empty after completion
    assert len(runner._tasks) == 0  # noqa: SLF001 — testing internal state


async def test_worker_exception_does_not_kill_runner() -> None:
    class BadWorker:
        async def run(self, task: DownloadTask) -> None:
            raise RuntimeError("boom")

    runner = DownloadRunner(worker_factory=lambda: BadWorker())  # type: ignore[arg-type]
    runner.spawn(_make_task())
    # wait_idle should not raise even though the task failed
    await runner.wait_idle()
```

- [ ] **Step 3: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_download_runner.py -v --no-cov`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/dm_api/application/services/download_runner.py`:

```python
"""Tracks fire-and-forget asyncio tasks for in-flight downloads.

Keeps references to background tasks so the GC doesn't kill them; provides
`wait_idle()` so tests (and shutdown logic) can deterministically wait for
all running downloads to settle.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable

from dm_api.application.ports.segment_worker import SegmentWorker
from dm_api.domain.entities.download_task import DownloadTask


class DownloadRunner:
    def __init__(self, worker_factory: Callable[[], SegmentWorker]) -> None:
        self._worker_factory = worker_factory
        self._tasks: set[asyncio.Task[None]] = set()

    def spawn(self, task: DownloadTask) -> None:
        worker = self._worker_factory()
        bg = asyncio.create_task(worker.run(task), name=f"download-{task.id}")
        self._tasks.add(bg)
        bg.add_done_callback(self._tasks.discard)

    async def wait_idle(self) -> None:
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)
```

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_download_runner.py -v --no-cov`
Expected: 5 PASSED.

- [ ] **Step 6: Dependency-rule test still passes**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v --no-cov`
Expected: all PASS — DownloadRunner imports only stdlib + `dm_api.application.ports.*` + `dm_api.domain.*`.

- [ ] **Step 7: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/dm_api/application/services/ \
        apps/api/tests/unit/application/test_download_runner.py
git commit -m "feat(application): add DownloadRunner service for asyncio task lifecycle"
```

---

## Task 9: `StartDownloadUseCase`

**Files:**
- Create: `apps/api/src/dm_api/application/use_cases/start_download.py`
- Create: `apps/api/tests/unit/application/test_start_download.py`

Strict TDD.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/application/test_start_download.py`:

```python
"""StartDownloadUseCase tests with mocked ports."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from dm_api.application.ports.metadata_probe import FileMetadata
from dm_api.application.use_cases.start_download import (
    DestinationExistsError,
    DownloadNotFoundError,
    InvalidStateError,
    MetadataProbeError,
    StartDownloadUseCase,
)
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

_FIXED_NOW = datetime(2026, 5, 23, 12, 30, tzinfo=UTC)


def _make_pending_task(save_path: Path) -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://files.example.com/test.bin",
        file_name="test.bin",
        save_path=str(save_path),
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


def _make_use_case(
    repo: AsyncMock,
    metadata_probe: AsyncMock,
    runner: MagicMock,
) -> StartDownloadUseCase:
    return StartDownloadUseCase(
        repo=repo,
        metadata_probe=metadata_probe,
        runner=runner,
        clock=lambda: _FIXED_NOW,
    )


async def test_happy_path(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    metadata_probe = AsyncMock()
    metadata_probe.probe.return_value = FileMetadata(
        total_size=4096,
        accepts_ranges=True,
        suggested_filename=None,
    )
    runner = MagicMock()
    use_case = _make_use_case(repo, metadata_probe, runner)

    result = await use_case.execute(task.id)

    assert result.status == DownloadStatus.DOWNLOADING
    assert result.total_size == 4096
    assert result.resume_supported is False  # forced in 2b
    assert result.segment_count == 1         # forced in 2b
    assert result.started_at == _FIXED_NOW
    repo.update.assert_awaited_once()
    runner.spawn.assert_called_once_with(result)
    metadata_probe.probe.assert_awaited_once_with(task.url)


async def test_not_found_raises(tmp_path: Path) -> None:
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(DownloadNotFoundError):
        await use_case.execute(uuid4())


async def test_wrong_status_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    task.status = DownloadStatus.DOWNLOADING
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(InvalidStateError):
        await use_case.execute(task.id)


async def test_destination_exists_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    (tmp_path / "test.bin").write_bytes(b"already here")
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    use_case = _make_use_case(repo, AsyncMock(), MagicMock())

    with pytest.raises(DestinationExistsError):
        await use_case.execute(task.id)


async def test_probe_failure_marks_task_failed_and_raises(tmp_path: Path) -> None:
    task = _make_pending_task(tmp_path)
    repo = AsyncMock()
    repo.get_by_id.return_value = task
    metadata_probe = AsyncMock()
    metadata_probe.probe.side_effect = RuntimeError("dns nx")
    runner = MagicMock()
    use_case = _make_use_case(repo, metadata_probe, runner)

    with pytest.raises(MetadataProbeError):
        await use_case.execute(task.id)

    repo.update.assert_awaited_once()
    persisted = repo.update.await_args.args[0]
    assert persisted.status == DownloadStatus.FAILED
    assert persisted.error_message is not None
    assert "dns nx" in persisted.error_message
    runner.spawn.assert_not_called()
```

- [ ] **Step 2: Run to verify failure**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_start_download.py -v --no-cov`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the use case**

Create `apps/api/src/dm_api/application/use_cases/start_download.py`:

```python
"""StartDownloadUseCase — validates state, probes metadata, kicks off worker.

Pure async. Imports only domain + stdlib + sibling application ports/services.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from dm_api.application.ports.download_repository import DownloadRepository
from dm_api.application.ports.metadata_probe import MetadataProbe
from dm_api.application.services.download_runner import DownloadRunner
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus

_ERROR_MESSAGE_MAX_LEN = 500


class DownloadNotFoundError(LookupError):
    """The requested download id does not exist."""


class InvalidStateError(ValueError):
    """The download is not in PENDING state."""


class DestinationExistsError(ValueError):
    """A file already exists at the computed destination."""


class MetadataProbeError(RuntimeError):
    """Metadata HEAD/GET probe failed. The task has been marked FAILED."""


class StartDownloadUseCase:
    def __init__(
        self,
        repo: DownloadRepository,
        metadata_probe: MetadataProbe,
        runner: DownloadRunner,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repo
        self._metadata_probe = metadata_probe
        self._runner = runner
        self._clock = clock

    async def execute(self, id: UUID) -> DownloadTask:
        task = await self._repo.get_by_id(id)
        if task is None:
            raise DownloadNotFoundError(f"download {id} not found")
        if task.status != DownloadStatus.PENDING:
            raise InvalidStateError(
                f"download {id} is in status {task.status.value}, must be pending"
            )
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
        task.resume_supported = False         # forced in 2b — multi-segment is Phase 3
        task.segment_count = 1                # forced in 2b
        task.status = DownloadStatus.DOWNLOADING
        task.started_at = self._clock()
        await self._repo.update(task)

        self._runner.spawn(task)
        return task
```

- [ ] **Step 4: Run tests**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_start_download.py -v --no-cov`
Expected: 5 PASSED.

- [ ] **Step 5: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 6: Dependency-rule test still passes**

Run from `apps/api/`: `uv run pytest tests/unit/application/test_dependency_rule.py -v --no-cov`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dm_api/application/use_cases/start_download.py \
        apps/api/tests/unit/application/test_start_download.py
git commit -m "feat(application): add StartDownloadUseCase"
```

---

## Task 10: Wire `app.py` lifespan + exception handlers

**Files:**
- Modify: `apps/api/src/dm_api/presentation/app.py`

This task only changes `app.py`. The new endpoint is added in Task 11.

- [ ] **Step 1: Update `app.py`**

Replace the entire contents of `apps/api/src/dm_api/presentation/app.py` with:

```python
"""FastAPI app factory + lifespan.

Lifespan responsibilities (in order):
1. Resolve the database URL (env var or platform default).
2. Ensure the data directory exists.
3. Run `alembic upgrade head` to make sure the schema is current.
4. Open a shared httpx.AsyncClient.
5. Instantiate repository, event bus, metadata probe, worker factory, runner,
   and the four use cases.
6. Stash them on `app.state` so routers can pick them up.
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
from fastapi.responses import JSONResponse

from dm_api.application.services.download_runner import DownloadRunner
from dm_api.application.use_cases.add_download import (
    AddDownloadUseCase,
    InvalidUrlError,
)
from dm_api.application.use_cases.get_download import (
    GetDownloadUseCase,
    ListDownloadsUseCase,
)
from dm_api.application.use_cases.start_download import (
    DestinationExistsError,
    DownloadNotFoundError,
    InvalidStateError,
    MetadataProbeError,
    StartDownloadUseCase,
)
from dm_api.infrastructure.events.in_memory_event_bus import InMemoryEventBus
from dm_api.infrastructure.http.http_client import create_http_client
from dm_api.infrastructure.http.httpx_metadata_probe import HttpxMetadataProbe
from dm_api.infrastructure.http.single_segment_worker import SingleSegmentWorker
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

    async with create_http_client() as http_client:
        metadata_probe = HttpxMetadataProbe(http_client)

        def _worker_factory() -> SingleSegmentWorker:
            return SingleSegmentWorker(http_client, repo)

        runner = DownloadRunner(_worker_factory)

        app.state.repo = repo
        app.state.event_bus = event_bus
        app.state.http_client = http_client
        app.state.metadata_probe = metadata_probe
        app.state.runner = runner
        app.state.add_download = AddDownloadUseCase(repo=repo, event_bus=event_bus)
        app.state.get_download = GetDownloadUseCase(repo=repo)
        app.state.list_downloads = ListDownloadsUseCase(repo=repo)
        app.state.start_download = StartDownloadUseCase(
            repo=repo,
            metadata_probe=metadata_probe,
            runner=runner,
        )

        yield


def create_app() -> FastAPI:
    app = FastAPI(title="dm-api", version="0.2.0", lifespan=lifespan)

    @app.exception_handler(InvalidUrlError)
    async def _invalid_url_handler(request, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(DownloadNotFoundError)
    async def _not_found_handler(request, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidStateError)
    async def _invalid_state_handler(request, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(DestinationExistsError)
    async def _dest_exists_handler(request, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(MetadataProbeError)
    async def _probe_error_handler(request, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    from dm_api.presentation.routers import downloads, health
    app.include_router(health.router)
    app.include_router(downloads.router)

    return app
```

- [ ] **Step 2: Verify the module still imports cleanly**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.presentation.app import create_app; app = create_app(); print(type(app).__name__, app.title, app.version)"
```
Expected: prints `FastAPI dm-api 0.2.0`.

- [ ] **Step 3: Run the full test suite — Phase 2a tests must still pass**

Run from `apps/api/`: `uv run pytest --no-cov`
Expected: all existing tests pass (no regressions). The new `StartDownloadUseCase` unit tests added in T9 also pass.

- [ ] **Step 4: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/presentation/app.py
git commit -m "feat(presentation): wire httpx client, runner, and start use case into lifespan"
```

---

## Task 11: Add `POST /api/downloads/{id}/start` endpoint

**Files:**
- Modify: `apps/api/src/dm_api/presentation/routers/downloads.py`

Tested through the integration test added in Task 12.

- [ ] **Step 1: Add the route**

Replace the entire contents of `apps/api/src/dm_api/presentation/routers/downloads.py` with:

```python
"""REST endpoints for download tasks.

Phase 2a added create + read endpoints. Phase 2b adds /start to kick off the
actual download. Pause/resume/cancel come in later phases.
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


@router.post("/{id}/start", status_code=202, response_model=DownloadDTO)
async def start_download(request: Request, id: UUID) -> DownloadDTO:
    task = await request.app.state.start_download.execute(id)
    return DownloadDTO.from_entity(task)
```

- [ ] **Step 2: Verify importable**

Run from `apps/api/`:
```bash
uv run python -c "from dm_api.presentation.routers.downloads import router; print(len(router.routes), 'routes')"
```
Expected: `4 routes`.

- [ ] **Step 3: Existing Phase 2a integration tests still pass**

Run from `apps/api/`: `uv run pytest tests/integration/test_api_routes.py -v --no-cov`
Expected: all 9 existing tests PASS (the new `/start` route doesn't break the others).

- [ ] **Step 4: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dm_api/presentation/routers/downloads.py
git commit -m "feat(presentation): add POST /api/downloads/{id}/start endpoint"
```

---

## Task 12: `static_file_server` fixture + real-download integration test

**Files:**
- Modify: `apps/api/tests/conftest.py` (append fixture)
- Create: `apps/api/tests/integration/test_real_download.py`

- [ ] **Step 1: Add the `static_file_server` fixture**

Append the following to `apps/api/tests/conftest.py`:

```python


# ============================================================
# Phase 2b — integration test fixture
# ============================================================
import threading
from collections.abc import Iterator
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest


class _StaticServer:
    def __init__(self, base_url: str, root_dir: Path) -> None:
        self.base_url = base_url
        self.root_dir = root_dir


@pytest.fixture
def static_file_server(tmp_path: Path) -> Iterator[_StaticServer]:
    """Spin up a stdlib http.server on a random localhost port serving tmp_path.

    Yields a _StaticServer with `.base_url` and `.root_dir`. Stops the server
    on teardown.
    """
    serve_dir = tmp_path / "static"
    serve_dir.mkdir()

    class _Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            super().__init__(*args, directory=str(serve_dir), **kwargs)

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            # Silence stdout during tests
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.daemon_threads = True
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield _StaticServer(base_url=f"http://127.0.0.1:{port}", root_dir=serve_dir)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        with closing(server):
            pass
```

- [ ] **Step 2: Write the integration test**

Create `apps/api/tests/integration/test_real_download.py`:

```python
"""End-to-end download test using stdlib http.server + the real FastAPI app."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("DM_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    from dm_api.presentation.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:  # noqa: SIM117
        async with app.router.lifespan_context(app):
            ac.app_state = app.state  # type: ignore[attr-defined]
            yield ac


@pytest.mark.integration
async def test_real_download_end_to_end(
    client: AsyncClient, static_file_server, tmp_path: Path
) -> None:
    # Create a 256 KB file on the static server
    payload = b"x" * (256 * 1024)
    file_on_server = static_file_server.root_dir / "data.bin"
    file_on_server.write_bytes(payload)

    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/data.bin"

    # Create
    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    assert create_resp.status_code == 201
    download_id = create_resp.json()["id"]

    # Start
    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 202
    assert start_resp.json()["status"] == "downloading"

    # Wait for background worker to finish
    await client.app_state.runner.wait_idle()  # type: ignore[attr-defined]

    # Verify
    final_resp = await client.get(f"/api/downloads/{download_id}")
    body = final_resp.json()
    assert body["status"] == "completed"
    assert body["downloaded_size"] == len(payload)

    downloaded_file = save_dir / "data.bin"
    assert downloaded_file.exists()
    assert downloaded_file.read_bytes() == payload
    assert not (save_dir / "data.bin.part").exists()


@pytest.mark.integration
async def test_404_url_marks_failed(
    client: AsyncClient, static_file_server, tmp_path: Path
) -> None:
    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/nope.bin"

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    assert create_resp.status_code == 201
    download_id = create_resp.json()["id"]

    # Start — probe will get 404, task should be FAILED, /start returns 502
    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 502

    final_resp = await client.get(f"/api/downloads/{download_id}")
    body = final_resp.json()
    assert body["status"] == "failed"
    assert body["error_message"] is not None


@pytest.mark.integration
async def test_start_already_running_returns_409(
    client: AsyncClient, static_file_server, tmp_path: Path
) -> None:
    # Set up a download that's already DOWNLOADING (use 256 KB so we don't race)
    payload = b"y" * (256 * 1024)
    (static_file_server.root_dir / "slow.bin").write_bytes(payload)

    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/slow.bin"

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    download_id = create_resp.json()["id"]

    first_start = await client.post(f"/api/downloads/{download_id}/start")
    assert first_start.status_code == 202

    # Second /start should 409 — status is DOWNLOADING (or COMPLETED if it finished too fast)
    second_start = await client.post(f"/api/downloads/{download_id}/start")
    assert second_start.status_code == 409

    # Let the original complete
    await client.app_state.runner.wait_idle()  # type: ignore[attr-defined]


@pytest.mark.integration
async def test_start_with_existing_destination_returns_409(
    client: AsyncClient, static_file_server, tmp_path: Path
) -> None:
    payload = b"z" * 1024
    (static_file_server.root_dir / "blocked.bin").write_bytes(payload)

    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    # Pre-create the destination
    (save_dir / "blocked.bin").write_bytes(b"existing content")

    url = f"{static_file_server.base_url}/blocked.bin"

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    download_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 409


@pytest.mark.integration
async def test_start_unknown_id_returns_404(client: AsyncClient) -> None:
    from uuid import uuid4

    start_resp = await client.post(f"/api/downloads/{uuid4()}/start")
    assert start_resp.status_code == 404
```

- [ ] **Step 3: Run the integration tests**

Run from `apps/api/`: `uv run pytest tests/integration/test_real_download.py -v --no-cov`
Expected: 5 PASSED.

- [ ] **Step 4: Run the full suite**

Run from `apps/api/`: `uv run pytest --no-cov`
Expected: all tests pass — Phase 1 + 2a + 2b unit + integration (~190+ tests).

- [ ] **Step 5: Coverage check**

Run from `apps/api/`: `uv run pytest`
Expected: combined `domain + application` coverage still ≥ 90%.

- [ ] **Step 6: ruff + mypy**

```bash
uv run ruff check .
uv run mypy --strict src/dm_api/domain src/dm_api/application
```
Both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/tests/conftest.py apps/api/tests/integration/test_real_download.py
git commit -m "test(integration): add real-download tests with stdlib http.server fixture"
```

---

## Task 13: README update + Big Buck Bunny live smoke test

**Files:**
- Modify: `apps/api/README.md`

- [ ] **Step 1: Update the README**

Replace the entire contents of `apps/api/README.md` with:

```markdown
# dm-api — Download Manager Backend

Phase 2b ships real downloads. `POST /api/downloads/{id}/start` triggers an
async background fetch via httpx + aiofiles; bytes are streamed to disk at
`{save_path}/{file_name}.part` and atomically renamed on completion.

## Quickstart

```bash
cd apps/api
uv sync                                          # install deps
uv run ruff check                                # lint
uv run mypy --strict src/dm_api/domain src/dm_api/application
uv run pytest                                    # unit + integration tests
uv run alembic upgrade head                      # create the SQLite DB
uv run python -m dm_api.presentation.main        # boot the API on 127.0.0.1:6543
```

In another shell — full end-to-end demo:

```bash
ID=$(curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"}' \
    | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

curl -s -X POST http://127.0.0.1:6543/api/downloads/$ID/start | python -m json.tool

# Poll progress
while true; do
  curl -s http://127.0.0.1:6543/api/downloads/$ID | python -m json.tool
  sleep 2
done
```

When `status` becomes `"completed"`, the file is at `~/Downloads/BigBuckBunny_320x180.mp4`.

## Layout

```
src/dm_api/
├── domain/                       # pure-Python, framework-free
├── application/                  # ports + use cases + services
│   ├── ports/
│   │   ├── download_repository.py
│   │   ├── event_bus.py
│   │   ├── metadata_probe.py
│   │   └── segment_worker.py
│   ├── use_cases/
│   │   ├── add_download.py
│   │   ├── get_download.py
│   │   └── start_download.py
│   └── services/
│       └── download_runner.py
├── infrastructure/
│   ├── events/
│   │   └── in_memory_event_bus.py
│   ├── http/                     # Phase 2b
│   │   ├── http_client.py
│   │   ├── httpx_metadata_probe.py
│   │   └── single_segment_worker.py
│   └── persistence/
│       ├── sqlite_download_repository.py
│       └── migrations/
└── presentation/
    ├── app.py
    ├── main.py
    ├── routers/
    │   ├── health.py
    │   └── downloads.py
    └── schemas/
        └── download_dto.py
```

## API surface

| Method | Path | Description |
|---|---|---|
| GET | /api/health | Liveness + active-downloads count |
| POST | /api/downloads | Create a download (status=pending) |
| GET | /api/downloads/{id} | Fetch one |
| GET | /api/downloads | List newest-first |
| POST | /api/downloads/{id}/start | Begin async download (returns 202) |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Server bind (loopback only — enforced at startup) |
| `DM_API_PORT` | `6543` | Server port |
| `DM_DATABASE_URL` | derived | Full SQLAlchemy URL (used by tests) |
| `DM_DATA_DIR` | platform default | Directory for `app.db` |

## Dependency rules

- `domain/` may import stdlib + sibling `domain` only
- `application/` may import stdlib + `domain` + sibling `application` only
- `infrastructure/` and `presentation/` may import anything

Enforced by static AST tests in `tests/unit/test_dependency_rule.py` and
`tests/unit/application/test_dependency_rule.py`.
```

- [ ] **Step 2: Boot the server**

Run from `apps/api/`:
```bash
uv run python -m dm_api.presentation.main > /tmp/api.log 2>&1 &
echo $! > /tmp/api.pid
sleep 3
```

- [ ] **Step 3: Smoke-test against Big Buck Bunny**

Run:
```bash
ID=$(curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"}' \
    | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Created download: $ID"

curl -s -X POST http://127.0.0.1:6543/api/downloads/$ID/start | python -m json.tool

# Poll up to 90 seconds for completion
for _ in $(seq 1 45); do
  STATUS=$(curl -s http://127.0.0.1:6543/api/downloads/$ID | python -c "import sys,json;print(json.load(sys.stdin)['status'])")
  echo "Status: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done
```

Expected: final status `completed`. The file should be at `~/Downloads/BigBuckBunny_320x180.mp4` and be ~64 MB.

Verify:
```bash
ls -lh ~/Downloads/BigBuckBunny_320x180.mp4
```
Expected: file exists, size around 63-65 MB.

- [ ] **Step 4: Stop the server**

```bash
kill $(cat /tmp/api.pid) 2>/dev/null
wait $(cat /tmp/api.pid) 2>/dev/null
rm -f /tmp/api.pid
```

- [ ] **Step 5: Commit the README**

```bash
git add apps/api/README.md
git commit -m "docs(api): update README for phase 2b downloads"
```

- [ ] **Step 6: Final repo verification**

Run from repo root:
```bash
git log --oneline | head -25
git status
```
Expected: a clean Phase 2b commit chain on top of Phase 2a; working tree clean.

---

## Phase 2b Definition of Done — verify all true

- [ ] `uv sync` installs `aiofiles` and `respx`
- [ ] `uv run ruff check` green
- [ ] `uv run mypy --strict src/dm_api/domain src/dm_api/application` green
- [ ] `uv run pytest` green; combined `domain + application` coverage ≥90%
- [ ] `POST /api/downloads/{id}/start` returns 202 with `status=downloading`
- [ ] Big Buck Bunny (~64 MB) downloads end-to-end via curl; file lands at `~/Downloads/BigBuckBunny_320x180.mp4`
- [ ] During download, `GET /api/downloads/{id}` shows `downloaded_size` increasing
- [ ] HTTP 404 URL → status ends FAILED, error_message populated, /start returns 502
- [ ] Already-DOWNLOADING task → /start returns 409
- [ ] Destination already exists → /start returns 409
- [ ] Unknown id → /start returns 404
- [ ] No leftover `.part` files after successful completion
- [ ] Application-layer dependency-rule test still passes
- [ ] `apps/api/README.md` reflects Phase 2b
