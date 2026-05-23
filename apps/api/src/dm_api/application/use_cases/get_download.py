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
