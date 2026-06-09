"""add file_missing to downloads (external-deletion reconcile)

Revision ID: 0003_file_missing
Revises: 0002_media_format_id
Create Date: 2026-06-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_file_missing"
down_revision: str | Sequence[str] | None = "0002_media_format_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "downloads",
        sa.Column("file_missing", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("downloads", "file_missing")
