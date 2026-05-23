"""Static enforcement of the Clean Architecture dependency rule.

Domain code MUST NOT import:
- Web frameworks (fastapi, httpx, requests, pydantic)
- ORMs / DB drivers (sqlalchemy, alembic, aiosqlite)
- Any sibling layer (dm_api.application, dm_api.infrastructure, dm_api.presentation)

This is a static AST scan, not a runtime check, so even unreachable imports fail.
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
})

_DENY_DM_API_SUBPACKAGES = frozenset({
    "dm_api.application",
    "dm_api.infrastructure",
    "dm_api.presentation",
})


def _domain_files() -> list[Path]:
    here = Path(__file__).resolve()
    domain_root = here.parent.parent.parent / "src" / "dm_api" / "domain"
    return sorted(p for p in domain_root.rglob("*.py"))


def _module_is_forbidden(module: str) -> bool:
    top = module.split(".")[0]
    if top in _DENY_TOP_LEVEL:
        return True
    return any(module == sub or module.startswith(sub + ".") for sub in _DENY_DM_API_SUBPACKAGES)


def test_domain_files_were_discovered() -> None:
    files = _domain_files()
    assert files, "no Python files found under src/dm_api/domain"


@pytest.mark.parametrize("path", _domain_files(), ids=lambda p: str(p))
def test_domain_file_imports_are_clean(path: Path) -> None:
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
