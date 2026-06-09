---
title: Download Lifecycle Controls — Pause / Resume / Cancel / Retry
date: 2026-06-06
status: approved
project: download-manager
group: A (of a 4-part user-issue batch)
references:
  - SYSTEM_DESIGN.md
  - SKILL.md
  - docs/superpowers/specs/2026-05-23-phase-2b-single-file-downloader-design.md
---

# Download Lifecycle Controls

## 1. Goal

Give the user working control over in-flight and finished downloads:

- **Pause** an active download and **Resume** it later, continuing from where it stopped.
- **Cancel / Delete** an active download (today this is blocked with HTTP 409).
- **Retry** a failed download (today this silently fails).
- **Delete** any download, with a per-delete choice for completed items: *remove from
  list* (keep the file) or *delete the file from disk too*.

This is the first of four groups addressing a batch of user-reported issues. The other
three (settings folder picker, browser-extension connect flow, app↔filesystem sync) get
their own specs.

**Definition of done (binary):**
- All existing gates stay green: ruff, `mypy --strict`, `pytest`, coverage ≥ 90% on
  domain + application layers.
- An active download can be paused (`status → paused`, process stopped, `.part` kept) and
  resumed (`status → downloading`, continues from the `.part`, ends `completed`).
- Pausing leaves **no orphaned yt-dlp/ffmpeg process** (verified on the running app).
- A `failed` download can be retried via the existing Resume/Retry control and runs to
  completion (or fails again with a fresh `error_message`).
- `DELETE /api/downloads/{id}` succeeds for an active download (stops it first), no 409.
- `DELETE /api/downloads/{id}?delete_file=true` removes the finished file from disk; the
  default (`false`) leaves it.
- The desktop UI's Pause button performs a real pause; Resume/Retry work; deleting a
  completed item prompts "Remove from list / Delete file too / Cancel".

## 2. Why it's broken today (root causes)

- The Pause button handler is empty — `onClick={(e) => { e.stopPropagation(); }}`
  (`apps/desktop/src/components/DownloadRow.tsx`, list + grid variants).
- Resume and Retry both call `onStart` → `POST /{id}/start`, but
  `StartDownloadUseCase.execute` raises `InvalidStateError` unless `status == PENDING`
  (`apps/api/.../use_cases/start_download.py`). `paused` and `failed` are rejected.
- `DELETE /{id}` returns 409 for any active status by design
  (`apps/api/.../routers/downloads.py`).
- `DownloadRunner` tracks background tasks in an anonymous `set`, so there is no way to
  stop one specific download.

Helpful pre-existing pieces: `DownloadStatus.PAUSED` and `CANCELLED` already exist in the
enum, and the UI context menu already renders Pause/Resume/Retry items keyed off
`isActive`/`isPaused`/`isFailed`.

## 3. Scope

### In scope
- `DownloadRunner`: per-download registry + `async def stop(id)`.
- Workers (`YtDlpWorker`, `SingleSegmentWorker`): terminate their subprocess / close their
  stream on cancellation via a `finally` block; do **not** mark `FAILED` when the stop was
  intentional.
- A use case (or extension of `StartDownloadUseCase`) that accepts
  `PENDING | PAUSED | FAILED | CANCELLED` and (re)spawns the worker; re-probe only for the
  fresh `PENDING` HTTP case.
- New pause use case / endpoint; broadened start; delete-active + `delete_file`.
- Presentation: `POST /api/downloads/{id}/pause`, broadened `POST /{id}/start`,
  `DELETE /{id}?delete_file=bool`.
- Desktop: api-client methods, `useDownloads` handlers, wire the pause button, delete
  confirm dialog.

### Out of scope (deliberately)
- True multi-segment resume for plain HTTP. The start path still forces `segment_count=1`;
  resume relies on yt-dlp's native continuation and HTTP range when the server supports it.
- App↔filesystem sync and "playlist = folder on disk" — that is Group D.

## 4. Design

### 4.1 Runner per-download control
Replace the anonymous `set[asyncio.Task]` with `dict[UUID, asyncio.Task]` keyed by
download id. `spawn(task)` registers the task and removes it on completion.

Add:
```python
async def stop(self, download_id: UUID) -> bool:
    """Cancel the running task for this download, if any. Returns True if one
    was running. Awaits cancellation so the worker's cleanup runs before we
    return (no orphaned subprocess)."""
```

**Mechanism (recommended):** asyncio task cancellation. `stop()` calls `task.cancel()`
and awaits it. The worker catches `CancelledError` in a `finally` that terminates its
subprocess (SIGTERM, brief wait, SIGKILL fallback) and re-raises. The *caller* of `stop()`
sets the final status (`PAUSED` for pause, row deleted for cancel) — the worker must not
overwrite it with `FAILED`.

*Alternative considered & rejected:* persisting the OS PID and signalling it from the
endpoint. Fragile (PID reuse, cross-process), and fights the async architecture.

### 4.2 Worker cancellation contract
`YtDlpWorker.run` / `SingleSegmentWorker.run` wrap the read loop so that on
`CancelledError` they terminate the child process and return without writing `FAILED`.
The normal exception path (real yt-dlp error) is unchanged. The `.part` file is left on
disk on cancellation so resume can continue.

### 4.3 Pause
`POST /api/downloads/{id}/pause` → only valid for `DOWNLOADING`/`MERGING`/`QUEUED`.
Calls `runner.stop(id)`, sets `status = PAUSED`, persists. Idempotent-ish: pausing a
non-active task returns 409 with a clear message.

### 4.4 Resume + Retry (one path)
Broaden the start use case: allowed entry states become
`PENDING | PAUSED | FAILED | CANCELLED`.
- `PENDING` (HTTP, no `media_format_id`): unchanged — probe metadata, check destination.
- `PAUSED | FAILED | CANCELLED`: skip re-probe, clear `error_message`, set
  `status = DOWNLOADING`, `started_at` if unset, and `runner.spawn(task)`. yt-dlp
  continues from `.part` if present, else starts fresh.

The desktop Resume and Retry controls both already call `/start`, so no new endpoint is
required for them — only the use-case state check changes.

### 4.5 Delete (active + ask-on-delete)
`DELETE /api/downloads/{id}?delete_file=false`:
1. If the task is active, `await runner.stop(id)` first (no 409).
2. Remove the `.part` scrap (best effort).
3. If `delete_file=true` **and** the final file exists, delete it.
4. Delete the DB row.

The "ask each time" UX lives in the UI: deleting a **completed** item opens a small
confirm with *Remove from list* (`delete_file=false`), *Delete file too*
(`delete_file=true`), and *Cancel*. Non-completed items delete directly with
`delete_file=false` (there is no finished file to lose).

### 4.6 Desktop UI
- `api.ts`: add `pauseDownload(id)` and `resumeDownload(id)` (the latter may just call the
  existing start). 
- `useDownloads.ts`: add `pauseDownload`, keep `startDownload` for resume/retry, and
  extend `deleteDownload(id, deleteFile?)`.
- `DownloadRow.tsx`: give the pause buttons (list + grid) a real `onPause` handler; the
  context menu's Pause/Resume already routes through the parent — point pause at the new
  handler. Add a lightweight confirm dialog for completed-item deletes (or reuse an
  existing dialog/modal pattern in the codebase).

## 5. Status / data model
No schema migration: `PAUSED` and `CANCELLED` already exist as enum values and the
`status` column is free-text. `error_message` is cleared on resume/retry.

## 6. Testing
- **Unit (application):** runner registry add/remove, `stop()` cancels the right task and
  awaits cleanup; start use case transitions paused→downloading and failed→downloading,
  and still rejects truly invalid states (e.g. `completed`).
- **Unit (infrastructure):** worker terminates its subprocess on cancellation and does not
  mark `FAILED` (use a fake/stub subprocess).
- **Integration (router):** `/pause` happy path + 409 on non-active; `/start` resume and
  retry; `DELETE` on an active download; `DELETE ?delete_file=true` removes the file,
  default keeps it.
- **Manual (running app):** pause a real YouTube download, confirm no orphaned process
  (`pgrep -f yt-dlp`), resume to completion; retry a failed one; delete-confirm flow.

## 7. Risks
- **Orphaned processes** if cancellation cleanup is missed — covered by the worker
  `finally` contract and a manual `pgrep` check in DoD.
- **Race**: a download completing exactly as the user pauses it. The runner's `stop()`
  awaits the task; if it already finished, `stop()` is a no-op and status stays
  `completed`. The pause endpoint re-reads status after stopping and won't downgrade a
  completed task to paused.
- **Accidental file loss** via `delete_file=true` — mitigated by defaulting to `false` and
  requiring an explicit UI choice for completed items.
