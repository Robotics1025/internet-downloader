"""Structured logging setup for the API.

Configures the root logger with:

  * A console handler at INFO level (uvicorn's existing handlers continue to
    work; we are additive).
  * A rotating file handler that writes one JSON record per line to
    ``<data_dir>/logs/api.log``, rotating at 5 MB and keeping 3 backups.

The JSON shape is intentionally minimal — ``ts``, ``level``, ``logger``,
``message``, plus anything passed via ``extra=...``. Production users hit
"Copy diagnostics" in the desktop Settings screen and paste the file into a
bug report; the format needs to be greppable, not pretty-printed.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
from datetime import UTC, datetime
from pathlib import Path

_STANDARD_RECORD_ATTRS = frozenset(
    {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "asctime", "taskName",
    }
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Surface any structured fields passed via ``extra=...``.
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_ATTRS or key.startswith("_"):
                continue
            payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _default_log_dir() -> Path:
    data_dir_env = os.environ.get("DM_DATA_DIR")
    if data_dir_env:
        return Path(data_dir_env) / "logs"
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / "download-manager" / "logs"


def configure_logging(
    level: str = "INFO",
    log_dir: Path | None = None,
) -> None:
    """Install the structured logging configuration on the root logger.

    Safe to call multiple times — any prior handlers added by this function are
    cleared first so we don't accumulate duplicates across reloads.
    """
    if log_dir is None:
        log_dir = _default_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(level)

    # Remove handlers we previously installed; leave others (e.g. pytest's
    # caplog handler) untouched.
    for handler in list(root.handlers):
        if getattr(handler, "_dm_owned", False):
            root.removeHandler(handler)

    json_formatter = _JsonFormatter()

    console = logging.StreamHandler()
    console.setFormatter(json_formatter)
    console.setLevel(level)
    console._dm_owned = True  # type: ignore[attr-defined]
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        filename=log_dir / "api.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_formatter)
    file_handler.setLevel(level)
    file_handler._dm_owned = True  # type: ignore[attr-defined]
    root.addHandler(file_handler)
