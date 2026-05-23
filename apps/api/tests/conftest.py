"""Shared test fixtures and factory helpers."""
from __future__ import annotations

import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import pytest

from dm_api.domain.entities.download_queue import DownloadQueue
from dm_api.domain.entities.download_segment import DownloadSegment
from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.domain.value_objects.queue_status import QueueStatus
from dm_api.domain.value_objects.segment_status import SegmentStatus


def make_task(**overrides: object) -> DownloadTask:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "url": "https://example.com/file.zip",
        "file_name": "file.zip",
        "save_path": "/tmp/downloads",
        "total_size": 1024,
        "downloaded_size": 0,
        "status": DownloadStatus.PENDING,
        "resume_supported": True,
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


def make_segment(**overrides: object) -> DownloadSegment:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "download_id": uuid4(),
        "segment_index": 0,
        "start_byte": 0,
        "end_byte": 1023,
        "downloaded_bytes": 0,
        "temp_file_path": "/tmp/seg_0.part",
        "status": SegmentStatus.PENDING,
        "retry_count": 0,
        "last_error": None,
    }
    defaults.update(overrides)
    return DownloadSegment(**defaults)  # type: ignore[arg-type]


def make_queue(**overrides: object) -> DownloadQueue:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "name": "default",
        "max_parallel_downloads": 3,
        "status": QueueStatus.ACTIVE,
        "speed_limit": None,
    }
    defaults.update(overrides)
    return DownloadQueue(**defaults)  # type: ignore[arg-type]


# ============================================================
# Phase 2b — integration test fixture
# ============================================================


class _StaticServer:
    def __init__(self, base_url: str, root_dir: Path) -> None:
        self.base_url = base_url
        self.root_dir = root_dir


@pytest.fixture
def static_file_server(tmp_path: Path) -> Iterator[_StaticServer]:
    """Spin up a stdlib http.server on a random localhost port serving tmp_path.

    Yields a _StaticServer with `.base_url` and `.root_dir`. Stops the server
    on teardown.
    """
    serve_dir = tmp_path / "static"
    serve_dir.mkdir()

    class _Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            super().__init__(*args, directory=str(serve_dir), **kwargs)

        def log_message(self, format: str, *args) -> None:
            # Silence stdout during tests
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.daemon_threads = True
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield _StaticServer(base_url=f"http://127.0.0.1:{port}", root_dir=serve_dir)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
