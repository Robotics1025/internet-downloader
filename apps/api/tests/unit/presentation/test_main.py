"""Unit tests for the uvicorn entry point. We don't actually start the server
here — we just verify the host validation logic."""
from __future__ import annotations

import pytest

from dm_api.presentation import main


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1"])
def test_loopback_hosts_are_accepted(host: str) -> None:
    main._validate_host(host)  # must not raise


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.1", "example.com"])
def test_non_loopback_hosts_are_rejected(host: str) -> None:
    with pytest.raises(RuntimeError, match="loopback"):
        main._validate_host(host)
