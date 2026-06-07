"""End-to-end download test using stdlib http.server + the real FastAPI app."""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

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
            ac.app_state = app.state  # type: ignore[attr-defined]
            yield ac


@pytest.mark.integration
async def test_real_download_end_to_end(
    client: AsyncClient, static_file_server: object, tmp_path: Path
) -> None:
    # Create a 256 KB file on the static server
    payload = b"x" * (256 * 1024)
    file_on_server = static_file_server.root_dir / "data.bin"  # type: ignore[attr-defined]
    file_on_server.write_bytes(payload)

    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/data.bin"  # type: ignore[attr-defined]

    # Create
    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    assert create_resp.status_code == 201
    download_id = create_resp.json()["id"]

    # Start
    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 202
    assert start_resp.json()["status"] == "downloading"

    # Wait for background worker to finish
    await client.app_state.runner.wait_idle()  # type: ignore[attr-defined]

    # Verify
    final_resp = await client.get(f"/api/downloads/{download_id}")
    body = final_resp.json()
    assert body["status"] == "completed"
    assert body["downloaded_size"] == len(payload)

    downloaded_file = save_dir / "Other" / "data.bin"
    assert downloaded_file.exists()
    assert downloaded_file.read_bytes() == payload
    assert not (save_dir / "Other" / "data.bin.part").exists()


@pytest.mark.integration
async def test_404_url_marks_failed(
    client: AsyncClient, static_file_server: object, tmp_path: Path
) -> None:
    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/nope.bin"  # type: ignore[attr-defined]

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    assert create_resp.status_code == 201
    download_id = create_resp.json()["id"]

    # Start — probe will get 404, task should be FAILED, /start returns 502
    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 502

    final_resp = await client.get(f"/api/downloads/{download_id}")
    body = final_resp.json()
    assert body["status"] == "failed"
    assert body["error_message"] is not None


@pytest.mark.integration
async def test_start_already_running_returns_409(
    client: AsyncClient, static_file_server: object, tmp_path: Path
) -> None:
    # Set up a download that's already DOWNLOADING (use 256 KB so we don't race)
    payload = b"y" * (256 * 1024)
    (static_file_server.root_dir / "slow.bin").write_bytes(payload)  # type: ignore[attr-defined]

    save_dir = tmp_path / "downloads"
    save_dir.mkdir()
    url = f"{static_file_server.base_url}/slow.bin"  # type: ignore[attr-defined]

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    download_id = create_resp.json()["id"]

    first_start = await client.post(f"/api/downloads/{download_id}/start")
    assert first_start.status_code == 202

    # Second /start should 409 — status is DOWNLOADING (or COMPLETED if it finished too fast)
    second_start = await client.post(f"/api/downloads/{download_id}/start")
    assert second_start.status_code == 409

    # Let the original complete
    await client.app_state.runner.wait_idle()  # type: ignore[attr-defined]


@pytest.mark.integration
async def test_start_with_existing_destination_returns_409(
    client: AsyncClient, static_file_server: object, tmp_path: Path
) -> None:
    payload = b"z" * 1024
    (static_file_server.root_dir / "blocked.bin").write_bytes(payload)  # type: ignore[attr-defined]

    save_dir = tmp_path / "downloads"
    other_dir = save_dir / "Other"
    other_dir.mkdir(parents=True, exist_ok=True)
    # Pre-create the destination
    (other_dir / "blocked.bin").write_bytes(b"existing content")

    url = f"{static_file_server.base_url}/blocked.bin"  # type: ignore[attr-defined]

    create_resp = await client.post(
        "/api/downloads",
        json={"url": url, "save_path": str(save_dir)},
    )
    download_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/downloads/{download_id}/start")
    assert start_resp.status_code == 409


@pytest.mark.integration
async def test_start_unknown_id_returns_404(client: AsyncClient) -> None:
    from uuid import uuid4

    start_resp = await client.post(f"/api/downloads/{uuid4()}/start")
    assert start_resp.status_code == 404
