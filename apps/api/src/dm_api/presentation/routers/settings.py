"""Settings router — GET reads merged-with-defaults, PUT applies a partial patch."""
from __future__ import annotations

from fastapi import APIRouter, Request

from dm_api.application.ports.settings_repository import SettingsRepository
from dm_api.presentation.schemas.settings_dto import SettingsDTO, SettingsPatchDTO

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _repo(request: Request) -> SettingsRepository:
    return request.app.state.settings_repo


@router.get("", response_model=SettingsDTO)
async def get_settings(request: Request) -> SettingsDTO:
    """Return the current settings, merged with defaults for missing keys."""
    stored = await _repo(request).get_all()
    return SettingsDTO(**stored)


@router.put("", response_model=SettingsDTO)
async def update_settings(request: Request, body: SettingsPatchDTO) -> SettingsDTO:
    """Apply a partial patch and return the updated settings."""
    overrides = body.to_overrides()
    if overrides:
        await _repo(request).set_many(overrides)
    stored = await _repo(request).get_all()
    return SettingsDTO(**stored)
