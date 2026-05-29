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
        if task.media_format_id is None:
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
