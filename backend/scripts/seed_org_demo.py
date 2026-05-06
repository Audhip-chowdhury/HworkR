#!/usr/bin/env python3
"""
Insert demo rows for one company: 5 departments, locations, job_catalog entries,
org_roles, department_org_roles, positions, and employees.

Run from the `backend` folder:

    python scripts/seed_org_demo.py <company_id>

Requires the same environment as the API (DATABASE_URL / .env). Creates tables if missing
only if you run init_db elsewhere first; otherwise use a DB the app already initialized.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Resolve package imports when run as a script
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.org import Department, JobCatalogEntry, Location
from app.models.org_role import DepartmentOrgRole, OrgRole
from app.models.position import Position


def seed(session: Session, company_id: str) -> None:
    r = session.execute(select(Company).where(Company.id == company_id))
    if r.scalar_one_or_none() is None:
        raise SystemExit(f"No company found with id={company_id!r}")

    batch_suffix = uuid_str()[:8]

    dept_specs = [
        ("Engineering", 0),
        ("Human Resources", 0),
        ("Finance", 0),
        ("Operations", 0),
        ("Legal", 0),
    ]
    departments: list[Department] = []
    for name, level in dept_specs:
        d = Department(
            id=uuid_str(),
            company_id=company_id,
            name=name,
            parent_id=None,
            head_employee_id=None,
            level=level,
        )
        departments.append(d)
        session.add(d)

    loc_specs = [
        ("Headquarters", "UTC", "USA"),
        ("Branch West", "America/Los_Angeles", "USA"),
        ("Branch East", "America/New_York", "USA"),
        ("India Office", "Asia/Kolkata", "India"),
        ("Remote", "UTC", None),
    ]
    locations: list[Location] = []
    for name, tz, country in loc_specs:
        loc = Location(
            id=uuid_str(),
            company_id=company_id,
            name=name,
            address=None,
            timezone=tz,
            country=country,
        )
        locations.append(loc)
        session.add(loc)

    job_specs = [
        ("Software Engineer", "Technology", "L2", "IC3", {"min": 90000, "max": 140000, "currency": "USD"}),
        ("HR Analyst", "People", "L1", "IC2", {"min": 55000, "max": 75000, "currency": "USD"}),
        ("Accountant", "Finance", "L2", "IC3", {"min": 65000, "max": 85000, "currency": "USD"}),
        ("Operations Lead", "Operations", "L3", "M1", {"min": 80000, "max": 110000, "currency": "USD"}),
        ("Legal Counsel", "Legal", "L4", "IC4", {"min": 120000, "max": 170000, "currency": "USD"}),
    ]
    jobs: list[JobCatalogEntry] = []
    for title, family, level, grade, band in job_specs:
        j = JobCatalogEntry(
            id=uuid_str(),
            company_id=company_id,
            title=title,
            family=family,
            level=level,
            grade=grade,
            salary_band_json=band,
        )
        jobs.append(j)
        session.add(j)

    org_role_specs = [
        ("Senior Recruiter", "Talent acquisition and sourcing"),
        ("HR Business Partner", "Partner with leadership on people programs"),
        ("Staff Engineer", "Technical leadership and architecture"),
        ("Finance Analyst", "Forecasting and reporting"),
        ("Associate Counsel", "Contracts and compliance"),
    ]
    org_roles: list[OrgRole] = []
    for name, desc in org_role_specs:
        o = OrgRole(
            id=uuid_str(),
            company_id=company_id,
            name=name,
            description=desc,
        )
        org_roles.append(o)
        session.add(o)

    session.flush()

    for dept, role in zip(departments, org_roles, strict=True):
        session.add(
            DepartmentOrgRole(
                id=uuid_str(),
                department_id=dept.id,
                org_role_id=role.id,
            )
        )

    position_specs = [
        ("Engineering Manager", 40),
        ("HR Director", 35),
        ("Controller", 45),
        ("Operations Director", 38),
        ("General Counsel", 30),
    ]
    for (pname, grade), dept in zip(position_specs, departments, strict=True):
        session.add(
            Position(
                id=uuid_str(),
                company_id=company_id,
                name=pname,
                department_id=dept.id,
                bucket="none",
                grade=grade,
                reports_to_id=None,
                works_with_id=None,
            )
        )

    for i in range(5):
        session.add(
            Employee(
                id=uuid_str(),
                company_id=company_id,
                user_id=None,
                employee_code=f"EMP-{batch_suffix}-{i + 1:03d}",
                department_id=departments[i].id,
                job_id=jobs[i].id,
                manager_id=None,
                location_id=locations[i].id,
                status="active",
                hire_date="2026-01-01",
                personal_info_json={"display_name": f"Demo Employee {i + 1}"},
                documents_json={},
            )
        )

    session.commit()
    print("Done. Inserted 5 rows each: departments, locations, job_catalog, org_roles, ")
    print("department_org_roles, positions, employees.")
    print(f"Employee codes use batch prefix: EMP-{batch_suffix}-***")


def main() -> None:
    p = argparse.ArgumentParser(description="Seed org demo data for a company.")
    p.add_argument("company_id", help="UUID of the company (from DB or UI)")
    p.add_argument(
        "--init-db",
        action="store_true",
        help="Run init_db() first (creates tables / platform admin seed if missing)",
    )
    args = p.parse_args()

    if args.init_db:
        init_db()

    db = SessionLocal()
    try:
        seed(db, args.company_id.strip())
    finally:
        db.close()


if __name__ == "__main__":
    main()
