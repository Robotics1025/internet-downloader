# dm-api — Download Manager Backend

Phase 2b ships real downloads. `POST /api/downloads/{id}/start` triggers an
async background fetch via httpx + aiofiles; bytes are streamed to disk at
`{save_path}/{file_name}.part` and atomically renamed on completion.

## Quickstart

```bash
cd apps/api
uv sync                                          # install deps
uv run ruff check                                # lint
uv run mypy --strict src/dm_api/domain src/dm_api/application
uv run pytest                                    # unit + integration tests
uv run alembic upgrade head                      # create the SQLite DB
uv run python -m dm_api.presentation.main        # boot the API on 127.0.0.1:6543
```

In another shell — full end-to-end demo:

```bash
ID=$(curl -s -X POST http://127.0.0.1:6543/api/downloads \
    -H "Content-Type: application/json" \
    -d '{"url":"https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"}' \
    | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

curl -s -X POST http://127.0.0.1:6543/api/downloads/$ID/start | python -m json.tool

# Poll progress
while true; do
  curl -s http://127.0.0.1:6543/api/downloads/$ID | python -m json.tool
  sleep 2
done
```

When `status` becomes `"completed"`, the file is at `~/Downloads/BigBuckBunny_320x180.mp4`.

## Layout

```
src/dm_api/
├── domain/                       # pure-Python, framework-free
├── application/                  # ports + use cases + services
│   ├── ports/
│   │   ├── download_repository.py
│   │   ├── event_bus.py
│   │   ├── metadata_probe.py
│   │   └── segment_worker.py
│   ├── use_cases/
│   │   ├── add_download.py
│   │   ├── get_download.py
│   │   └── start_download.py
│   └── services/
│       └── download_runner.py
├── infrastructure/
│   ├── events/
│   │   └── in_memory_event_bus.py
│   ├── http/                     # Phase 2b
│   │   ├── http_client.py
│   │   ├── httpx_metadata_probe.py
│   │   └── single_segment_worker.py
│   └── persistence/
│       ├── sqlite_download_repository.py
│       └── migrations/
└── presentation/
    ├── app.py
    ├── main.py
    ├── routers/
    │   ├── health.py
    │   └── downloads.py
    └── schemas/
        └── download_dto.py
```

## API surface

| Method | Path | Description |
|---|---|---|
| GET | /api/health | Liveness + active-downloads count |
| POST | /api/downloads | Create a download (status=pending) |
| GET | /api/downloads/{id} | Fetch one |
| GET | /api/downloads | List newest-first |
| POST | /api/downloads/{id}/start | Begin async download (returns 202) |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DM_API_HOST` | `127.0.0.1` | Server bind (loopback only — enforced at startup) |
| `DM_API_PORT` | `6543` | Server port |
| `DM_DATABASE_URL` | derived | Full SQLAlchemy URL (used by tests) |
| `DM_DATA_DIR` | platform default | Directory for `app.db` |

## Dependency rules

- `domain/` may import stdlib + sibling `domain` only
- `application/` may import stdlib + `domain` + sibling `application` only
- `infrastructure/` and `presentation/` may import anything

Enforced by static AST tests in `tests/unit/test_dependency_rule.py` and
`tests/unit/application/test_dependency_rule.py`.
