#!/usr/bin/env python3
"""
Seed the Fashion org slice for company "Knives Out" (movie pun tone).

Creates / uses:
  - Department: Fashion
  - Location: Thrombey Manor — Knitwear Wing
  - Job catalog: Fashion Director, Fashion Manager, Fashion dev
  - 1 director, 1 manager, 3 devs with correct manager chain and personal_info_json

Run from repo root or backend:
  cd backend && python3 scripts/seed_knives_out_fashion.py

Optional env:
  KNIVES_OUT_COMPANY_ID=<uuid>   # if set, skip name lookup

Idempotent: if employee code KO-FASH-DIR-001 already exists for that company, exits without duplicating.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow `python scripts/foo.py` from backend/
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
from app.services.seed_employee_documents import seed_sample_employee_documents

COMPANY_NAME = "Knives Out"
SEED_TAG = "knives_out_fashion_v1"

# Employee codes (unique per company)
CODE_DIR = "KO-FASH-DIR-001"
CODE_MGR = "KO-FASH-MGR-001"
CODE_DEVS = ["KO-FASH-DEV-001", "KO-FASH-DEV-002", "KO-FASH-DEV-003"]


def _find_company(session: Session) -> Company | None:
    cid = os.environ.get("KNIVES_OUT_COMPANY_ID", "").strip()
    if cid:
        return session.execute(select(Company).where(Company.id == cid)).scalar_one_or_none()
    return session.execute(
        select(Company).where(func.lower(Company.name) == COMPANY_NAME.lower())
    ).scalar_one_or_none()


def _get_or_create_dept(session: Session, company_id: str) -> Department:
    r = session.execute(
        select(Department).where(Department.company_id == company_id, Department.name == "Fashion")
    ).scalar_one_or_none()
    if r:
        return r
    d = Department(
        id=uuid_str(),
        company_id=company_id,
        name="Fashion",
        parent_id=None,
        head_employee_id=None,
        level=0,
    )
    session.add(d)
    session.flush()
    return d


def _get_or_create_location(session: Session, company_id: str) -> Location:
    name = "Thrombey Manor — Knitwear Wing"
    r = session.execute(
        select(Location).where(Location.company_id == company_id, Location.name == name)
    ).scalar_one_or_none()
    if r:
        return r
    loc = Location(
        id=uuid_str(),
        company_id=company_id,
        name=name,
        address="1313 Wool Street, Boston, MA (the sweater district)",
        timezone="America/New_York",
        country="USA",
    )
    session.add(loc)
    session.flush()
    return loc


def _get_or_create_job(
    session: Session,
    company_id: str,
    *,
    title: str,
    family: str,
    level: str,
    grade: str,
) -> JobCatalogEntry:
    r = session.execute(
        select(JobCatalogEntry).where(
            JobCatalogEntry.company_id == company_id,
            JobCatalogEntry.title == title,
        )
    ).scalar_one_or_none()
    if r:
        return r
    j = JobCatalogEntry(
        id=uuid_str(),
        company_id=company_id,
        title=title,
        family=family,
        level=level,
        grade=grade,
        salary_band_json={"min": 1, "max": 99, "currency": "₹S", "note": "SimCash — sharp cuts only"},
    )
    session.add(j)
    session.flush()
    return j


def _ensure_user_employee(
    session: Session,
    company_id: str,
    *,
    email: str,
    name: str,
    password: str,
    employee_code: str,
    department_id: str,
    job_id: str,
    manager_id: str | None,
    location_id: str,
    hire_date: str,
    personal_info_json: dict,
) -> Employee:
    dup = session.execute(
        select(Employee).where(Employee.company_id == company_id, Employee.employee_code == employee_code)
    ).scalar_one_or_none()
    if dup:
        raise RuntimeError(f"Employee code {employee_code} already exists — aborting to stay idempotent.")

    existing = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        uid = existing.id
        has_m = session.execute(
            select(CompanyMembership).where(
                CompanyMembership.user_id == uid,
                CompanyMembership.company_id == company_id,
            )
        ).scalar_one_or_none()
        if not has_m:
            session.add(
                CompanyMembership(
                    id=uuid_str(),
                    user_id=uid,
                    company_id=company_id,
                    role="employee",
                    status="active",
                )
            )
    else:
        u = User(
            id=uuid_str(),
            email=email,
            password_hash=get_password_hash(password),
            name=name,
            is_platform_admin=False,
        )
        session.add(u)
        session.flush()
        uid = u.id
        session.add(
            CompanyMembership(
                id=uuid_str(),
                user_id=uid,
                company_id=company_id,
                role="employee",
                status="active",
            )
        )

    emp = Employee(
        id=uuid_str(),
        company_id=company_id,
        user_id=uid,  # always set when we create/find user above
        employee_code=employee_code,
        department_id=department_id,
        job_id=job_id,
        manager_id=manager_id,
        location_id=location_id,
        status="active",
        hire_date=hire_date,
        personal_info_json=personal_info_json,
        documents_json={},
    )
    session.add(emp)
    session.flush()
    ensure_default_document_rows(session, company_id, emp.id)
    if uid:
        sync_document_inbox_tasks(session, emp)
    return emp


def main() -> None:
    password = os.environ.get("KNIVES_OUT_SEED_PASSWORD", "KnivesOutSeed!2026")

    with SessionLocal() as session:
        company = _find_company(session)
        if company is None:
            print(
                f'Company "{COMPANY_NAME}" not found. Create it in the app, or set KNIVES_OUT_COMPANY_ID.\n'
                f"Example: KNIVES_OUT_COMPANY_ID=<uuid> python3 scripts/seed_knives_out_fashion.py"
            )
            sys.exit(1)

        existing = session.execute(
            select(Employee).where(Employee.company_id == company.id, Employee.employee_code == CODE_DIR)
        ).scalar_one_or_none()
        if existing:
            print(
                f"Already seeded (found {CODE_DIR}). Delete those employees first or change codes in the script."
            )
            sys.exit(0)

        dept = _get_or_create_dept(session, company.id)
        loc = _get_or_create_location(session, company.id)

        job_dir = _get_or_create_job(
            session,
            company.id,
            title="Fashion Director",
            family="Fashion",
            level="Leadership",
            grade="G8",
        )
        job_mgr = _get_or_create_job(
            session,
            company.id,
            title="Fashion Manager",
            family="Fashion",
            level="Management",
            grade="G6",
        )
        job_dev = _get_or_create_job(
            session,
            company.id,
            title="Fashion dev",
            family="Fashion",
            level="IC",
            grade="G4",
        )

        # --- Director (no manager) ---
        director = _ensure_user_employee(
            session,
            company.id,
            email="harlan.edge@knivesout-seed.example.com",
            name='Harlan Thrombey-Edge',
            password=password,
            employee_code=CODE_DIR,
            department_id=dept.id,
            job_id=job_dir.id,
            manager_id=None,
            location_id=loc.id,
            hire_date="2022-01-17",
            personal_info_json={
                "fullName": "Harlan Thrombey-Edge",
                "dob": "1955-09-13",
                "personalEmail": "harlan.edge@knivesout-seed.example.com",
                "phone": "+1 617-555-0199",
                "address": "Thrombey Manor, private study (pattern library on the mezzanine)",
                "emergencyContacts": [
                    {"name": "Walt Thrombey", "phone": "+1 617-555-0101", "relation": "Son (claims he runs logistics)"},
                ],
                "seed_meta": {"tag": SEED_TAG, "movie_note": "The patriarch — every collection has a twist ending."},
            },
        )

        # --- Manager (reports to director) ---
        manager = _ensure_user_employee(
            session,
            company.id,
            email="ransom.fray@knivesout-seed.example.com",
            name='Richard "Ransom" Fray',
            password=password,
            employee_code=CODE_MGR,
            department_id=dept.id,
            job_id=job_mgr.id,
            manager_id=director.id,
            location_id=loc.id,
            hire_date="2023-06-01",
            personal_info_json={
                "fullName": 'Richard "Ransom" Fray',
                "dob": "1988-11-27",
                "personalEmail": "ransom.fray@knivesout-seed.example.com",
                "phone": "+1 617-555-0177",
                "address": "Boston loft (above a very suspicious yarn shop)",
                "emergencyContacts": [
                    {"name": "Joni Thrombey", "phone": "+1 617-555-0144", "relation": "Influencer / wellness arc"},
                ],
                "seed_meta": {"tag": SEED_TAG, "movie_note": "Manages the cut — not always straight."},
            },
        )

        devs_spec = [
            {
                "code": CODE_DEVS[0],
                "email": "marta.looper@knivesout-seed.example.com",
                "name": "Marta Looper",
                "hire": "2024-02-01",
                "pi": {
                    "fullName": "Marta Looper",
                    "dob": "1996-03-22",
                    "personalEmail": "marta.looper@knivesout-seed.example.com",
                    "phone": "+1 617-555-0220",
                    "address": "Apartment over the dry cleaner (smells like victory and wool)",
                    "emergencyContacts": [
                        {"name": "Mom", "phone": "+1 305-555-0999", "relation": "Family back home"},
                    ],
                    "seed_meta": {
                        "tag": SEED_TAG,
                        "movie_note": "True stitch: she never breaks the build loop.",
                    },
                },
            },
            {
                "code": CODE_DEVS[1],
                "email": "benoit.blanket@knivesout-seed.example.com",
                "name": "Benoit Blanket",
                "hire": "2024-03-18",
                "pi": {
                    "fullName": "Benoit Blanket",
                    "dob": "1975-07-04",
                    "personalEmail": "benoit.blanket@knivesout-seed.example.com",
                    "phone": "+1 504-555-0314",
                    "address": "Aboard the Hudson thread-line (consulting suite)",
                    "emergencyContacts": [
                        {"name": "Deputy Hardscrabble", "phone": "+1 504-555-0315", "relation": "Local PD liaison"},
                    ],
                    "seed_meta": {
                        "tag": SEED_TAG,
                        "movie_note": "Observes the weave — nothing gets past a Blanket inspection.",
                    },
                },
            },
            {
                "code": CODE_DEVS[2],
                "email": "meg.knitmore@knivesout-seed.example.com",
                "name": "Meg Knitmore",
                "hire": "2024-09-09",
                "pi": {
                    "fullName": "Meg Knitmore",
                    "dob": "1999-12-12",
                    "personalEmail": "meg.knitmore@knivesout-seed.example.com",
                    "phone": "+1 617-555-0440",
                    "address": "Campus housing — dormitory B, knitting circle floor",
                    "emergencyContacts": [
                        {"name": "Joni Thrombey", "phone": "+1 617-555-0144", "relation": "Mother / brand deals"},
                    ],
                    "seed_meta": {
                        "tag": SEED_TAG,
                        "movie_note": "Ships features like she ships scarves — fast, cozy, slightly dramatic.",
                    },
                },
            },
        ]

        dev_employees: list[Employee] = []
        for spec in devs_spec:
            e = _ensure_user_employee(
                session,
                company.id,
                email=spec["email"],
                name=spec["name"],
                password=password,
                employee_code=spec["code"],
                department_id=dept.id,
                job_id=job_dev.id,
                manager_id=manager.id,
                location_id=loc.id,
                hire_date=spec["hire"],
                personal_info_json=spec["pi"],
            )
            dev_employees.append(e)

        dept.head_employee_id = director.id

        doc_emp, doc_files = seed_sample_employee_documents(session, company_id=company.id, force=False)
        session.commit()

        print("Knives Out — Fashion seed complete.")
        print(f"  Company: {company.name} ({company.id})")
        print(f"  Department: Fashion (head employee → {director.employee_code})")
        print(f"  Location: {loc.name}")
        print(
            f"  Reporting line: {director.employee_code} Fashion Director → "
            f"{manager.employee_code} Fashion Manager → "
            f"{', '.join(CODE_DEVS)} Fashion dev"
        )
        print(
            f"  Logins: password from KNIVES_OUT_SEED_PASSWORD or default '{password}' "
            f"(users @knivesout-seed.example.com)"
        )
        print(
            f"  Sample documents: {doc_emp} employees, {doc_files} files (photo, gov ID image, offer PDF). "
            f"Re-run `python3 scripts/seed_employee_document_samples.py` for other companies or SEED_DOCS_FORCE=1."
        )


if __name__ == "__main__":
    main()
