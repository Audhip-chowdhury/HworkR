#!/usr/bin/env python3
"""
Seed departments and job catalog (job profile) rows for requisition / org forms.

Idempotent: skips rows that already exist for the same company + name/title.

Run from `backend`:

    python scripts/seed_department_job_catalog.py
    python scripts/seed_department_job_catalog.py --company-name "Demo org tree (seed)"
    python scripts/seed_department_job_catalog.py --company-id <uuid>

Uses DATABASE_URL / .env like other seeds. Runs init_db() first.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.org import Department, JobCatalogEntry

DEFAULT_COMPANY_NAME = "Demo org tree (seed)"

# Departments shown in Recruitment → New requisition (and org pickers).
DEPARTMENT_NAMES: list[str] = [
    "Engineering",
    "Product",
    "Human Resources",
    "Finance",
    "Operations",
    "Sales & Marketing",
]

# Job profiles: title, family, level, grade (for bands / pipeline display).
JOB_PROFILES: list[tuple[str, str | None, str | None, str | None]] = [
    ("Software Engineer", "Engineering", "Individual Contributor", "IC3"),
    ("Senior Software Engineer", "Engineering", "Individual Contributor", "IC4"),
    ("Engineering Manager", "Engineering", "Management", "M1"),
    ("Product Manager", "Product", "Individual Contributor", "IC4"),
    ("HR Business Partner", "Human Resources", "Individual Contributor", "IC3"),
    ("Financial Analyst", "Finance", "Individual Contributor", "IC3"),
    ("Operations Specialist", "Operations", "Individual Contributor", "IC2"),
    ("Account Executive", "Sales & Marketing", "Individual Contributor", "IC3"),
]


def _resolve_company(db: Session, *, company_id: str | None, company_name: str | None) -> Company:
    if company_id:
        c = db.execute(select(Company).where(Company.id == company_id)).scalar_one_or_none()
        if c is None:
            raise SystemExit(f"No company found with id {company_id!r}")
        return c
    name = company_name or DEFAULT_COMPANY_NAME
    c = db.execute(select(Company).where(Company.name == name)).scalar_one_or_none()
    if c is None:
        raise SystemExit(
            f"No company found with name {name!r}. Create the company first or pass --company-id."
        )
    return c


def ensure_department_job_catalog(db: Session, company_id: str) -> tuple[int, int]:
    """Insert missing departments and job catalog entries. Returns (depts_created, jobs_created)."""
    d_created = 0
    for name in DEPARTMENT_NAMES:
        exists = db.execute(
            select(Department).where(Department.company_id == company_id, Department.name == name)
        ).scalar_one_or_none()
        if exists:
            continue
        db.add(
            Department(
                id=uuid_str(),
                company_id=company_id,
                name=name,
                parent_id=None,
                head_employee_id=None,
                level=0,
            )
        )
        d_created += 1

    j_created = 0
    for title, family, level, grade in JOB_PROFILES:
        exists = db.execute(
            select(JobCatalogEntry).where(JobCatalogEntry.company_id == company_id, JobCatalogEntry.title == title)
        ).scalar_one_or_none()
        if exists:
            continue
        db.add(
            JobCatalogEntry(
                id=uuid_str(),
                company_id=company_id,
                title=title,
                family=family,
                level=level,
                grade=grade,
                salary_band_json=None,
            )
        )
        j_created += 1

    db.flush()
    return d_created, j_created


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company-id", default=None, help="Target company UUID (overrides name).")
    parser.add_argument(
        "--company-name",
        default=None,
        help=f'Company display name (default: {DEFAULT_COMPANY_NAME!r}). Ignored if --company-id is set.',
    )
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    try:
        company = _resolve_company(db, company_id=args.company_id, company_name=args.company_name)
        d_n, j_n = ensure_department_job_catalog(db, company.id)
        db.commit()
        print(f"Company: {company.name!r} ({company.id})")
        print(f"Departments created: {d_n} (total target list: {len(DEPARTMENT_NAMES)})")
        print(f"Job profiles created: {j_n} (total target list: {len(JOB_PROFILES)})")
        if d_n == 0 and j_n == 0:
            print("(All rows already present; nothing new inserted.)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
