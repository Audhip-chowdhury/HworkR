#!/usr/bin/env python3
"""
Insert one approved requisition with a fixed 6-character code for demos / QA.

Run from `backend`:

    python scripts/seed_approved_requisition.py
    python scripts/seed_approved_requisition.py <company_id>
    python scripts/seed_approved_requisition.py --company-name "Demo org tree (seed)"

Optional: --init-db

Re-running skips if a requisition with req_code SEED01 already exists (globally unique).
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
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry
from app.models.recruitment import Requisition

SEED_REQ_CODE = "SEED01"


def _pick_created_by(session: Session, company_id: str) -> str:
    for role in ("company_admin", "talent_acquisition", "hr_ops", "employee"):
        m = session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.role == role,
                CompanyMembership.status == "active",
            ).limit(1)
        ).scalar_one_or_none()
        if m is not None:
            return m.user_id
    raise SystemExit(f"No active company membership found for company_id={company_id!r}")


def _first_department_id(session: Session, company_id: str) -> str | None:
    d = session.execute(
        select(Department.id).where(Department.company_id == company_id).limit(1)
    ).scalar_one_or_none()
    return d


def _first_job_catalog_id(session: Session, company_id: str) -> str | None:
    j = session.execute(
        select(JobCatalogEntry.id).where(JobCatalogEntry.company_id == company_id).limit(1)
    ).scalar_one_or_none()
    return j


def _resolve_company(session: Session, company_id: str | None, company_name: str | None) -> Company:
    if company_id and company_id.strip():
        c = session.execute(select(Company).where(Company.id == company_id.strip())).scalar_one_or_none()
        if c is None:
            raise SystemExit(f"No company with id={company_id!r}")
        return c
    name = (company_name or "Demo org tree (seed)").strip()
    c = session.execute(select(Company).where(Company.name == name)).scalar_one_or_none()
    if c is None:
        raise SystemExit(
            f"No company named {name!r}. Pass a company UUID, or create the demo org: "
            "python scripts/seed_demo_org_tree.py"
        )
    return c


def seed(session: Session, company_id: str) -> None:
    existing = session.execute(select(Requisition).where(Requisition.req_code == SEED_REQ_CODE)).scalar_one_or_none()
    if existing is not None:
        print(f"Skip: requisition with req_code {SEED_REQ_CODE!r} already exists ({existing.id}).")
        return

    created_by = _pick_created_by(session, company_id)
    dept_id = _first_department_id(session, company_id)
    job_id = _first_job_catalog_id(session, company_id)

    req = Requisition(
        id=uuid_str(),
        company_id=company_id,
        created_by=created_by,
        department_id=dept_id,
        job_id=job_id,
        req_code=SEED_REQ_CODE,
        headcount=1,
        status="approved",
        hiring_criteria_json={"skills": ["Communication"], "experience": "2+ years", "education": None},
        approval_chain_json=None,
    )
    session.add(req)
    session.commit()
    print(f"Inserted approved requisition req_code={SEED_REQ_CODE!r} id={req.id} for company {company_id}.")


def main() -> None:
    p = argparse.ArgumentParser(description="Seed one approved requisition (SEED01).")
    p.add_argument("company_id", nargs="?", default=None, help="Company UUID (optional if --company-name matches)")
    p.add_argument(
        "--company-name",
        default="Demo org tree (seed)",
        help="Company name to look up if company_id is omitted",
    )
    p.add_argument("--init-db", action="store_true", help="Run init_db() first")
    args = p.parse_args()

    if args.init_db:
        init_db()

    db = SessionLocal()
    try:
        company = _resolve_company(db, args.company_id, args.company_name)
        print(f"Company: {company.name!r} ({company.id})")
        seed(db, company.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()
