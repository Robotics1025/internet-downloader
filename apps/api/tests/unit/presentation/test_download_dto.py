"""DTO mapping tests."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from dm_api.domain.entities.download_task import DownloadTask
from dm_api.domain.value_objects.download_status import DownloadStatus
from dm_api.presentation.schemas.download_dto import AddDownloadRequest, DownloadDTO


def _make_task() -> DownloadTask:
    return DownloadTask(
        id=uuid4(),
        url="https://example.com/file.zip",
        file_name="file.zip",
        save_path="/tmp/dl",
        total_size=1024,
        downloaded_size=0,
        status=DownloadStatus.PENDING,
        resume_supported=False,
        segment_count=1,
        category="general",
        speed_limit=None,
        checksum=None,
        checksum_algorithm=None,
        error_message=None,
        created_at=datetime(2026, 5, 23, 12, 0, tzinfo=UTC),
        started_at=None,
        completed_at=None,
    )


def test_download_dto_from_entity_preserves_all_fields() -> None:
    task = _make_task()
    dto = DownloadDTO.from_entity(task)
    assert dto.id == task.id
    assert dto.url == task.url
    assert dto.file_name == "file.zip"
    assert dto.status == "pending"
    assert dto.total_size == 1024
    assert dto.resume_supported is False
    assert dto.segment_count == 1
    assert dto.category == "general"
    assert dto.created_at == task.created_at


def test_download_dto_serializes_uuid_and_datetime_to_json() -> None:
    task = _make_task()
    dto = DownloadDTO.from_entity(task)
    data = dto.model_dump(mode="json")
    assert isinstance(data["id"], str)
    UUID(data["id"])  # parseable
    assert data["created_at"].startswith("2026-05-23T12:00:00")
    assert data["status"] == "pending"


def test_add_download_request_minimum_payload() -> None:
    req = AddDownloadRequest(url="https://example.com/file.zip")
    assert req.url == "https://example.com/file.zip"
    assert req.save_path is None
    assert req.category is None


def test_add_download_request_full_payload() -> None:
    req = AddDownloadRequest(
        url="https://example.com/movie.mp4",
        save_path="/mnt/external/dl",
        category="video",
    )
    assert req.save_path == "/mnt/external/dl"
    assert req.category == "video"


def test_add_download_request_rejects_empty_url() -> None:
    with pytest.raises(ValidationError):
        AddDownloadRequest(url="")


def test_add_download_request_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        AddDownloadRequest(url="https://example.com/file.zip", malicious_field="x")  # type: ignore[call-arg]
