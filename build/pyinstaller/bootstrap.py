"""PyInstaller bootstrap entry-point.

PyInstaller's one-file mode extracts the bundle's data files to a temp
directory on each launch; the path is in ``sys._MEIPASS``. We use it to
locate the bundled ``yt-dlp`` and ``ffmpeg`` binaries and export
``DM_YTDLP_BIN`` / ``DM_FFMPEG_BIN`` before importing ``dm_api`` — that way
the binary-discovery helpers in ``infrastructure/media/binaries.py`` resolve
the bundled copies instead of falling back to PATH.

This file is referenced as the entry script in ``dm-api.spec``.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _resource_dir() -> Path:
    """Where PyInstaller extracted our data files.

    Falls back to the directory containing this script when running outside
    a PyInstaller bundle (e.g. ``python build/pyinstaller/bootstrap.py``)
    so a contributor can sanity-check the bootstrap without building first.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    return Path(__file__).resolve().parent


def _set_bundled_binary(env_var: str, name: str) -> None:
    if os.environ.get(env_var):
        # Honour explicit override (e.g. a developer pointing at a local build).
        return
    candidate = _resource_dir() / name
    if candidate.is_file():
        os.environ[env_var] = str(candidate)


def main() -> None:
    _set_bundled_binary("DM_YTDLP_BIN", "yt-dlp")
    _set_bundled_binary("DM_FFMPEG_BIN", "ffmpeg")

    # Import lazily so the env vars are set first.
    from dm_api.presentation.main import main as dm_main

    dm_main()


if __name__ == "__main__":
    main()
