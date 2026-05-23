"""FastAPI app factory + lifespan.

Lifespan responsibilities (in order):
1. Resolve the database URL (env var or platform default).
2. Ensure the data directory exists.
3. Run `alembic upgrade head` to make sure the schema is current.
4. Instantiate the repository, event bus, and use cases.
5. Stash them on `app.state` so routers can pick them up.
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI

from dm_api.application.use_cases.add_download import (
    AddDownloadUseCase,
    InvalidUrlError,
)
from dm_api.application.use_cases.get_download import (
    GetDownloadUseCase,
    ListDownloadsUseCase,
)
from dm_api.infrastructure.events.in_memory_event_bus import InMemoryEventBus
from dm_api.infrastructure.persistence.sqlite_download_repository import (
    SQLiteDownloadRepository,
)


def _platform_default_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "DownloadManager"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / "DownloadManager"
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / "download-manager"


def _resolve_database_url() -> str:
    explicit = os.environ.get("DM_DATABASE_URL")
    if explicit:
        return explicit
    data_dir_env = os.environ.get("DM_DATA_DIR")
    data_dir = Path(data_dir_env) if data_dir_env else _platform_default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{data_dir / 'app.db'}"


def _alembic_root() -> Path:
    # apps/api/src/dm_api/presentation/app.py -> apps/api
    return Path(__file__).resolve().parents[3]


def _run_migrations_sync() -> None:
    api_root = _alembic_root()
    cfg = Config(str(api_root / "alembic.ini"))
    cfg.set_main_option(
        "script_location",
        str(api_root / "src/dm_api/infrastructure/persistence/migrations"),
    )
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db_url = _resolve_database_url()
    await asyncio.to_thread(_run_migrations_sync)

    repo = SQLiteDownloadRepository(db_url)
    event_bus = InMemoryEventBus()

    app.state.repo = repo
    app.state.event_bus = event_bus
    app.state.add_download = AddDownloadUseCase(repo=repo, event_bus=event_bus)
    app.state.get_download = GetDownloadUseCase(repo=repo)
    app.state.list_downloads = ListDownloadsUseCase(repo=repo)

    yield


def create_app() -> FastAPI:
    app = FastAPI(title="dm-api", version="0.2.0", lifespan=lifespan)

    @app.exception_handler(InvalidUrlError)
    async def _invalid_url_handler(request, exc):  # type: ignore[no-untyped-def]
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=422, content={"detail": str(exc)})

    from dm_api.presentation.routers import downloads, health
    app.include_router(health.router)
    app.include_router(downloads.router)

    return app
