"""Isolate SQLite DB per test session before importing the app."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_tmp_dir = tempfile.mkdtemp()
_db_path = Path(_tmp_dir) / "hworkr_pytest.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path.as_posix()}"
