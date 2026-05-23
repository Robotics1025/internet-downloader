# dm-api — Download Manager Backend

Phase 2a ships the persistence layer and a FastAPI server bound to
127.0.0.1:6543. Downloads can be created and queried — actual downloading
arrives in Phase 2b.

## Quickstart

```bash
cd apps/api
uv sync                                          # install deps
uv run ruff check                                # lint
uv run mypy --strict src/dm_api/domain src/dm_api/application
uv run pytest                                    # all unit + integration tests
uv run alembic upgrade head                      # create the SQLite DB
uv run python -m dm_api.presentation.main        # boot the API on 127.0.0.1:6543
```

In another shell:

```bash
curl -s http://127.0.0.1:6543/api/health | python -m json.tool
curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/file.zip"}' | python -m json.tool
curl -s http://127.0.0.1:6543/api/downloads | python -m json.tool
```

## Layout

```
src/dm_api/
├── domain/                       # pure-Python, framework-free
│   ├── entities/
│   ├── value_objects/
│   ├── policies/
│   └── events/
├── application/                  # use cases + ports
│   ├── ports/
│   │   ├── download_repository.py
│   │   └── event_bus.py
│   └── use_cases/
│       ├── add_download.py
│       └── get_download.py
├── infrastructure/
│   ├── events/
│   │   └── in_memory_event_bus.py
│   └── persistence/
│       ├── sqlite_download_repository.py
│       └── migrations/
└── presentation/
    ├── app.py                    # FastAPI factory + lifespan
    ├── main.py                   # uvicorn entry point
    ├── routers/
    │   ├── health.py
    │   └── downloads.py
    └── schemas/
        └── download_dto.py
```

## API surface (Phase 2a)

| Method | Path | Description |
|---|---|---|
| GET | /api/health | Liveness + active-downloads count |
| POST | /api/downloads | Create a download (status=PENDING) |
| GET | /api/downloads/{id} | Fetch one |
| GET | /api/downloads | List newest-first |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Server bind (loopback only — enforced at startup) |
| `DM_API_PORT` | `6543` | Server port |
| `DM_DATABASE_URL` | derived | Full SQLAlchemy URL (used by tests) |
| `DM_DATA_DIR` | platform default | Directory for `app.db` (Linux: `~/.local/share/download-manager`) |

## Dependency rules

- `domain/` may import stdlib + sibling `domain` only
- `application/` may import stdlib + `domain` + sibling `application` only
- `infrastructure/` and `presentation/` may import anything

These rules are enforced by static AST tests in `tests/unit/test_dependency_rule.py`
and `tests/unit/application/test_dependency_rule.py`.
