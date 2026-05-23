"""uvicorn entry point.

Bind defaults to 127.0.0.1:6543. The host check rejects any non-loopback
address even if the user tries to override it — this app is local-only by
design.
"""
from __future__ import annotations

import os

import uvicorn

from dm_api.presentation.app import create_app

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6543
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _validate_host(host: str) -> None:
    if host not in _LOOPBACK_HOSTS:
        raise RuntimeError(
            f"DM_API_HOST must be a loopback address; got {host!r}. "
            "This app is local-only by design."
        )


def main() -> None:
    host = os.environ.get("DM_API_HOST", DEFAULT_HOST)
    _validate_host(host)
    port = int(os.environ.get("DM_API_PORT", DEFAULT_PORT))
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
