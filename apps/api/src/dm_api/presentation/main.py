"""uvicorn entry point.

Bind defaults to 127.0.0.1:6543. The host check rejects any non-loopback
address — this app is local-only by design.

When spawned as a sidecar by the Tauri desktop shell, the parent process needs
to know which port we actually bound to (it may differ from the requested port
if 6543 was taken). We pre-bind a socket, print ``DM_PORT <N>`` as a single line
to stdout, and hand the socket to uvicorn via its ``fd`` config option so there
is no race window between port discovery and accept().
"""
from __future__ import annotations

import argparse
import socket
import sys

import uvicorn

from dm_api.infrastructure.logging.setup import configure_logging
from dm_api.presentation.app import create_app

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6543
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _validate_host(host: str) -> None:
    if host not in _LOOPBACK_HOSTS:
        raise RuntimeError(
            f"--host must be a loopback address; got {host!r}. "
            "This app is local-only by design."
        )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="dm-api")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)
    try:
        _validate_host(args.host)
    except RuntimeError as exc:
        parser.error(str(exc))
    return args


def _bind(host: str, port: int) -> socket.socket:
    """Return a bound + listening socket. If ``port`` is busy, fall back to an
    OS-assigned port (port 0)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
    except OSError:
        # Requested port is in use — let the OS pick one.
        sock.close()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind((host, 0))
    sock.listen(128)
    return sock


def main(argv: list[str] | None = None) -> None:
    configure_logging()
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    sock = _bind(args.host, args.port)
    actual_port = sock.getsockname()[1]
    # Announce the port BEFORE serving so whatever spawned us can pick it up
    # without polling.
    print(f"DM_PORT {actual_port}", flush=True)
    config = uvicorn.Config(create_app(), fd=sock.fileno(), log_level="info")
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
