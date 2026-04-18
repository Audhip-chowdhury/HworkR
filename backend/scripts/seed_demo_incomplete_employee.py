#!/usr/bin/env python3
"""
Create one Knives Out employee with:
  - No phone, address, or emergency contacts → profile_incomplete inbox task
  - Missing primary documents (photo, gov_id, offer_letter) → document_required tasks

Login: demo.incomplete@knivesout-seed.example.com (password from KNIVES_OUT_SEED_PASSWORD or KnivesOutSeed!2026)

Idempotent: skips if employee code KO-FASH-DEMO-001 already exists.

Run after Knives Out org exists (e.g. after seed_knives_out_fashion.py) so department/job/location exist.

Sample document seed (seed_employee_document_samples.py) skips this employee code so docs stay missing.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.user import User
from app.services.employee_document_sync import ensure_default_document_rows, sync_document_inbox_tasks
from app.services.profile_inbox_sync import sync_profile_inbox_tasks

COMPANY_NAME = "Knives Out"
CODE_DEMO = "KO-FASH-DEMO-001"
EMAIL_DEMO = "demo.incomplete@knivesout-seed.example.com"


def _find_company(session: Session) -> Company | None:
    cid = os.environ.get("KNIVES_OUT_COMPANY_ID", "").strip()
    if cid:
        return session.execute(select(Company).where(Company.id == cid)).scalar_one_or_none()
    return session.execute(
        select(Company).where(func.lower(Company.name) == COMPANY_NAME.lower())
    ).scalar_one_or_none()


def main() -> None:
    password = os.environ.get("KNIVES_OUT_SEED_PASSWORD", "KnivesOutSeed!2026")

    with SessionLocal() as session:
        company = _find_company(session)
        if company is None:
            print(f'Company "{COMPANY_NAME}" not found. Create it or set KNIVES_OUT_COMPANY_ID.')
            sys.exit(1)

        existing = session.execute(
            select(Employee).where(Employee.company_id == company.id, Employee.employee_code == CODE_DEMO)
        ).scalar_one_or_none()
        if existing:
            print(f"Already seeded (found {CODE_DEMO}). Nothing to do.")
            sys.exit(0)

        dept = session.execute(
            select(Department).where(Department.company_id == company.id).limit(1)
        ).scalar_one_or_none()
        job = session.execute(
            select(JobCatalogEntry).where(JobCatalogEntry.company_id == company.id).limit(1)
        ).scalar_one_or_none()
        loc = session.execute(
            select(Location).where(Location.company_id == company.id).limit(1)
        ).scalar_one_or_none()
        if not dept or not job or not loc:
            print("Need at least one department, job catalog entry, and location. Run seed_knives_out_fashion.py first.")
            sys.exit(1)

        u = session.execute(select(User).where(User.email == EMAIL_DEMO)).scalar_one_or_none()
        if u is None:
            u = User(
                id=uuid_str(),
                email=EMAIL_DEMO,
                password_hash=get_password_hash(password),
                name="Demo Incomplete",
                is_platform_admin=False,
            )
            session.add(u)
            session.flush()
        uid = u.id

        if not session.execute(
            select(CompanyMembership).where(
                CompanyMembership.user_id == uid, CompanyMembership.company_id == company.id
            )
        ).scalar_one_or_none():
            session.add(
                CompanyMembership(
                    id=uuid_str(),
                    user_id=uid,
                    company_id=company.id,
                    role="employee",
                    status="active",
                )
            )

        emp = Employee(
            id=uuid_str(),
            company_id=company.id,
            user_id=uid,
            employee_code=CODE_DEMO,
            department_id=dept.id,
            job_id=job.id,
            manager_id=None,
            location_id=loc.id,
            status="active",
            hire_date="2025-01-06",
            personal_info_json={
                "fullName": "Demo Incomplete",
            },
            documents_json={},
        )
        session.add(emp)
        session.flush()

        ensure_default_document_rows(session, company.id, emp.id)
        sync_document_inbox_tasks(session, emp)
        sync_profile_inbox_tasks(session, emp)

        session.commit()

        print("Demo incomplete employee created.")
        print(f"  Company: {company.name} ({company.id})")
        print(f"  Employee code: {CODE_DEMO}")
        print(f"  Login: {EMAIL_DEMO}")
        print(f"  Password: (KNIVES_OUT_SEED_PASSWORD or default KnivesOutSeed!2026)")
        print("  Expect inbox tasks: profile incomplete + 3 document tasks.")


if __name__ == "__main__":
    main()
