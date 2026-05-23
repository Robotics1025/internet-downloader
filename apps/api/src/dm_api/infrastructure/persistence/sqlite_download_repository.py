"""Async SQLite implementation of DownloadRepository.

Connection-per-call: simple, correct, fast enough for Phase 2a. Phase 2b
will revisit if benchmarks demand a shared connection.

Datetime is stored as ISO-8601 UTC strings. UUID as string. Enum via .value.
Booleans as 0/1.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import aiosqlite

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus


def _db_path_from_url(url: str) -> str:
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise ValueError(f"unsupported database URL: {url!r}")
    return url[len(prefix):]


def _row_to_task(row: aiosqlite.Row) -> DownloadTask:
    return DownloadTask(
        id=UUID(row["id"]),
        url=row["url"],
        file_name=row["file_name"],
        save_path=row["save_path"],
        total_size=row["total_size"],
        downloaded_size=row["downloaded_size"],
        status=DownloadStatus(row["status"]),
        resume_supported=bool(row["resume_supported"]),
        segment_count=row["segment_count"],
        category=row["category"],
        speed_limit=row["speed_limit"],
        checksum=row["checksum"],
        checksum_algorithm=row["checksum_algorithm"],
        error_message=row["error_message"],
        created_at=datetime.fromisoformat(row["created_at"]),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
    )


class SQLiteDownloadRepository:
    def __init__(self, database_url: str) -> None:
        self._db_path = _db_path_from_url(database_url)

    async def save(self, task: DownloadTask) -> None:
        params: tuple[Any, ...] = (
            str(task.id),
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
        )
        async with aiosqlite.connect(self._db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            await conn.execute(
                """
                INSERT INTO downloads (
                    id, url, file_name, save_path, total_size, downloaded_size,
                    status, resume_supported, segment_count, category, speed_limit,
                    checksum, checksum_algorithm, error_message,
                    created_at, started_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                params,
            )
            await conn.commit()

    async def get_by_id(self, id: UUID) -> DownloadTask | None:
        async with aiosqlite.connect(self._db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            async with conn.execute(
                "SELECT * FROM downloads WHERE id = ?", (str(id),)
            ) as cursor:
                row = await cursor.fetchone()
                return _row_to_task(row) if row else None

    async def list_all(self) -> list[DownloadTask]:
        async with aiosqlite.connect(self._db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            async with conn.execute(
                "SELECT * FROM downloads ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [_row_to_task(r) for r in rows]
