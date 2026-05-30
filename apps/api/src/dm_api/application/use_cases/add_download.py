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
from dm_api.application.ports.settings_repository import SettingsRepository
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


# Map of extension → category. Lookup is by lowercased final dotted suffix.
_EXT_CATEGORY: dict[str, str] = {
    # video
    "mp4": "video", "mkv": "video", "webm": "video", "mov": "video", "avi": "video",
    "m4v": "video", "flv": "video", "wmv": "video", "mpeg": "video", "mpg": "video",
    "ts": "video", "3gp": "video",
    # audio
    "mp3": "audio", "wav": "audio", "flac": "audio", "aac": "audio", "m4a": "audio",
    "ogg": "audio", "opus": "audio", "wma": "audio", "alac": "audio",
    # images
    "jpg": "image", "jpeg": "image", "png": "image", "gif": "image", "webp": "image",
    "svg": "image", "bmp": "image", "ico": "image", "tiff": "image", "heic": "image",
    # documents
    "pdf": "document", "doc": "document", "docx": "document", "txt": "document",
    "md": "document", "rtf": "document", "odt": "document", "epub": "document",
    "xls": "document", "xlsx": "document", "ods": "document", "csv": "document",
    "ppt": "document", "pptx": "document", "odp": "document",
    # archives / compressed
    "zip": "archive", "rar": "archive", "7z": "archive", "tar": "archive",
    "gz": "archive", "bz2": "archive", "xz": "archive", "tgz": "archive",
    "tbz2": "archive", "txz": "archive", "lzma": "archive", "zst": "archive",
    # software / installers
    "exe": "software", "msi": "software", "dmg": "software", "pkg": "software",
    "deb": "software", "rpm": "software", "apk": "software", "appimage": "software",
    "iso": "software",
}

# Category → folder name (created under the user's chosen save_path).
_CATEGORY_FOLDER: dict[str, str] = {
    "video": "Videos",
    "audio": "Music",
    "image": "Pictures",
    "document": "Documents",
    "archive": "Archives",
    "software": "Software",
    "other": "Other",
}


def _derive_category(file_name: str) -> str:
    name = file_name.lower()
    # Handle two-part extensions like .tar.gz / .tar.bz2 first.
    for compound in ("tar.gz", "tar.bz2", "tar.xz", "tar.zst"):
        if name.endswith("." + compound):
            return "archive"
    if "." not in name:
        return "other"
    ext = name.rsplit(".", 1)[-1]
    return _EXT_CATEGORY.get(ext, "other")


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
    def __init__(
        self,
        repo: DownloadRepository,
        event_bus: EventBus,
        settings_repo: SettingsRepository | None = None,
    ) -> None:
        self._repo = repo
        self._event_bus = event_bus
        self._settings = settings_repo

    async def execute(
        self,
        *,
        url: str,
        save_path: str | None = None,
        category: str | None = None,
        file_name: str | None = None,
        media_format_id: str | None = None,
    ) -> DownloadTask:
        if file_name is not None:
            cleaned = file_name.strip()
            if not cleaned or "/" in cleaned or "\\" in cleaned or "\x00" in cleaned:
                raise InvalidUrlError(f"invalid file_name: {file_name!r}")
            resolved_file_name = cleaned
        elif media_format_id is not None:
            resolved_file_name = "media.download"
        else:
            resolved_file_name = _derive_file_name(url)

        # Load user settings once; used for both save_path fallback and
        # auto_start_downloads behaviour below.
        settings = await self._settings.get_all() if self._settings is not None else {}

        # Resolve save_path: explicit arg wins; fall back to settings download_dir;
        # finally fall back to the platform-default ~/Downloads.
        if not save_path or not save_path.strip():
            configured_dir = settings.get("download_dir", "")
            if configured_dir:
                save_path = str(configured_dir)

        base_save_path = (
            _validate_save_path(save_path) if save_path else _default_save_path()
        )

        # Auto-categorize when caller didn't pick a meaningful category. For
        # media downloads with a placeholder file_name, fall back to "video"
        # (audio-only formats won't have video in the picked stream, but the
        # API can't tell from format_id alone — frontend passes category when
        # it picks audio-only).
        effective_category = category if category and category != "general" else None
        if effective_category is None:
            if media_format_id is not None:
                effective_category = "video"
            else:
                effective_category = _derive_category(resolved_file_name)

        folder = _CATEGORY_FOLDER.get(effective_category)
        if folder:
            resolved_save_path = str(Path(base_save_path) / folder)
            Path(resolved_save_path).mkdir(parents=True, exist_ok=True)
        else:
            resolved_save_path = base_save_path

        # Honour auto_start_downloads setting (default: True).
        auto_start = bool(settings.get("auto_start_downloads", True))
        initial_status = DownloadStatus.PENDING if auto_start else DownloadStatus.PAUSED

        task = DownloadTask(
            id=uuid4(),
            url=url,
            file_name=resolved_file_name,
            save_path=resolved_save_path,
            total_size=None,
            downloaded_size=0,
            status=initial_status,
            resume_supported=False,
            segment_count=1,
            category=effective_category,
            speed_limit=None,
            checksum=None,
            checksum_algorithm=None,
            error_message=None,
            created_at=datetime.now(UTC),
            started_at=None,
            completed_at=None,
            media_format_id=media_format_id,
        )
        await self._repo.save(task)
        await self._event_bus.publish(DownloadCreated(download_id=task.id))
        return task
