"""Settings DTO — the on-the-wire shape of /api/settings."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Theme = Literal["light", "dark", "system"]
Quality = Literal["best", "1080p", "720p", "480p", "audio"]


class SettingsDTO(BaseModel):
    download_dir: str = Field(default="")  # empty = use platform default
    max_parallel: int = Field(default=3, ge=1, le=10)
    default_quality: Quality = "best"
    theme: Theme = "system"
    language: str = "en"
    auto_start_downloads: bool = True

    model_config = ConfigDict(extra="forbid")


class SettingsPatchDTO(BaseModel):
    """Partial update — every field is optional. Only present fields are written."""

    download_dir: str | None = None
    max_parallel: int | None = Field(default=None, ge=1, le=10)
    default_quality: Quality | None = None
    theme: Theme | None = None
    language: str | None = None
    auto_start_downloads: bool | None = None

    model_config = ConfigDict(extra="forbid")

    def to_overrides(self) -> dict[str, object]:
        """Only explicitly-set fields, for writing to the repo."""
        return {k: v for k, v in self.model_dump().items() if v is not None}
