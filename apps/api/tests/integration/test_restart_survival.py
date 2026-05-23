"""Verify that downloads persist across server restarts by booting two
separate FastAPI apps backed by the same SQLite file.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.integration
async def test_downloads_survive_app_restart(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_url = f"sqlite:///{tmp_path / 'shared.db'}"
    monkeypatch.setenv("DM_DATABASE_URL", db_url)

    # First app instance — create a download
    from dm_api.presentation.app import create_app

    app1 = create_app()
    async with AsyncClient(transport=ASGITransport(app=app1), base_url="http://testserver") as ac:  # noqa: SIM117
        async with app1.router.lifespan_context(app1):
            create_response = await ac.post(
                "/api/downloads",
                json={"url": "https://example.com/keepme.zip"},
            )
            assert create_response.status_code == 201
            saved_id = create_response.json()["id"]

    # Second app instance — read it back
    app2 = create_app()
    async with AsyncClient(transport=ASGITransport(app=app2), base_url="http://testserver") as ac:  # noqa: SIM117
        async with app2.router.lifespan_context(app2):
            get_response = await ac.get(f"/api/downloads/{saved_id}")
            assert get_response.status_code == 200
            assert get_response.json()["file_name"] == "keepme.zip"
