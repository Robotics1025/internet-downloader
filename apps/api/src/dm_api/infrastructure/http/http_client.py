"""Shared httpx.AsyncClient factory.

Called from the FastAPI lifespan. The returned client must be used as an
async context manager so it gets closed cleanly on shutdown.
"""
from __future__ import annotations

import httpx

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_CONNECT_TIMEOUT_SECONDS = 10.0
USER_AGENT = "dm-api/0.2.0 (+local)"


def create_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(DEFAULT_TIMEOUT_SECONDS, connect=DEFAULT_CONNECT_TIMEOUT_SECONDS),
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
