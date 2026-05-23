"""HttpxMetadataProbe behavior via respx (httpx mock)."""
from __future__ import annotations

import httpx
import pytest
import respx

from dm_api.infrastructure.http.httpx_metadata_probe import HttpxMetadataProbe


@pytest.fixture
async def client() -> httpx.AsyncClient:
    return httpx.AsyncClient()


async def test_head_with_content_length_and_accept_ranges(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/big.zip").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "1048576",
                    "Accept-Ranges": "bytes",
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/big.zip")
        assert metadata.total_size == 1048576
        assert metadata.accepts_ranges is True
        assert metadata.suggested_filename is None


async def test_head_405_falls_back_to_get(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/no-head.zip").mock(return_value=httpx.Response(405))
        mock.get("/no-head.zip").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "2048",
                    "Accept-Ranges": "none",
                },
                content=b"x" * 2048,
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/no-head.zip")
        assert metadata.total_size == 2048
        assert metadata.accepts_ranges is False


async def test_missing_content_length(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/unknown-size.zip").mock(
            return_value=httpx.Response(200, headers={"Accept-Ranges": "bytes"})
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/unknown-size.zip")
        assert metadata.total_size is None
        assert metadata.accepts_ranges is True


async def test_content_disposition_quoted_filename(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/file").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "100",
                    "Content-Disposition": 'attachment; filename="report.pdf"',
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/file")
        assert metadata.suggested_filename == "report.pdf"


async def test_content_disposition_rfc6266_utf8(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/file").mock(
            return_value=httpx.Response(
                200,
                headers={
                    "Content-Length": "100",
                    "Content-Disposition": "attachment; filename*=UTF-8''My%20File.zip",
                },
            )
        )
        probe = HttpxMetadataProbe(client)
        metadata = await probe.probe("https://files.example.com/file")
        assert metadata.suggested_filename == "My File.zip"


async def test_http_error_raises(client: httpx.AsyncClient) -> None:
    with respx.mock(base_url="https://files.example.com") as mock:
        mock.head("/gone.zip").mock(return_value=httpx.Response(405))
        # 405 fallback triggers GET, so GET must also fail
        mock.get("/gone.zip").mock(return_value=httpx.Response(404))
        probe = HttpxMetadataProbe(client)
        with pytest.raises(httpx.HTTPStatusError):
            await probe.probe("https://files.example.com/gone.zip")
