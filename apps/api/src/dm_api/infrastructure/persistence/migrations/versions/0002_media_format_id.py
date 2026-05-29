"""add media_format_id to downloads (for yt-dlp media downloads)

Revision ID: 0002_media_format_id
Revises: 0001_initial
Create Date: 2026-05-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_media_format_id"
down_revision: str | Sequence[str] | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "downloads",
        sa.Column("media_format_id", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("downloads", "media_format_id")
