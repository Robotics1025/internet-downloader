"""Settings persistence — read/write a key→value store of user preferences.

The repository deals in JSON-decoded Python values: an int comes out as an
``int``, a bool as a ``bool``, etc. JSON-encoding is the repository's concern,
not the caller's.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class SettingsRepository(ABC):
    @abstractmethod
    async def get_all(self) -> dict[str, Any]:
        """Return every stored key with its decoded value. Missing keys are
        absent from the dict — callers apply defaults."""

    @abstractmethod
    async def set_many(self, values: dict[str, Any]) -> None:
        """Upsert each key. Values are JSON-encoded internally."""
