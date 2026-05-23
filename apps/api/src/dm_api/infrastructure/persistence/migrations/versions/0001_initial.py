"""initial schema: downloads, segments, queues, queue_items, settings

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-22

Mirrors SYSTEM_DESIGN.md §8.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "downloads",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("file_name", sa.Text(), nullable=False),
        sa.Column("save_path", sa.Text(), nullable=False),
        sa.Column("total_size", sa.Integer(), nullable=True),
        sa.Column("downloaded_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("category", sa.Text(), nullable=False, server_default="general"),
        sa.Column("speed_limit", sa.Integer(), nullable=True),
        sa.Column("resume_supported", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("segment_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("checksum", sa.Text(), nullable=True),
        sa.Column("checksum_algorithm", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("started_at", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.Text(), nullable=True),
    )
    op.create_index("ix_downloads_status", "downloads", ["status"])
    op.create_index("ix_downloads_category", "downloads", ["category"])

    op.create_table(
        "segments",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("download_id", sa.Text(), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("start_byte", sa.Integer(), nullable=False),
        sa.Column("end_byte", sa.Integer(), nullable=False),
        sa.Column("downloaded_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("temp_file_path", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["download_id"],
            ["downloads.id"],
            ondelete="CASCADE",
            name="fk_segments_download_id",
        ),
    )
    op.create_index("ix_segments_download_id", "segments", ["download_id"])

    op.create_table(
        "queues",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("max_parallel_downloads", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("speed_limit", sa.Integer(), nullable=True),
        sa.UniqueConstraint("name", name="uq_queues_name"),
    )

    op.create_table(
        "queue_items",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("queue_id", sa.Text(), nullable=False),
        sa.Column("download_id", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["queue_id"], ["queues.id"], name="fk_queue_items_queue_id"
        ),
        sa.ForeignKeyConstraint(
            ["download_id"], ["downloads.id"], name="fk_queue_items_download_id"
        ),
    )
    op.create_index("ix_queue_items_queue_id", "queue_items", ["queue_id"])

    op.create_table(
        "settings",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_index("ix_queue_items_queue_id", table_name="queue_items")
    op.drop_table("queue_items")
    op.drop_table("queues")
    op.drop_index("ix_segments_download_id", table_name="segments")
    op.drop_table("segments")
    op.drop_index("ix_downloads_category", table_name="downloads")
    op.drop_index("ix_downloads_status", table_name="downloads")
    op.drop_table("downloads")
