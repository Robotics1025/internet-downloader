"""Tests for SqliteSettingsRepository."""
from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from dm_api.infrastructure.persistence.sqlite_settings_repository import (
    SqliteSettingsRepository,
)


@pytest.fixture
async def repo(tmp_path: Path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    # Create the table hermetically — don't depend on the full alembic chain.
    async with engine.begin() as conn:
        await conn.execute(text(
            'CREATE TABLE settings (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)'
        ))
    yield SqliteSettingsRepository(engine)
    await engine.dispose()


async def test_get_all_returns_empty_dict_for_new_db(repo) -> None:
    assert await repo.get_all() == {}


async def test_set_then_get_roundtrips_ints_bools_strings(repo) -> None:
    await repo.set_many({"max_parallel": 5, "theme": "dark", "auto_start_downloads": True})
    values = await repo.get_all()
    assert values == {"max_parallel": 5, "theme": "dark", "auto_start_downloads": True}


async def test_set_many_upserts_existing_keys(repo) -> None:
    await repo.set_many({"theme": "dark"})
    await repo.set_many({"theme": "light"})
    assert (await repo.get_all())["theme"] == "light"


async def test_set_many_with_empty_dict_is_a_noop(repo) -> None:
    await repo.set_many({})
    assert await repo.get_all() == {}
