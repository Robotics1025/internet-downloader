"""Tests for ``configure_logging``: JSON formatter and rotating file handler.

We are testing the *shape* of the configuration: that records go through the
JSON formatter, that the file handler points where we expect, and that the
size + backup-count rotation is set. We do not try to test rotation behaviour
end-to-end — Python's stdlib already does that."""
from __future__ import annotations

import json
import logging
import logging.handlers
from pathlib import Path

import pytest

from dm_api.infrastructure.logging import setup


@pytest.fixture(autouse=True)
def _reset_root_logger() -> None:
    """``configure_logging`` mutates the root logger. Reset between tests so
    one test's handlers don't leak into the next."""
    root = logging.getLogger()
    original_handlers = root.handlers[:]
    original_level = root.level
    yield
    root.handlers[:] = original_handlers
    root.setLevel(original_level)


def test_configure_logging_adds_console_and_file_handlers(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    root = logging.getLogger()
    handler_types = {type(h) for h in root.handlers}
    assert logging.StreamHandler in handler_types
    assert logging.handlers.RotatingFileHandler in handler_types


def test_log_file_path_uses_provided_dir(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    root = logging.getLogger()
    file_handler = next(
        h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
    )
    assert Path(file_handler.baseFilename) == tmp_path / "api.log"


def test_rotation_is_configured(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    root = logging.getLogger()
    file_handler = next(
        h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
    )
    # Spec: rotate at 5 MB, keep 3 files.
    assert file_handler.maxBytes == 5 * 1024 * 1024
    assert file_handler.backupCount == 3


def test_records_are_emitted_as_json(tmp_path: Path) -> None:
    setup.configure_logging(log_dir=tmp_path)
    logging.getLogger("dm_api.test").warning("hello %s", "world", extra={"task_id": "abc"})
    for h in logging.getLogger().handlers:
        h.flush()
    log_path = tmp_path / "api.log"
    text = log_path.read_text()
    # One line per record; parse the first line.
    line = text.splitlines()[0]
    record = json.loads(line)
    assert record["level"] == "WARNING"
    assert record["message"] == "hello world"
    assert record["logger"] == "dm_api.test"
    assert record["task_id"] == "abc"


def test_default_log_dir_is_under_data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When no ``log_dir`` is passed, the helper uses ``<data_dir>/logs``."""
    monkeypatch.setenv("DM_DATA_DIR", str(tmp_path))
    setup.configure_logging()
    root = logging.getLogger()
    file_handler = next(
        h for h in root.handlers if isinstance(h, logging.handlers.RotatingFileHandler)
    )
    assert Path(file_handler.baseFilename) == tmp_path / "logs" / "api.log"
