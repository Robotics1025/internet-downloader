# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the dm-api sidecar binary.

Produces a single-file executable named `dm-api` (or `dm-api.exe` on Windows)
in ``build/pyinstaller/dist/``. The bundle embeds:

  * the entire ``dm_api`` Python package + dependencies,
  * the platform's vendored ``yt-dlp`` and ``ffmpeg`` binaries from
    ``build/pyinstaller/binaries/<platform>/``.

The entry script is ``bootstrap.py``, which sets the env vars the binary-
discovery helpers expect, then calls ``dm_api.presentation.main.main()``.
"""
from __future__ import annotations

import platform
import sys
from pathlib import Path

# PyInstaller invokes this spec from the project root via
# ``uv run pyinstaller build/pyinstaller/dm-api.spec``. ``SPECPATH`` is the
# spec's directory.
SPEC_DIR = Path(SPECPATH).resolve()
PROJECT_ROOT = SPEC_DIR.parent.parent

# Map runtime platform to the vendored-binary subdir produced by
# ``fetch_binaries.sh``.
_PLATFORM = {
    ("Linux", "x86_64"): "linux-x86_64",
    ("Darwin", "x86_64"): "macos-x86_64",
    ("Darwin", "arm64"): "macos-arm64",
    ("Windows", "AMD64"): "windows-x86_64",
}.get((platform.system(), platform.machine()))

if _PLATFORM is None:
    raise SystemExit(
        f"Unsupported platform: {platform.system()} {platform.machine()}. "
        "Add it to build/pyinstaller/dm-api.spec."
    )

BINARIES_DIR = SPEC_DIR / "binaries" / _PLATFORM

# Vendored binary file names: on Windows they have .exe, elsewhere they don't.
_EXE = ".exe" if platform.system() == "Windows" else ""
YT_DLP = BINARIES_DIR / f"yt-dlp{_EXE}"
FFMPEG = BINARIES_DIR / f"ffmpeg{_EXE}"

if not YT_DLP.is_file() or not FFMPEG.is_file():
    raise SystemExit(
        f"Vendored binaries missing in {BINARIES_DIR} "
        f"(expected {YT_DLP.name} and {FFMPEG.name}). "
        "Run ./build/pyinstaller/fetch_binaries.sh first (Linux/macOS), "
        "or the equivalent download step on Windows CI."
    )

block_cipher = None

a = Analysis(
    [str(SPEC_DIR / "bootstrap.py")],
    pathex=[str(PROJECT_ROOT / "apps" / "api" / "src")],
    binaries=[
        (str(YT_DLP), "."),
        (str(FFMPEG), "."),
    ],
    datas=[
        # alembic ships SQL templates / migrations as package data; PyInstaller
        # would otherwise miss them.
        (str(PROJECT_ROOT / "apps" / "api" / "src" / "dm_api" / "infrastructure" / "persistence" / "migrations"),
         "dm_api/infrastructure/persistence/migrations"),
        (str(PROJECT_ROOT / "apps" / "api" / "alembic.ini"), "."),
    ],
    hiddenimports=[
        # uvicorn pulls these dynamically.
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        # alembic detects migration scripts via importlib at runtime.
        "alembic.runtime.environment",
        "alembic.runtime.migration",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim obvious dead weight.
        "tkinter",
        "test",
        "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="dm-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,            # UPX can break webview cert bundles; leave off.
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,         # We rely on stdout for the DM_PORT line.
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
