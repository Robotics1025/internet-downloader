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
    raw_path = parsed.path or ""
    # Trailing slash means the URL points to a directory, not a file.
    if raw_path.endswith("/"):
        raise InvalidUrlError(f"URL path ends with '/' — no file name: {url!r}")
    decoded_path = unquote(raw_path)
    # Reject any URL whose decoded path contains a traversal segment.
    path_segments = [s for s in decoded_path.split("/") if s]
    if any(seg in {".", ".."} for seg in path_segments):
        raise InvalidUrlError(f"URL path contains traversal segment: {url!r}")
    last_segment = decoded_path.rsplit("/", 1)[-1].strip()
    if not last_segment:
        raise InvalidUrlError(f"URL has no file name in path: {url!r}")
    if "\x00" in last_segment:
        raise InvalidUrlError("file name contains null byte")
    if "/" in last_segment or "\\" in last_segment:
        raise InvalidUrlError(f"file name contains path separator: {last_segment!r}")
    return last_segment


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
