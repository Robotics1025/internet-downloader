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
