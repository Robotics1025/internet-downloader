"""ReconcileService marks completed downloads missing when their file is gone."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from dm_api.application.services.reconcile_service import ReconcileService
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


class _FakeRepo:
    def __init__(self, tasks: list[DownloadTask]) -> None:
        self._tasks = {t.id: t for t in tasks}
        self.updates: list[DownloadTask] = []

    async def list_all(self) -> list[DownloadTask]:
        return list(self._tasks.values())

    async def update(self, task: DownloadTask) -> None:
        self.updates.append(task)
        self._tasks[task.id] = task


def _task(tmp_path, name: str, status: DownloadStatus, exists: bool) -> DownloadTask:
    if exists:
        (tmp_path / name).write_bytes(b"x")
    return DownloadTask(
        id=uuid4(), url="https://e/x", file_name=name, save_path=str(tmp_path),
        total_size=1, downloaded_size=1, status=status, resume_supported=False,
        segment_count=1, category="general", speed_limit=None, checksum=None,
        checksum_algorithm=None, error_message=None, created_at=datetime.now(UTC),
        started_at=None, completed_at=None,
    )


async def test_marks_completed_missing_when_file_absent(tmp_path) -> None:
    gone = _task(tmp_path, "gone.bin", DownloadStatus.COMPLETED, exists=False)
    here = _task(tmp_path, "here.bin", DownloadStatus.COMPLETED, exists=True)
    repo = _FakeRepo([gone, here])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert gone.file_missing is True
    assert here.file_missing is False
    assert gone in repo.updates and here not in repo.updates  # only changed rows persisted


async def test_clears_missing_when_file_returns(tmp_path) -> None:
    t = _task(tmp_path, "back.bin", DownloadStatus.COMPLETED, exists=True)
    t.file_missing = True  # stale
    repo = _FakeRepo([t])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert t.file_missing is False
    assert t in repo.updates


async def test_ignores_non_completed(tmp_path) -> None:
    dl = _task(tmp_path, "dl.bin", DownloadStatus.DOWNLOADING, exists=False)
    repo = _FakeRepo([dl])
    svc = ReconcileService(repo)  # type: ignore[arg-type]

    await svc.reconcile_once()

    assert dl.file_missing is False
    assert repo.updates == []
