#!/usr/bin/env python3
"""
Create a manager user + employee for Kopal's company and set them as manager
of the seeded test employee (employee.kopal@example.com).

Run from `backend`:

    python scripts/seed_kopal_manager.py

Requires: same env as API (DATABASE_URL). Uses passlib only (no jose).
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.user import User

REPORTEE_EMAIL = "employee.kopal@example.com"
MANAGER_EMAIL = "manager.kopal@example.com"
MANAGER_PASSWORD = "manager123"
MANAGER_NAME = "Kopal Test Manager"

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _hash(pw: str) -> str:
    return _pwd.hash(pw)


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        r = db.execute(select(Company).where(Company.name.ilike("%kopal%")))
        companies = list(r.scalars().all())
        if not companies:
            raise SystemExit("No company matching 'kopal'")
        if len(companies) > 1:
            print("Multiple companies; using first:", companies[0].id)
        company = companies[0]
        print(f"Company: {company.name!r} ({company.id})")

        ru = db.execute(select(User).where(User.email == REPORTEE_EMAIL.lower())).scalar_one_or_none()
        if ru is None:
            raise SystemExit(f"Reportee user not found: {REPORTEE_EMAIL}")
        reportee_emp = db.execute(
            select(Employee).where(Employee.company_id == company.id, Employee.user_id == ru.id)
        ).scalar_one_or_none()
        if reportee_emp is None:
            raise SystemExit("Reportee employee row not found for kopal test user")

        mu = db.execute(select(User).where(User.email == MANAGER_EMAIL.lower())).scalar_one_or_none()
        if mu is None:
            mu = User(
                id=uuid_str(),
                email=MANAGER_EMAIL.lower(),
                password_hash=_hash(MANAGER_PASSWORD),
                name=MANAGER_NAME,
                is_platform_admin=False,
            )
            db.add(mu)
            db.flush()
            print(f"Created user {MANAGER_EMAIL}")
        else:
            mu.password_hash = _hash(MANAGER_PASSWORD)
            print(f"User exists: {MANAGER_EMAIL} - password reset to {MANAGER_PASSWORD!r}")

        mm = db.execute(
            select(CompanyMembership).where(
                CompanyMembership.user_id == mu.id,
                CompanyMembership.company_id == company.id,
            )
        ).scalar_one_or_none()
        if mm is None:
            db.add(
                CompanyMembership(
                    id=uuid_str(),
                    user_id=mu.id,
                    company_id=company.id,
                    role="employee",
                    status="active",
                )
            )
            print("Added company membership for manager.")
        else:
            print("Manager already has membership.")

        mgr_emp = db.execute(
            select(Employee).where(Employee.company_id == company.id, Employee.user_id == mu.id)
        ).scalar_one_or_none()
        if mgr_emp is None:
            mgr_emp = Employee(
                id=uuid_str(),
                company_id=company.id,
                user_id=mu.id,
                employee_code=f"EMP-MGR-{uuid_str()[:8]}",
                department_id=None,
                job_id=None,
                manager_id=None,
                location_id=None,
                status="active",
                hire_date=None,
                personal_info_json={"display_name": MANAGER_NAME},
                documents_json={},
            )
            db.add(mgr_emp)
            db.flush()
            print(f"Created manager employee {mgr_emp.id} ({mgr_emp.employee_code})")
        else:
            print(f"Manager employee already exists: {mgr_emp.id} ({mgr_emp.employee_code})")

        reportee_emp.manager_id = mgr_emp.id
        db.commit()

        print()
        print("--- Manager login ---")
        print(f"  Email:          {MANAGER_EMAIL}")
        print(f"  Password:       {MANAGER_PASSWORD}")
        print(f"  User id:        {mu.id}")
        print(f"  Employee id:    {mgr_emp.id}  ({mgr_emp.employee_code})")
        print()
        print(f"Reportee {reportee_emp.employee_code} -> manager_id = {mgr_emp.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
