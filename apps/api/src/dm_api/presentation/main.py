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


DISCOVERY_PORT_RANGE = range(6543, 6553)  # 10 ports: 6543..6552
"""Ports the browser extension scans to find the API. We try every port in this
range sequentially before falling back to an OS-assigned ephemeral port, so the
extension's narrow port scan keeps working even when 6543 is busy from a
previous instance that hasn't fully released the socket yet."""


def _bind(host: str, port: int) -> socket.socket:
    """Return a bound + listening socket.

    Strategy when ``port`` is busy:
      1. Try every port in ``DISCOVERY_PORT_RANGE`` (6543–6552) in order.
      2. If none are free, fall back to an OS-assigned ephemeral port.
    """
    def _try_bind(p: int) -> socket.socket | None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind((host, p))
        except OSError:
            s.close()
            return None
        return s

    sock = _try_bind(port)
    if sock is None:
        # Sequential fall-through across the discovery range so the extension
        # can still find us with a small scan.
        for candidate in DISCOVERY_PORT_RANGE:
            if candidate == port:
                continue  # already tried
            sock = _try_bind(candidate)
            if sock is not None:
                break
    if sock is None:
        # Last resort: OS picks anything.
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
    # log_config=None tells uvicorn not to call dictConfig(LOGGING_CONFIG) on
    # startup, which would otherwise wipe the root-logger handlers we just
    # installed via configure_logging() and prevent any records from reaching
    # the JSON file handler.
    config = uvicorn.Config(
        create_app(),
        log_level="info",
        log_config=None,
    )
    server = uvicorn.Server(config)
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
