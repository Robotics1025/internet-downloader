---
title: Phase 2b — Single-File Downloader
date: 2026-05-23
status: approved
project: download-manager
phase: 2b of 8
references:
  - SYSTEM_DESIGN.md
  - SKILL.md
  - docs/superpowers/specs/2026-05-22-phase-1-foundation-design.md
  - docs/superpowers/specs/2026-05-23-phase-2a-persistence-api-design.md
---

# Phase 2b — Single-File Downloader

## 1. Goal

`POST /api/downloads/{id}/start` triggers an async background download of the file at `task.url`. Bytes are streamed to disk at `{save_path}/{file_name}`. Polling `GET /api/downloads/{id}` shows live progress. Status transitions `PENDING → DOWNLOADING → COMPLETED` (or `FAILED`).

**Definition of done (binary):**
- `uv sync` installs the new dependencies (`aiofiles`, `respx`)
- All Phase 2a gates still green (ruff, mypy --strict, pytest, coverage ≥ 90%)
- A real 64 MB file (Big Buck Bunny) downloads end-to-end against the running server
- During download, `GET /api/downloads/{id}` shows `downloaded_size` increasing
- HTTP 404 URL → task ends `FAILED` with `error_message` populated
- Already-`DOWNLOADING` task → 409
- Destination file already exists → 409
- `.part` file correctly renamed to final on completion (no leftover `.part`)
- `httpx.AsyncClient` is opened in the lifespan and closed on shutdown

No retries, no resume, no WebSocket, no multi-segment, no UI. Those are 2c+.

## 2. Scope

### In scope
- Application port `MetadataProbe` + use case `StartDownloadUseCase`
- Application service `DownloadRunner` (manages `asyncio.create_task` lifecycle)
- Infrastructure: `HttpxMetadataProbe`, `SingleSegmentWorker`, `http_client` factory wired into lifespan
- New repository method `DownloadRepository.update(task)` + SQLite implementation
- Presentation: `POST /api/downloads/{id}/start` endpoint, lifespan additions, exception → HTTP mapping
- Tests: unit tests with `respx`, integration test using stdlib `http.server` against real bytes
- `aiofiles` + `respx` added to `pyproject.toml`

### Out of scope (deferred to later sub-phases)
- HTTP Range requests / multi-segment / parallelism → Phase 3
- Pause / resume / cancel / retry use cases → later in Phase 2 series
- `ProgressService` / `/ws/progress` WebSocket → Phase 2c
- `RetryPolicy` wired into worker → Phase 2c
- Checksum verification after rename → Phase 2c
- Startup recovery of orphaned `.part` files or in-flight `DOWNLOADING` tasks → Phase 2c
- Speed limits / token bucket → Phase 7
- SSRF protections / private-IP filters → Phase 8

## 3. Repository Layout (additions only)

```
apps/api/src/dm_api/
├── application/
│   ├── ports/
│   │   └── metadata_probe.py           ← NEW
│   ├── use_cases/
│   │   └── start_download.py           ← NEW
│   └── services/                       ← NEW package
│       ├── __init__.py
│       └── download_runner.py
├── infrastructure/
│   └── http/                           ← NEW package
│       ├── __init__.py
│       ├── http_client.py              ← create_http_client() factory
│       ├── httpx_metadata_probe.py
│       └── single_segment_worker.py
└── presentation/
    ├── app.py                          ← MODIFIED (lifespan: http_client, runner, new use case)
    └── routers/
        └── downloads.py                ← MODIFIED (POST /{id}/start + exception handlers)

apps/api/src/dm_api/application/ports/download_repository.py   ← MODIFIED (add update())
apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py  ← MODIFIED (add update())

apps/api/tests/
├── unit/application/
│   └── test_start_download.py          ← NEW
├── unit/infrastructure/                ← NEW package
│   ├── __init__.py
│   ├── test_httpx_metadata_probe.py
│   └── test_single_segment_worker.py
├── integration/
│   ├── test_sqlite_download_repository.py  ← MODIFIED (add update() coverage)
│   └── test_real_download.py           ← NEW (stdlib http.server)
```

## 4. New Application Layer Pieces

### 4.1 `MetadataProbe` port

```python
@dataclass(frozen=True)
class FileMetadata:
    total_size: int | None          # None if Content-Length missing
    accepts_ranges: bool            # True if Accept-Ranges: bytes
    suggested_filename: str | None  # From Content-Disposition, if any


class MetadataProbe(Protocol):
    async def probe(self, url: str) -> FileMetadata: ...
```

Errors during probing surface as a custom exception in `start_download.py` (`MetadataProbeError`); the infrastructure impl itself raises `RuntimeError` subclasses.

### 4.2 `DownloadRepository` extension

Add one method to the existing port:

```python
async def update(self, task: DownloadTask) -> None: ...
```

Semantics: full-row UPDATE WHERE id = task.id. Raises `LookupError` if no row matches. `save` still means INSERT (separate concern; we do not auto-upsert).

### 4.3 `StartDownloadUseCase`

```python
class DownloadNotFoundError(LookupError): pass
class InvalidStateError(ValueError): pass
class DestinationExistsError(ValueError): pass
class MetadataProbeError(RuntimeError): pass


class StartDownloadUseCase:
    def __init__(
        self,
        repo: DownloadRepository,
        metadata_probe: MetadataProbe,
        runner: "DownloadRunner",
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None: ...

    async def execute(self, id: UUID) -> DownloadTask:
        task = await self._repo.get_by_id(id)
        if task is None:
            raise DownloadNotFoundError(...)
        if task.status != DownloadStatus.PENDING:
            raise InvalidStateError(...)
        destination = Path(task.save_path) / task.file_name
        if destination.exists():
            raise DestinationExistsError(...)
        try:
            metadata = await self._metadata_probe.probe(task.url)
        except Exception as exc:
            task.status = DownloadStatus.FAILED
            task.error_message = f"metadata probe failed: {exc}"[:500]
            await self._repo.update(task)
            raise MetadataProbeError(...) from exc
        task.total_size = metadata.total_size
        task.resume_supported = False     # forced in 2b
        task.segment_count = 1            # forced in 2b
        task.status = DownloadStatus.DOWNLOADING
        task.started_at = self._clock()
        await self._repo.update(task)
        self._runner.spawn(task)
        return task
```

The `clock` parameter is injected for deterministic tests.

### 4.4 `DownloadRunner` service

A thin wrapper around `asyncio.create_task` that holds task references so they aren't GC'd. The constructor takes a factory function that produces a fresh worker per call — keeps testing pluggable.

```python
class DownloadRunner:
    def __init__(
        self,
        worker_factory: Callable[[], SingleSegmentWorker],
    ) -> None:
        self._worker_factory = worker_factory
        self._tasks: set[asyncio.Task[None]] = set()

    def spawn(self, task: DownloadTask) -> None:
        worker = self._worker_factory()
        bg = asyncio.create_task(worker.run(task), name=f"download-{task.id}")
        self._tasks.add(bg)
        bg.add_done_callback(self._tasks.discard)

    async def wait_idle(self) -> None:
        # For tests: await all in-flight tasks.
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)
```

`wait_idle()` exists so integration tests can deterministically wait for completion without sleep loops.

## 5. Infrastructure Layer

### 5.1 `http_client.py`

```python
def create_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        follow_redirects=True,
        headers={"User-Agent": "dm-api/0.2.0 (+local)"},
    )
```

Returns an unstarted client; the lifespan opens it via `async with` (i.e. uses it as a context manager) and closes on shutdown.

### 5.2 `HttpxMetadataProbe`

```python
class HttpxMetadataProbe:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def probe(self, url: str) -> FileMetadata:
        # Try HEAD first
        try:
            response = await self._client.head(url)
            if response.status_code == 405:
                raise _HeadNotAllowed()
            response.raise_for_status()
            return self._parse(response)
        except _HeadNotAllowed:
            pass

        # Fallback: GET with stream=True and close immediately after reading headers
        async with self._client.stream("GET", url) as response:
            response.raise_for_status()
            return self._parse(response)

    def _parse(self, response: httpx.Response) -> FileMetadata:
        content_length = response.headers.get("content-length")
        total_size = int(content_length) if content_length is not None else None
        accepts_ranges = response.headers.get("accept-ranges", "").lower() == "bytes"
        suggested_filename = _parse_content_disposition(response.headers.get("content-disposition"))
        return FileMetadata(
            total_size=total_size,
            accepts_ranges=accepts_ranges,
            suggested_filename=suggested_filename,
        )
```

`_parse_content_disposition` handles RFC 6266: `filename="x.zip"` and `filename*=UTF-8''x%20y.zip` forms. Returns `None` if header is missing or unparseable.

### 5.3 `SingleSegmentWorker`

```python
CHUNK_SIZE_BYTES = 512 * 1024            # 512 KB
PERSIST_EVERY_BYTES = 1024 * 1024        # 1 MB
PERSIST_EVERY_SECONDS = 1.0


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
            task.error_message = str(exc)[:500]
            await self._repo.update(task)
            # Intentionally leave .part on disk; future phases may resume.

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

Notes:
- `aiter_bytes(chunk_size=CHUNK_SIZE_BYTES)` — explicit size for predictable test behavior
- `aiofiles.open` uses the default thread pool; acceptable for Phase 2b's single-stream throughput
- `error_message` truncated to 500 chars so we don't store full HTTP response bodies

## 6. Presentation Layer Changes

### 6.1 `app.py` lifespan additions

```python
async with create_http_client() as http_client:
    metadata_probe = HttpxMetadataProbe(http_client)

    def _worker_factory() -> SingleSegmentWorker:
        return SingleSegmentWorker(http_client, repo)

    runner = DownloadRunner(_worker_factory)

    app.state.http_client = http_client
    app.state.metadata_probe = metadata_probe
    app.state.runner = runner
    app.state.start_download = StartDownloadUseCase(
        repo=repo,
        metadata_probe=metadata_probe,
        runner=runner,
    )

    yield
```

The `async with create_http_client()` ensures the client is closed on shutdown — including when an integration test exits the lifespan context.

Exception handlers added to `create_app()`:

```python
@app.exception_handler(DownloadNotFoundError)
async def _not_found(request, exc):
    return JSONResponse(status_code=404, content={"detail": str(exc)})

@app.exception_handler(InvalidStateError)
async def _invalid_state(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})

@app.exception_handler(DestinationExistsError)
async def _dest_exists(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})

@app.exception_handler(MetadataProbeError)
async def _probe_failed(request, exc):
    return JSONResponse(status_code=502, content={"detail": str(exc)})
```

### 6.2 `downloads.py` route addition

```python
@router.post("/{id}/start", status_code=202, response_model=DownloadDTO)
async def start_download(request: Request, id: UUID) -> DownloadDTO:
    task = await request.app.state.start_download.execute(id)
    return DownloadDTO.from_entity(task)
```

The `status_code=202` advertises "request accepted, work continues asynchronously." Even though the response carries the updated DownloadDTO, the actual file transfer is still in flight when the response is sent.

## 7. New Dependencies

Added to `apps/api/pyproject.toml`:

- **Runtime:** `aiofiles>=24` — async file I/O for the worker
- **Dev:** `respx>=0.21` — httpx request mocking for unit tests

## 8. Tests

### 8.1 Test inventory

| File | What it proves |
|---|---|
| `tests/unit/application/test_start_download.py` | Happy path; not-found → DownloadNotFoundError; wrong status → InvalidStateError; destination exists → DestinationExistsError; probe failure marks FAILED in DB and raises MetadataProbeError; runner.spawn called exactly once; status/total_size/started_at all updated; clock injection works (deterministic timestamps). All mocked. |
| `tests/unit/infrastructure/test_httpx_metadata_probe.py` | `respx`-mocked: HEAD with Content-Length + Accept-Ranges → correct FileMetadata; HEAD 405 → GET fallback; Content-Disposition (`filename="x.zip"`) parsed; RFC 6266 `filename*` parsed; missing Content-Length → `total_size=None`; HTTP error → exception. |
| `tests/unit/infrastructure/test_single_segment_worker.py` | `respx`-mocked: streamed bytes written to `.part`; `.part` renamed to final on success; status COMPLETED + completed_at set; HTTP 404 → FAILED with error_message; persist called at correct chunk thresholds (using `respx` + countable repo mock); `error_message` truncated to 500 chars. |
| `tests/integration/test_sqlite_download_repository.py` (extended) | New tests for `update()`: round-trip after status change; raises LookupError on unknown ID; preserves all fields. |
| `tests/integration/test_real_download.py` | Stdlib `http.server` on `127.0.0.1:0` serving a 256 KB fixed-content file → POST /api/downloads → POST /{id}/start → poll until COMPLETED via `runner.wait_idle()` → assert downloaded file matches source byte-for-byte. Also: a 404 endpoint → status ends FAILED. Also: starting an already-DOWNLOADING task → 409. |

### 8.2 Test fixtures

Extend `tests/conftest.py` to provide:
- `static_file_server(tmp_path)` — yields `(base_url, root_dir)`; starts a stdlib `http.server.ThreadingHTTPServer` on a random port serving files from `root_dir`. Stops on teardown.
- `client_with_runner` — same as Phase 2a's `client` fixture but exposes `app.state.runner.wait_idle()` so tests can await background completion.

(These also address the Phase 2a follow-up that integration test fixtures were duplicated across files.)

### 8.3 Coverage gate

Stay at `--cov-fail-under=90` over the combined `domain + application` scope. The new code in `infrastructure/http/` is not in the strict-mypy scope and not in the coverage scope by design — it's tested via integration.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Background task swallows exceptions silently | `worker.run()` wraps everything in try/except and marks FAILED. Runner adds a done-callback for logging/visibility. |
| `httpx.AsyncClient` must be created inside the event loop | Created in `lifespan` via `async with create_http_client()` — happens on the event loop. |
| Atomic rename across filesystems fails | `final_path` and `.part` are siblings in the same directory by construction → guaranteed atomic. |
| `.part` files accumulate from failed downloads | Acceptable in 2b. Phase 2c will scan for orphans on startup. |
| Large `error_message` from server pollutes DB | Truncated to 500 chars in worker exception handler. |
| aiosqlite connection-per-call cost under high persist frequency | Persist throttled to ≤ 1 per 1 MB or 1 second — well below saturating aiosqlite. |
| stdlib `http.server` slow / leaky in tests | Use `ThreadingHTTPServer` with `daemon_threads=True` and explicit `shutdown()` in fixture teardown. |
| `respx` v0.21+ requires httpx ≥ 0.27 | We already pin `httpx>=0.27` from Phase 2a — confirmed compatible. |

## 10. Acceptance Checklist

- [ ] `uv sync` installs `aiofiles` and `respx` cleanly
- [ ] `uv run ruff check` exits 0
- [ ] `uv run mypy --strict src/dm_api/domain src/dm_api/application` exits 0
- [ ] `uv run pytest` exits 0; combined domain + application coverage ≥ 90%
- [ ] `POST /api/downloads/{id}/start` on a PENDING task returns 202 with DownloadDTO showing `status=downloading`
- [ ] Big Buck Bunny URL (~64 MB) downloads successfully end-to-end; file lands at `~/Downloads/BigBuckBunny_320x180.mp4`; status transitions to COMPLETED
- [ ] During download, `GET /api/downloads/{id}` shows `downloaded_size` increasing on subsequent polls
- [ ] HTTP 404 URL → task ends FAILED with `error_message` populated
- [ ] Starting an already-DOWNLOADING task → 409
- [ ] Starting with destination already existing → 409
- [ ] `.part` file is correctly renamed on completion (no leftover `.part`)
- [ ] `httpx.AsyncClient` is closed on shutdown (verified via lifespan exit)
- [ ] Application-layer dependency-rule test still passes (no new forbidden imports leaked into `application/`)
- [ ] `tests/conftest.py` provides a `static_file_server` fixture that other integration tests can reuse

## 11. Next Phase Hook (Phase 2c preview)

Phase 2c adds:
- `application/services/progress_service.py` — rolling 3-second speed window, ETA calculation
- WebSocket gateway at `/ws/progress`, emits `ProgressSnapshot` events
- `RetryPolicy` wired into `SingleSegmentWorker` — caught exceptions retry per `RetryPolicy.next_delay_seconds`
- Startup scan: any task in `DOWNLOADING` status at boot is marked FAILED (no resume yet — that's Phase 3)
- `ChecksumPolicy` invoked after rename when server provided one
- `runner.spawn` returns a handle so use cases can await; tests get deterministic completion without `wait_idle`
