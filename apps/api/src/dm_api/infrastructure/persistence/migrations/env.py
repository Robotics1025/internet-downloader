"""Alembic environment configuration.

Resolves the SQLite URL from (in order):
    1. DM_DATABASE_URL  — full SQLAlchemy URL (used by tests)
    2. DM_DATA_DIR      — directory; the DB file is `{DM_DATA_DIR}/app.db`
    3. Platform default — ~/.local/share/download-manager on Linux,
                          ~/Library/Application Support/DownloadManager on macOS,
                          %APPDATA%\\DownloadManager on Windows.

The target directory is created if missing.
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


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


def run_migrations_offline() -> None:
    url = _resolve_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    config.set_main_option("sqlalchemy.url", _resolve_database_url())
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
