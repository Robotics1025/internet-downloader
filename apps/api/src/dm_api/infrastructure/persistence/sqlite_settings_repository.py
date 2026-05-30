"""SQLite implementation of SettingsRepository.

Persists to the existing ``settings`` table. Values are stored JSON-encoded so
any JSON-compatible Python value round-trips cleanly.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from dm_api.application.ports.settings_repository import SettingsRepository
from dm_api.infrastructure.persistence.models import settings_table


class SqliteSettingsRepository(SettingsRepository):
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def get_all(self) -> dict[str, Any]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(settings_table))).all()
        return {row.key: json.loads(row.value) for row in rows}

    async def set_many(self, values: dict[str, Any]) -> None:
        if not values:
            return
        rows = [{"key": k, "value": json.dumps(v)} for k, v in values.items()]
        async with self._engine.begin() as conn:
            stmt = insert(settings_table).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["key"],
                set_={"value": stmt.excluded.value},
            )
            await conn.execute(stmt)
