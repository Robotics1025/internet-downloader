"""SQLiteDownloadRepository round-trip tests against real aiosqlite.

Uses the actual Phase 1 migration to set up the schema.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.infrastructure.persistence.sqlite_download_repository import (
    SQLiteDownloadRepository,
)

REPO_API_ROOT = Path(__file__).resolve().parents[2]  # apps/api
ALEMBIC_INI = REPO_API_ROOT / "alembic.ini"


@pytest.fixture
def db_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("DM_DATABASE_URL", url)
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option(
        "script_location",
        str(REPO_API_ROOT / "src/dm_api/infrastructure/persistence/migrations"),
    )
    command.upgrade(cfg, "head")
    return url


def _make_task(**overrides: object) -> DownloadTask:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "url": "https://example.com/file.zip",
        "file_name": "file.zip",
        "save_path": "/tmp/dl",
        "total_size": 1024,
        "downloaded_size": 0,
        "status": DownloadStatus.PENDING,
        "resume_supported": False,
        "segment_count": 1,
        "category": "general",
        "speed_limit": None,
        "checksum": None,
        "checksum_algorithm": None,
        "error_message": None,
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
    }
    defaults.update(overrides)
    return DownloadTask(**defaults)  # type: ignore[arg-type]


@pytest.mark.integration
async def test_save_then_get_round_trip(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()

    await repo.save(task)
    fetched = await repo.get_by_id(task.id)

    assert fetched is not None
    assert fetched.id == task.id
    assert fetched.url == task.url
    assert fetched.file_name == task.file_name
    assert fetched.status == DownloadStatus.PENDING
    assert fetched.total_size == 1024
    assert fetched.downloaded_size == 0
    assert fetched.resume_supported is False
    assert fetched.created_at == task.created_at


@pytest.mark.integration
async def test_get_missing_returns_none(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    missing = uuid4()
    assert await repo.get_by_id(missing) is None


@pytest.mark.integration
async def test_list_all_returns_newest_first(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)

    t1 = _make_task(created_at=datetime(2026, 1, 1, tzinfo=UTC))
    t2 = _make_task(created_at=datetime(2026, 3, 1, tzinfo=UTC))
    t3 = _make_task(created_at=datetime(2026, 2, 1, tzinfo=UTC))
    await repo.save(t1)
    await repo.save(t2)
    await repo.save(t3)

    all_tasks = await repo.list_all()
    assert [t.id for t in all_tasks] == [t2.id, t3.id, t1.id]


@pytest.mark.integration
async def test_save_then_list_empty(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    assert await repo.list_all() == []


@pytest.mark.integration
async def test_optional_fields_roundtrip(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task(
        total_size=None,
        speed_limit=2_000_000,
        checksum="abc123",
        checksum_algorithm="md5",
        error_message=None,
        started_at=datetime(2026, 4, 1, 12, 0, tzinfo=UTC),
        completed_at=None,
    )
    await repo.save(task)
    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.total_size is None
    assert fetched.speed_limit == 2_000_000
    assert fetched.checksum == "abc123"
    assert fetched.checksum_algorithm == "md5"
    assert fetched.error_message is None
    assert fetched.started_at == datetime(2026, 4, 1, 12, 0, tzinfo=UTC)
    assert fetched.completed_at is None


@pytest.mark.integration
async def test_update_persists_changed_fields(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()
    await repo.save(task)

    task.status = DownloadStatus.DOWNLOADING
    task.total_size = 8192
    task.downloaded_size = 4096
    task.started_at = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    await repo.update(task)

    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.status == DownloadStatus.DOWNLOADING
    assert fetched.total_size == 8192
    assert fetched.downloaded_size == 4096
    assert fetched.started_at == datetime(2026, 5, 23, 12, 0, tzinfo=UTC)


@pytest.mark.integration
async def test_update_missing_id_raises(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()  # never saved
    with pytest.raises(LookupError):
        await repo.update(task)


@pytest.mark.integration
async def test_update_preserves_all_other_fields(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task(
        url="https://example.com/keep.zip",
        file_name="keep.zip",
        save_path="/tmp/keep",
        category="archive",
    )
    await repo.save(task)

    task.status = DownloadStatus.PAUSED  # mutate only one field
    await repo.update(task)

    fetched = await repo.get_by_id(task.id)
    assert fetched is not None
    assert fetched.url == "https://example.com/keep.zip"
    assert fetched.file_name == "keep.zip"
    assert fetched.save_path == "/tmp/keep"
    assert fetched.category == "archive"
    assert fetched.status == DownloadStatus.PAUSED


@pytest.mark.integration
async def test_file_missing_round_trip(db_url: str) -> None:
    repo = SQLiteDownloadRepository(db_url)
    task = _make_task()
    task.file_missing = True
    await repo.save(task)

    loaded = await repo.get_by_id(task.id)
    assert loaded is not None
    assert loaded.file_missing is True

    loaded.file_missing = False
    await repo.update(loaded)

    reloaded = await repo.get_by_id(task.id)
    assert reloaded is not None
    assert reloaded.file_missing is False

