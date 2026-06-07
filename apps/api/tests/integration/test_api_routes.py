"""Downloads API end-to-end via httpx ASGITransport."""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("DM_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    from dm_api.presentation.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:  # noqa: SIM117
        async with app.router.lifespan_context(app):
            yield ac


@pytest.mark.integration
async def test_post_create_then_get(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["url"] == "https://example.com/file.zip"
    assert body["file_name"] == "file.zip"
    assert body["status"] == "pending"
    assert body["category"] == "archive"
    download_id = body["id"]

    get_response = await client.get(f"/api/downloads/{download_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == download_id


@pytest.mark.integration
async def test_post_with_explicit_save_path_and_category(client: AsyncClient, tmp_path: Path) -> None:
    custom_path = tmp_path / "custom_save"
    response = await client.post(
        "/api/downloads",
        json={
            "url": "https://example.com/movie.mp4",
            "save_path": str(custom_path),
            "category": "video",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["save_path"] == str(custom_path / "Videos")
    assert body["category"] == "video"


@pytest.mark.integration
async def test_list_returns_newest_first(client: AsyncClient) -> None:
    for i in range(3):
        r = await client.post(
            "/api/downloads",
            json={"url": f"https://example.com/file{i}.zip"},
        )
        assert r.status_code == 201

    list_response = await client.get("/api/downloads")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 3
    # newest first means file2.zip should appear before file0.zip
    file_names = [it["file_name"] for it in items]
    assert file_names == ["file2.zip", "file1.zip", "file0.zip"]


@pytest.mark.integration
async def test_get_unknown_id_returns_404(client: AsyncClient) -> None:
    missing = uuid4()
    response = await client.get(f"/api/downloads/{missing}")
    assert response.status_code == 404


@pytest.mark.integration
async def test_get_malformed_uuid_returns_422(client: AsyncClient) -> None:
    response = await client.get("/api/downloads/not-a-uuid")
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_ftp_url_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "ftp://example.com/file.zip"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_extra_field_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip", "evil": "x"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_post_relative_save_path_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        "/api/downloads",
        json={"url": "https://example.com/file.zip", "save_path": "relative"},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_health_active_downloads_is_zero_when_all_pending(
    client: AsyncClient,
) -> None:
    await client.post("/api/downloads", json={"url": "https://example.com/a.zip"})
    await client.post("/api/downloads", json={"url": "https://example.com/b.zip"})
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["active_downloads"] == 0
