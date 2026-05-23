# dm-api — Download Manager Backend

Phase 1 ships the pure-Python domain layer and SQLite schema. No HTTP server,
no download logic — that arrives in Phase 2.

## Quickstart

```bash
cd apps/api
uv sync                                       # install deps
uv run ruff check                             # lint
uv run mypy --strict src/dm_api/domain        # type-check the domain
uv run pytest                                 # unit + integration tests
uv run alembic upgrade head                   # create the SQLite DB
```

## Layout

```
src/dm_api/
├── domain/                  # pure-Python, no framework imports
│   ├── entities/            # DownloadTask, DownloadSegment, DownloadQueue
│   ├── value_objects/       # StrEnum status types
│   ├── policies/            # SegmentationPolicy, RetryPolicy, ChecksumPolicy, SpeedLimitPolicy
│   └── events/              # 11 frozen-dataclass domain events
└── infrastructure/
    └── persistence/
        └── migrations/      # Alembic — initial schema in versions/0001_initial.py
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DM_DATABASE_URL` | Full SQLAlchemy URL (used by tests). Overrides `DM_DATA_DIR`. |
| `DM_DATA_DIR` | Directory for `app.db`. Defaults to platform-specific path. |

## Dependency rule

The `domain/` package may only import the Python standard library and sibling
modules under `dm_api.domain`. This is enforced by `tests/unit/test_dependency_rule.py`,
which scans every domain file's AST on every test run.
