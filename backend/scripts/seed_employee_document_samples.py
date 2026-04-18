#!/usr/bin/env python3
"""
Write sample photo, government ID (image), and offer letter (PDF) for employees.

Creates tiny placeholder files under uploads/employee_documents/ and marks rows submitted.
Idempotent: skips documents already submitted unless SEED_DOCS_FORCE=1.

Usage (from backend/):
  python3 scripts/seed_employee_document_samples.py

Optional env:
  SEED_DOCS_COMPANY_ID=<uuid>   # limit to one company (default: all companies)
  SEED_DOCS_FORCE=1              # overwrite existing submitted documents

Skips employee code KO-FASH-DEMO-001 (demo incomplete user from seed_demo_incomplete_employee.py).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.database import SessionLocal  # noqa: E402
from app.services.seed_employee_documents import seed_sample_employee_documents  # noqa: E402


def main() -> None:
    cid = os.environ.get("SEED_DOCS_COMPANY_ID", "").strip() or None
    force = os.environ.get("SEED_DOCS_FORCE", "").strip() in ("1", "true", "yes")

    with SessionLocal() as session:
        n_emp, n_files = seed_sample_employee_documents(session, company_id=cid, force=force)
        session.commit()

    scope = f"company {cid}" if cid else "all companies"
    print(f"Sample employee documents seeded ({scope}): {n_emp} employees updated, {n_files} files written.")
    if n_emp == 0 and n_files == 0:
        print("Nothing to do (all documents already submitted, or no employees). Use SEED_DOCS_FORCE=1 to replace.")


if __name__ == "__main__":
    main()
