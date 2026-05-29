"""Config defaults the UI uses to prefill the Add-Download dialog.

Returns the platform-appropriate Downloads directory so the frontend doesn't
have to guess (it would otherwise interpolate `window.location.hostname`,
which is `127.0.0.1` and not a real user).
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from dm_api.application.use_cases.add_download import _default_save_path

router = APIRouter(prefix="/api/config", tags=["config"])


class Defaults(BaseModel):
    save_path: str


@router.get("/defaults", response_model=Defaults)
async def defaults() -> Defaults:
    return Defaults(save_path=_default_save_path())
