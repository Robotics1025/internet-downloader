"""Static enforcement of the Clean Architecture dependency rule for the
application layer.

application/ MUST NOT import:
- Web/HTTP libraries (fastapi, httpx, requests, pydantic, uvicorn)
- ORMs / DB drivers (sqlalchemy, alembic, aiosqlite)
- Sibling layers (dm_api.infrastructure, dm_api.presentation)

Allowed: stdlib, dm_api.domain.*, dm_api.application.*
"""
import ast
from pathlib import Path

import pytest

_DENY_TOP_LEVEL = frozenset({
    "fastapi",
    "httpx",
    "requests",
    "pydantic",
    "sqlalchemy",
    "alembic",
    "aiosqlite",
    "uvicorn",
})

_DENY_DM_API_SUBPACKAGES = frozenset({
    "dm_api.infrastructure",
    "dm_api.presentation",
})


def _application_files() -> list[Path]:
    here = Path(__file__).resolve()
    application_root = here.parent.parent.parent.parent / "src" / "dm_api" / "application"
    return sorted(p for p in application_root.rglob("*.py"))


def _module_is_forbidden(module: str) -> bool:
    top = module.split(".")[0]
    if top in _DENY_TOP_LEVEL:
        return True
    return any(module == sub or module.startswith(sub + ".") for sub in _DENY_DM_API_SUBPACKAGES)


def test_application_files_were_discovered() -> None:
    files = _application_files()
    assert files, "no Python files found under src/dm_api/application"


@pytest.mark.parametrize("path", _application_files(), ids=lambda p: str(p))
def test_application_file_imports_are_clean(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))

    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _module_is_forbidden(alias.name):
                    violations.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module and _module_is_forbidden(module):
                violations.append(f"from {module} import ...")

    assert not violations, f"{path} has forbidden imports: {violations}"
