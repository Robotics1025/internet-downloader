"""WebSocket gateway for progress updates."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from dm_api.presentation.schemas.progress_dto import ProgressSnapshotDTO

router = APIRouter(prefix="/ws", tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/progress")
async def progress_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    progress_service = websocket.app.state.progress_service

    # We use an asyncio.Queue to decouple the sync callback from the async send
    queue: asyncio.Queue[ProgressSnapshotDTO] = asyncio.Queue(maxsize=100)

    def _on_progress(snapshot: ProgressSnapshotDTO) -> None:
        import contextlib
        with contextlib.suppress(asyncio.QueueFull):
            queue.put_nowait(snapshot)

    progress_service.subscribe(_on_progress)

    try:
        while True:
            snapshot = await queue.get()
            await websocket.send_json(snapshot.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        progress_service.unsubscribe(_on_progress)
