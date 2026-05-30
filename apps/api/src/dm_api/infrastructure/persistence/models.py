"""SQLAlchemy Core table definitions shared across the infrastructure layer."""
from __future__ import annotations

import sqlalchemy as sa

metadata = sa.MetaData()

settings_table = sa.Table(
    "settings",
    metadata,
    sa.Column("key", sa.String, primary_key=True),
    sa.Column("value", sa.String, nullable=False),
)
