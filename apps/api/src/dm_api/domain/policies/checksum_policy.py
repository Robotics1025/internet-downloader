"""ChecksumPolicy — extract supported checksum hints from HTTP response headers.

Only MD5 and SHA-256 are supported. Any other algorithm hint is ignored —
never invent a checksum and never fail a download for missing one.
"""
from collections.abc import Mapping

_SUPPORTED_DIGEST_ALGOS = {"md5", "sha-256"}


class ChecksumPolicy:
    @staticmethod
    def from_headers(headers: Mapping[str, str]) -> tuple[str, str] | None:
        normalized = {k.lower(): v for k, v in headers.items()}

        content_md5 = normalized.get("content-md5")
        if content_md5 is not None:
            return ("md5", content_md5.strip())

        digest = normalized.get("digest")
        if digest is None:
            return None

        digest = digest.strip()
        if "=" not in digest:
            return None

        algo, _, value = digest.partition("=")
        algo = algo.strip().lower()
        value = value.strip()
        if algo not in _SUPPORTED_DIGEST_ALGOS or not value:
            return None
        return (algo, value)
