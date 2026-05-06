#!/usr/bin/env python3
"""
Create (or reuse) a User with role employee, membership, and link to an Employee row
so you can log in and receive company notifications.

Run from the `backend` folder:

    python scripts/seed_employee_login.py
    python scripts/seed_employee_login.py --company-id <uuid>
    python scripts/seed_employee_login.py --company-name-substr kopal

Requires the same environment as the API (DATABASE_URL / .env).
"""

from __future__ import annotations

import argparse
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

# Same scheme as app.core.security (avoid importing security → jose) for script-only runs.
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _password_hash(plain: str) -> str:
    return _pwd.hash(plain)


def _resolve_company(session: Session, company_id: str | None, name_substr: str) -> Company:
    if company_id:
        r = session.execute(select(Company).where(Company.id == company_id.strip()))
        c = r.scalar_one_or_none()
        if c is None:
            raise SystemExit(f"No company with id={company_id!r}")
        return c
    r = session.execute(select(Company).where(Company.name.ilike(f"%{name_substr}%")))
    rows = list(r.scalars().all())
    if not rows:
        raise SystemExit(f"No company whose name contains {name_substr!r}")
    if len(rows) > 1:
        print("Multiple matches; use --company-id:")
        for x in rows:
            print(f"  {x.id}  {x.name!r}")
        raise SystemExit(1)
    return rows[0]


def seed(
    session: Session,
    *,
    company: Company,
    email: str,
    password: str,
    display_name: str,
) -> None:
    email_l = email.strip().lower()
    r = session.execute(select(User).where(User.email == email_l))
    user = r.scalar_one_or_none()
    if user is None:
        user = User(
            id=uuid_str(),
            email=email_l,
            password_hash=_password_hash(password),
            name=display_name,
            is_platform_admin=False,
        )
        session.add(user)
        session.flush()
        print(f"Created user {email_l!r}")
    else:
        print(f"Using existing user {email_l!r} (password unchanged)")

    r = session.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.company_id == company.id,
        )
    )
    mem = r.scalar_one_or_none()
    if mem is None:
        session.add(
            CompanyMembership(
                id=uuid_str(),
                user_id=user.id,
                company_id=company.id,
                role="employee",
                status="active",
            )
        )
        print("Added company membership (employee).")
    elif mem.role != "employee":
        mem.role = "employee"
        print("Updated membership role to employee.")
    else:
        print("Membership already present (employee).")

    r = session.execute(
        select(Employee).where(
            Employee.company_id == company.id,
            Employee.user_id == user.id,
        )
    )
    linked = r.scalar_one_or_none()
    if linked is not None:
        session.commit()
        print(f"Employee row already linked: {linked.id} ({linked.employee_code})")
        print(f"Login: {email_l} / password: (unchanged if user existed, else the one you set)")
        return

    r = session.execute(
        select(Employee).where(
            Employee.company_id == company.id,
            Employee.user_id.is_(None),
            Employee.status == "active",
        ).limit(1)
    )
    orphan = r.scalar_one_or_none()
    if orphan is not None:
        orphan.user_id = user.id
        session.commit()
        print(f"Linked user to existing employee {orphan.id} ({orphan.employee_code})")
    else:
        emp = Employee(
            id=uuid_str(),
            company_id=company.id,
            user_id=user.id,
            employee_code=f"EMP-LOGIN-{uuid_str()[:8]}",
            department_id=None,
            job_id=None,
            manager_id=None,
            location_id=None,
            status="active",
            hire_date=None,
            personal_info_json={"display_name": display_name},
            documents_json={},
        )
        session.add(emp)
        session.commit()
        print(f"Created new employee row {emp.id} ({emp.employee_code})")

    print(f"Login email: {email_l}")
    print(f"Password:    {password!r} (only if user was just created; otherwise use your existing password)")


def main() -> None:
    p = argparse.ArgumentParser(description="Seed an employee login for a company.")
    p.add_argument("--company-id", default=None, help="Company UUID (overrides name search)")
    p.add_argument("--company-name-substr", default="kopal", help="Case-insensitive substring of company name")
    p.add_argument(
        "--email",
        default="employee.kopal@example.com",
        help="Login email (avoid .local — Pydantic EmailStr rejects reserved/special-use domains)",
    )
    p.add_argument("--password", default="employee123", help="Password for new users only")
    p.add_argument("--name", default="Kopal Test Employee", help="User / employee display name")
    p.add_argument("--init-db", action="store_true", help="Run init_db() first")
    args = p.parse_args()

    if args.init_db:
        init_db()

    db = SessionLocal()
    try:
        company = _resolve_company(db, args.company_id, args.company_name_substr.strip())
        print(f"Company: {company.name!r} ({company.id})")
        seed(
            db,
            company=company,
            email=args.email,
            password=args.password,
            display_name=args.name.strip(),
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
