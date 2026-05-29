"""Progress Data Transfer Object — re-exported from the application layer.

The canonical definition lives in ``dm_api.application.ports.progress_snapshot``
so that the application service can import it without violating the layer rule.
This module re-exports it for backward compatibility.
"""
from dm_api.application.ports.progress_snapshot import ProgressSnapshotDTO

__all__ = ["ProgressSnapshotDTO"]
