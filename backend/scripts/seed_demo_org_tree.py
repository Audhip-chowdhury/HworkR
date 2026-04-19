#!/usr/bin/env python3
"""
Seed a small company with a fixed reporting tree:

  democeo (CEO, no manager)
  ├── mrobbie (reports to CEO)
  ├── kopal.manager (reports to CEO)
  └── (under kopal.manager) kopal (reports to kopal.manager)

Run from `backend`:

    python scripts/seed_demo_org_tree.py

Optional:

    python scripts/seed_demo_org_tree.py --force-password

Uses DATABASE_URL / .env like the API. Runs init_db() first.
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
from app.models.position import Position
from app.models.user import User

from scripts.seed_department_job_catalog import ensure_department_job_catalog

COMPANY_NAME = "Demo org tree (seed)"
SHARED_PASSWORD = "demotree123"

# (email, display_name, employee_code_prefix)
PEOPLE: list[tuple[str, str, str]] = [
    ("democeo@demotree.example.com", "Demo CEO", "EMP-DEMO-CEO"),
    ("mrobbie@demotree.example.com", "Margot Robbie", "EMP-DEMO-MROBBIE"),
    ("kopal.manager@demotree.example.com", "Kopal Manager", "EMP-DEMO-KMGR"),
    ("kopal@demotree.example.com", "Kopal", "EMP-DEMO-KOPAL"),
]

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _hash(pw: str) -> str:
    return _pwd.hash(pw)


def _get_or_create_user(db: Session, email: str, name: str, password: str, *, reset_password: bool) -> User:
    em = email.lower().strip()
    u = db.execute(select(User).where(User.email == em)).scalar_one_or_none()
    if u is None:
        u = User(
            id=uuid_str(),
            email=em,
            password_hash=_hash(password),
            name=name,
            is_platform_admin=False,
        )
        db.add(u)
        db.flush()
        return u
    if reset_password:
        u.password_hash = _hash(password)
    return u


def _ensure_membership(db: Session, company_id: str, user_id: str, role: str = "employee") -> None:
    m = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user_id,
            CompanyMembership.company_id == company_id,
        )
    ).scalar_one_or_none()
    if m is None:
        db.add(
            CompanyMembership(
                id=uuid_str(),
                user_id=user_id,
                company_id=company_id,
                role=role,
                status="active",
            )
        )
    else:
        m.role = role


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--force-password",
        action="store_true",
        help="Reset password to the shared demo password for all four users if they already exist.",
    )
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    try:
        company = db.execute(select(Company).where(Company.name == COMPANY_NAME)).scalar_one_or_none()
        if company is None:
            company = Company(
                id=uuid_str(),
                name=COMPANY_NAME,
                industry="Demo",
                location=None,
                config_json={},
            )
            db.add(company)
            db.flush()
            print(f"Created company {COMPANY_NAME!r} ({company.id})")
        else:
            print(f"Using existing company {COMPANY_NAME!r} ({company.id})")

        company_id = company.id

        def ensure_peer_grade_positions() -> tuple[str, str]:
            """Two different positions, same grade, for works-with / peer-review demos."""
            grade = 40
            specs = [
                "Demo peer band — IC track A",
                "Demo peer band — IC track B",
            ]
            found: list[str] = []
            for name in specs:
                p = db.execute(
                    select(Position).where(Position.company_id == company_id, Position.name == name)
                ).scalar_one_or_none()
                if p is None:
                    p = Position(
                        id=uuid_str(),
                        company_id=company_id,
                        name=name,
                        department_id=None,
                        bucket="temporary",
                        grade=grade,
                        reports_to_id=None,
                        works_with_id=None,
                    )
                    db.add(p)
                    db.flush()
                found.append(p.id)
            return found[0], found[1]

        pos_peer_a, pos_peer_b = ensure_peer_grade_positions()

        users: dict[str, User] = {}
        for email, name, _code in PEOPLE:
            users[email.lower()] = _get_or_create_user(
                db, email, name, SHARED_PASSWORD, reset_password=args.force_password
            )
        db.flush()

        # democeo: company_admin; mrobbie: HR ops (Performance + HR workflows); others: employee.
        membership_roles = ("company_admin", "hr_ops", "employee", "employee")
        for (email, name, _code), mrole in zip(PEOPLE, membership_roles, strict=True):
            _ensure_membership(db, company_id, users[email.lower()].id, mrole)
        db.flush()

        # Employees in order: CEO first (no manager), then mrobbie, kopal manager, kopal
        ceo_u = users["democeo@demotree.example.com"]
        mrobbie_u = users["mrobbie@demotree.example.com"]
        kmgr_u = users["kopal.manager@demotree.example.com"]
        kopal_u = users["kopal@demotree.example.com"]

        def emp_row(user: User, code: str, mgr_id: str | None, *, position_id: str | None = None) -> Employee:
            e = db.execute(
                select(Employee).where(Employee.company_id == company_id, Employee.user_id == user.id)
            ).scalar_one_or_none()
            display = next(n for em, n, c in PEOPLE if em.lower() == user.email)
            if e is None:
                e = Employee(
                    id=uuid_str(),
                    company_id=company_id,
                    user_id=user.id,
                    employee_code=code,
                    department_id=None,
                    job_id=None,
                    position_id=position_id,
                    manager_id=mgr_id,
                    location_id=None,
                    status="active",
                    hire_date="2026-01-01",
                    personal_info_json={"display_name": display},
                    documents_json={},
                )
                db.add(e)
            else:
                e.manager_id = mgr_id
                e.employee_code = code
                e.personal_info_json = {**(e.personal_info_json or {}), "display_name": display}
                if position_id is not None:
                    e.position_id = position_id
            db.flush()
            return e

        ceo_e = emp_row(ceo_u, "EMP-DEMO-CEO", None)
        emp_row(mrobbie_u, "EMP-DEMO-MROBBIE", ceo_e.id, position_id=pos_peer_a)
        kmgr_e = emp_row(kmgr_u, "EMP-DEMO-KMGR", ceo_e.id, position_id=pos_peer_b)
        emp_row(kopal_u, "EMP-DEMO-KOPAL", kmgr_e.id)

        d_n, j_n = ensure_department_job_catalog(db, company_id)
        print(f"Requisition form data: +{d_n} departments, +{j_n} job profiles (idempotent).")

        db.commit()

        print()
        print("Membership: democeo@demotree.example.com -> company_admin; mrobbie@demotree.example.com -> hr_ops; others: employee.")
        print(
            "Positions: mrobbie and kopal.manager share grade 40 (different position rows) for peer-review / works-with."
        )
        print()
        print("Reporting tree (manager_id):")
        print(f"  {ceo_u.email}  employee_id={ceo_e.id}  manager_id=None")
        print(f"  {mrobbie_u.email}  manager -> CEO")
        print(f"  {kmgr_u.email}  manager -> CEO")
        print(f"  {kopal_u.email}  manager -> kopal.manager")
        print()
        print("--- Login (all use the same password unless you skipped --force-password on re-run) ---")
        print(f"  Password: {SHARED_PASSWORD}")
        print()
        for email, name, code in PEOPLE:
            u = users[email.lower()]
            print(f"  {name}")
            print(f"    Email:    {u.email}")
            print(f"    User id:  {u.id}")
            e = db.execute(
                select(Employee).where(Employee.company_id == company_id, Employee.user_id == u.id)
            ).scalar_one()
            print(f"    Employee id: {e.id}  ({e.employee_code})")
            print()
        print(f"Company id: {company_id}")
        print(f"Login URL:  /company/{company_id}  (after signing in at /login)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
