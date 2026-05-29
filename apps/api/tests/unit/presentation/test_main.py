"""Unit tests for the uvicorn entry point. We don't actually start the server
here — we just verify the host validation logic."""
from __future__ import annotations

import socket
import sys
from unittest.mock import MagicMock

import pytest

from dm_api.presentation import main
from dm_api.presentation import main as main_mod


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1"])
def test_loopback_hosts_are_accepted(host: str) -> None:
    main._validate_host(host)  # must not raise


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.1", "example.com"])
def test_non_loopback_hosts_are_rejected(host: str) -> None:
    with pytest.raises(RuntimeError, match="loopback"):
        main._validate_host(host)


def test_parse_args_defaults() -> None:
    args = main_mod._parse_args([])
    assert args.host == "127.0.0.1"
    assert args.port == 6543


def test_parse_args_explicit() -> None:
    args = main_mod._parse_args(["--host", "::1", "--port", "0"])
    assert args.host == "::1"
    assert args.port == 0


def test_parse_args_rejects_non_loopback_host() -> None:
    with pytest.raises(SystemExit):
        # argparse will call _validate_host and exit on error.
        main_mod._parse_args(["--host", "0.0.0.0"])


def test_bind_returns_listening_socket_on_explicit_port() -> None:
    sock = main_mod._bind("127.0.0.1", 0)
    try:
        # Port 0 means OS-assigned; getsockname() reports the real port.
        assigned_port = sock.getsockname()[1]
        assert assigned_port > 0
    finally:
        sock.close()


def test_bind_falls_back_to_random_port_when_requested_is_busy() -> None:
    # First grab a port so the next bind sees EADDRINUSE.
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    busy_port = blocker.getsockname()[1]

    try:
        sock = main_mod._bind("127.0.0.1", busy_port)
        try:
            assigned = sock.getsockname()[1]
            assert assigned > 0
            assert assigned != busy_port
        finally:
            sock.close()
    finally:
        blocker.close()


def test_main_prints_dm_port_before_uvicorn_runs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The DM_PORT line must be flushed to stdout BEFORE uvicorn enters its
    blocking serve loop, so the Tauri shell sees the port immediately."""
    fake_server = MagicMock()
    fake_server.run = MagicMock()

    monkeypatch.setattr(main_mod.uvicorn, "Server", MagicMock(return_value=fake_server))
    monkeypatch.setattr(main_mod.uvicorn, "Config", MagicMock())
    monkeypatch.setattr(main_mod, "configure_logging", lambda: None)

    main_mod.main(["--port", "0"])

    captured = capsys.readouterr().out.splitlines()
    dm_port_lines = [line for line in captured if line.startswith("DM_PORT ")]
    assert len(dm_port_lines) == 1
    port_str = dm_port_lines[0].split(" ", 1)[1]
    assert int(port_str) > 0
