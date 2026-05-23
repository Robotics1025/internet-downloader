"""Health endpoint integration test."""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("DM_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    # Important: import inside the fixture so the env var is set before
    # the lifespan reads it.
    from dm_api.presentation.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:  # noqa: SIM117
        async with app.router.lifespan_context(app):
            yield ac


@pytest.mark.integration
async def test_health_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.2.0"
    assert data["active_downloads"] == 0
