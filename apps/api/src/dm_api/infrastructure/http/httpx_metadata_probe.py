"""HTTP metadata probe using httpx.AsyncClient.

Tries HEAD first; falls back to a streamed GET (closed after headers arrive)
when the server returns 405 Method Not Allowed.
"""
from __future__ import annotations

import re
from urllib.parse import unquote

import httpx

from dm_api.application.ports.metadata_probe import FileMetadata


class HttpxMetadataProbe:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def probe(self, url: str) -> FileMetadata:
        response = await self._client.head(url)
        if response.status_code == 405:
            async with self._client.stream("GET", url) as stream_response:
                stream_response.raise_for_status()
                return _parse(stream_response)
        response.raise_for_status()
        return _parse(response)


def _parse(response: httpx.Response) -> FileMetadata:
    content_length = response.headers.get("content-length")
    total_size = int(content_length) if content_length is not None else None
    accepts_ranges = response.headers.get("accept-ranges", "").lower() == "bytes"
    suggested_filename = _parse_content_disposition(
        response.headers.get("content-disposition")
    )
    return FileMetadata(
        total_size=total_size,
        accepts_ranges=accepts_ranges,
        suggested_filename=suggested_filename,
    )


_RFC6266_STAR = re.compile(r"filename\*\s*=\s*([^']*)'[^']*'(.+?)(?:;|$)", re.IGNORECASE)
_RFC6266_PLAIN = re.compile(r'filename\s*=\s*"([^"]+)"', re.IGNORECASE)


def _parse_content_disposition(header: str | None) -> str | None:
    if not header:
        return None
    star_match = _RFC6266_STAR.search(header)
    if star_match:
        return unquote(star_match.group(2).strip())
    plain_match = _RFC6266_PLAIN.search(header)
    if plain_match:
        return plain_match.group(1).strip()
    return None
