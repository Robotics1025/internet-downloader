---
name: download-manager
description: >
  Development skill for the Clean Architecture Download Manager project (open source, local desktop app).
  Use this skill whenever working on any part of this project including: domain entities, use cases,
  FastAPI API routes, SQLite schema or Alembic migrations, segment workers, file merger, progress
  service, WebSocket events, Electron shell or preload scripts, React UI components, browser extension
  (Manifest V3), queue/scheduler logic, retry/checksum policies, security controls, or testing any of
  the above. Trigger this skill for any code generation, code review, debugging, or architecture
  question related to this download manager.
---

# Download Manager Development Skill

Open source, local-only desktop download manager.
**Stack:** Electron + React + TypeScript · Python FastAPI · SQLite + Alembic · Manifest V3

---

## Project Layout (Quick Reference)

```
apps/
  desktop/
    electron/         main.ts · preload.ts · ipc-handlers.ts
    renderer/src/     components/ · hooks/ · stores/ · App.tsx
  api/
    presentation/     routers/ · websocket/ · schemas/
    application/      use_cases/ · ports/ · services/
    domain/           entities/ · value_objects/ · policies/ · events/
    infrastructure/   http/ · persistence/ · events/ · os/
    tests/            unit/ · use_cases/ · integration/ · security/
  browser-extension/  background.js · popup.* · content.js · manifest.json
docs/
SYSTEM_DESIGN.md      ← full reference, read this first for any architectural question
```

Full folder structure and all design decisions are in **SYSTEM_DESIGN.md**.

---

## Core Architecture Rules

1. **Dependency rule:** imports always point inward. Domain → nothing external. Application → domain only. Infrastructure → application interfaces (ports).
2. **Domain layer is pure Python.** No FastAPI, SQLite, httpx, or OS imports inside `domain/`.
3. **Use cases coordinate, never do I/O directly.** They call ports (interfaces). Infrastructure implements ports.
4. **No authentication.** This is open source and local-only. Do not add token validation or user accounts.
5. **API binds to 127.0.0.1:6543 only.** Never `0.0.0.0`.

---

## Key Domain Types

### DownloadStatus (enum)
`PENDING · QUEUED · DOWNLOADING · PAUSED · MERGING · COMPLETED · FAILED · CANCELLED`

### SegmentStatus (enum)
`PENDING · DOWNLOADING · COMPLETED · FAILED · RETRYING`

### DownloadTask (entity)
`id, url, file_name, save_path, total_size, downloaded_size, status, resume_supported, segment_count, category, speed_limit, checksum, checksum_algorithm, error_message, created_at, started_at, completed_at`

### DownloadSegment (entity)
`id, download_id, segment_index, start_byte, end_byte, downloaded_bytes, temp_file_path, status, retry_count, last_error`

---

## Use Cases (Application Layer)

| Use Case | Key Steps |
|---|---|
| AddDownloadUseCase | Validate URL → MetadataProbe → SegmentationPolicy → Create entities → Save → Queue |
| StartDownloadUseCase | Load task → Apply policy → Spawn workers → Start ProgressService |
| PauseDownloadUseCase | Signal workers to stop → Persist byte positions → Keep .part files |
| ResumeDownloadUseCase | Load incomplete segments → Resume from saved position |
| CancelDownloadUseCase | Stop workers → Delete .part files → Mark CANCELLED |
| RetryDownloadUseCase | Check RetryPolicy → Reset failed segments → Re-start |
| DeleteDownloadUseCase | Stop if active → Delete .part files and DB record |
| ScheduleDownloadUseCase | Assign start time or queue rule → Persist |
| ChangeSettingsUseCase | Validate → Persist → Propagate to active services |

---

## Segment Worker Behavior

- Sends `Range: bytes={start + downloaded_bytes}-{end_byte}` header
- Streams response in 512 KB chunks → writes to `temp_{download_id}_{index}.part`
- Reports progress every chunk to ProgressService
- On error: exponential backoff, max **5 retries per segment**
- If all retries exhausted: mark segment FAILED → check if all segments failed → mark task FAILED

### Error Recovery Matrix

| Error | Segment Action | Task Action |
|---|---|---|
| Network timeout | Retry with backoff | Continue other segments |
| 416 Range error | Restart from byte 0 | Continue |
| 503 / 429 | Retry after Retry-After delay | Continue |
| Disk full | Pause all workers | Mark FAILED with disk error |
| All retries exhausted | Mark FAILED | Mark task FAILED |
| Merge checksum mismatch | — | Mark FAILED, keep .part files |

---

## File Merger

1. Sort segments by `segment_index`
2. Write each `temp_*.part` file sequentially into final output file
3. Delete all `.part` files
4. Verify checksum if `task.checksum` is set (MD5 or SHA-256)
5. Emit `MergeCompleted(checksum_verified: bool)`

---

## Progress Service

Uses a **rolling 3-second window** to calculate speed. Emits `ProgressSnapshot` via WebSocket after every significant chunk or status change.

```python
@dataclass
class ProgressSnapshot:
    download_id: UUID
    total_size: int | None
    downloaded_bytes: int
    speed_bps: float
    eta_seconds: float | None
    percent: float | None
    active_segments: int
    status: DownloadStatus
```

WebSocket path: `ws://127.0.0.1:6543/ws/progress`

---

## SQLite Schema (Key Tables)

```sql
downloads       (id, url, file_name, save_path, total_size, downloaded_size, status, ...)
segments        (id, download_id, segment_index, start_byte, end_byte, downloaded_bytes, ...)
queues          (id, name, max_parallel_downloads, status, speed_limit)
queue_items     (id, queue_id, download_id, position, priority)
settings        (key, value)
alembic_version (version_num)   -- managed by Alembic, do not edit manually
```

**Alembic is mandatory from Phase 1.** Every schema change requires a migration. Run `alembic upgrade head` on startup.

---

## Browser Extension (Manifest V3) Rules

- **Always use `chrome.alarms`** with `periodInMinutes: 0.4` to keep the service worker alive
- On alarm: ping `/api/health`, store result in `chrome.storage.session`
- Popup reads from `chrome.storage.session`, not by calling the worker directly
- Context menu: right-click on links → "Download with Download Manager"
- POST captured URL to `http://127.0.0.1:6543/api/downloads`
- Required permissions: `contextMenus, alarms, storage`
- Required host permission: `http://127.0.0.1:6543/*`

---

## Electron Security Checklist

Every BrowserWindow must have:
```typescript
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: path.join(__dirname, 'preload.js'),
  webSecurity: true,
}
```

The preload script exposes only a safe `window.api` bridge. Never expose raw `ipcRenderer` or `require` to the renderer.

---

## Security Controls

- API binds to `127.0.0.1` only — enforce in `main.py` uvicorn config
- Sanitize all file names: reject `../`, absolute paths, null bytes
- Block or warn on executable extensions: `.exe .bat .sh .ps1 .msi .dmg .app`
- Truncate URLs to `scheme://host` in log output

---

## Configuration

Config precedence: **CLI flags → env vars → SQLite `settings` table → defaults.**

| Env var | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Bind address (keep loopback) |
| `DM_API_PORT` | `6543` | API + WebSocket port |
| `DM_DATA_DIR` | platform default | SQLite, logs, temp `.part` files |
| `DM_LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

Active port written to `runtime.json` on bind so the Electron shell and extension can discover it.

---

## REST API Summary

```
POST   /api/downloads
GET    /api/downloads?status=&category=
GET    /api/downloads/{id}
POST   /api/downloads/{id}/start
POST   /api/downloads/{id}/pause
POST   /api/downloads/{id}/resume
POST   /api/downloads/{id}/cancel
POST   /api/downloads/{id}/retry
DELETE /api/downloads/{id}?delete_file=
GET    /api/queues
POST   /api/queues
PUT    /api/queues/{id}
GET    /api/settings
PUT    /api/settings
WS     /ws/progress
GET    /api/health
```

---

## Testing Guidance

| Layer | Tool |
|---|---|
| Domain / Use Cases | pytest + unittest.mock (mock all ports) |
| FastAPI routes | pytest + httpx AsyncClient |
| SQLite repositories | pytest with in-memory SQLite |
| Segment worker (HTTP) | pytest + respx (mock HTTP) |
| React components | Vitest + Testing Library |
| E2E full flow | Playwright against local file server |
| Security | pytest (path traversal, localhost binding) |

---

## Implementation Phases

| Phase | Focus |
|---|---|
| 1 | Folders, domain entities, SQLite schema, Alembic first migration |
| 2 | Basic download + minimal Electron UI showing live progress |
| 3 | Range requests, pause/resume, temp file persistence, checksum |
| 4 | Parallel segments, file merger, per-segment retry |
| 5 | Full desktop UI (sidebar, dashboard, dialogs, details panel) |
| 6 | Browser extension with MV3 keep-alive |
| 7 | Queue manager, priority, scheduler, speed limits |
| 8 | Full test suite, security review, Alembic migration tests, packaging |

---

## Ethical Boundaries

This app downloads files the user has **direct URL access to**. It must never:
- Capture HLS/DASH streams
- Bypass authentication or signed URL protections
- Remove DRM or access controls
- Scrape content behind login walls

---

## Reference

For full detail on any section, read **SYSTEM_DESIGN.md** which contains:
- Complete entity field lists and value-object definitions
- Full SQL `CREATE TABLE` statements
- Step-by-step workflow diagrams for every use case
- Full folder structure
- WebSocket event format
- Configuration, environment, and per-platform data paths
- Logging, structured fields, and `/api/metrics` shape
- Visual design system
- Definition of Done checklist
