"""End-to-end test: `alembic upgrade head` on a fresh SQLite DB creates all
five tables with the expected columns, indexes, and foreign keys.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

REPO_API_ROOT = Path(__file__).resolve().parents[2]  # apps/api
ALEMBIC_INI = REPO_API_ROOT / "alembic.ini"


@pytest.fixture
def db_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("DM_DATABASE_URL", url)
    return url


@pytest.fixture
def alembic_cfg(db_url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    migrations_path = str(REPO_API_ROOT / "src/dm_api/infrastructure/persistence/migrations")
    cfg.set_main_option("script_location", migrations_path)
    return cfg


@pytest.mark.integration
def test_upgrade_creates_all_tables(alembic_cfg: Config, db_url: str) -> None:
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert {"downloads", "segments", "queues", "queue_items", "settings"}.issubset(tables)


@pytest.mark.integration
def test_segments_has_fk_to_downloads_with_cascade(alembic_cfg: Config, db_url: str) -> None:
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    fks = inspector.get_foreign_keys("segments")
    assert any(
        fk["referred_table"] == "downloads"
        and fk["constrained_columns"] == ["download_id"]
        and fk["options"].get("ondelete", "").upper() == "CASCADE"
        for fk in fks
    ), f"expected ON DELETE CASCADE FK from segments.download_id to downloads.id, got {fks}"


@pytest.mark.integration
def test_downloads_has_expected_columns(alembic_cfg: Config, db_url: str) -> None:
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    column_names = {c["name"] for c in inspector.get_columns("downloads")}
    expected = {
        "id", "url", "file_name", "save_path", "total_size", "downloaded_size",
        "status", "category", "speed_limit", "resume_supported", "segment_count",
        "checksum", "checksum_algorithm", "error_message",
        "created_at", "started_at", "completed_at",
    }
    assert expected.issubset(column_names), f"missing columns: {expected - column_names}"


@pytest.mark.integration
def test_upgrade_is_idempotent(alembic_cfg: Config) -> None:
    command.upgrade(alembic_cfg, "head")
    # Running again must be a no-op (no exception, no changes).
    command.upgrade(alembic_cfg, "head")


@pytest.mark.integration
def test_queues_name_is_unique(alembic_cfg: Config, db_url: str) -> None:
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    uniques = inspector.get_unique_constraints("queues")
    assert any(uc["column_names"] == ["name"] for uc in uniques), \
        f"expected UNIQUE on queues.name, got {uniques}"
