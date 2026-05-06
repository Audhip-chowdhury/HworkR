#!/usr/bin/env python3
"""
Seed the Tech org slice for company "Knives Out".

What it does:
  - Finds the "Knives Out" company (by name, or KNIVES_OUT_COMPANY_ID env).
  - Finds (or creates) the "Tech" department.
  - Reads every Position that belongs to the Tech department (positions are
    managed from the Company → Org UI — this script does NOT create positions).
  - For each position, seeds **2 employees** linked to that position, with a
    deterministic manager chain derived from the position.reports_to_id graph.
  - Creates a login user per employee (email @knivesout-seed.example.com).
  - Creates default document rows + inbox tasks (same as other Knives Out seeds).

Run:
  cd backend && python3 scripts/seed_knives_out_tech.py

Idempotent:
  - If ANY seeded tech employee code (KO-TECH-*) already exists for the company,
    the script exits without duplicating. Delete those rows (or pass --force) to
    re-seed.

Optional env:
  KNIVES_OUT_COMPANY_ID=<uuid>       # skip name lookup
  KNIVES_OUT_SEED_PASSWORD=<string>  # login password (default: KnivesOutSeed!2026)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.position import Position
from app.models.user import User
from app.services.employee_document_sync import (
    ensure_default_document_rows,
    sync_document_inbox_tasks,
)

COMPANY_NAME = "Knives Out"
SEED_TAG = "knives_out_tech_v1"
DEPT_NAME = "Tech"
LOC_NAME = "Thrombey Manor — Server Wing"
EMP_CODE_PREFIX = "KO-TECH-"

# Two movie-pun tech names per position. Rotates through the pool in seed order.
_TECH_NAME_POOL: list[tuple[str, str]] = [
    ("Agnes Stack", "agnes.stack"),
    ("Byron Blade", "byron.blade"),
    ("Caroline Cache", "caroline.cache"),
    ("Dorian Debug", "dorian.debug"),
    ("Elliot Edge-Case", "elliot.edge"),
    ("Fiona Fork", "fiona.fork"),
    ("Gideon Gitweaver", "gideon.gitweaver"),
    ("Hazel Heap", "hazel.heap"),
    ("Ian Interface", "ian.interface"),
    ("Juno Jitsu", "juno.jitsu"),
    ("Kira Keystone", "kira.keystone"),
    ("Lars Lambda", "lars.lambda"),
    ("Mira Monad", "mira.monad"),
    ("Nolan Null", "nolan.null"),
    ("Ophelia Opcode", "ophelia.opcode"),
    ("Percy Patch", "percy.patch"),
    ("Quentin Queue", "quentin.queue"),
    ("Rhea Runtime", "rhea.runtime"),
    ("Sloan Syntax", "sloan.syntax"),
    ("Theo Thread", "theo.thread"),
    ("Una Unit-Test", "una.unit"),
    ("Vera Vector", "vera.vector"),
    ("Wes Webhook", "wes.webhook"),
    ("Xander Xml", "xander.xml"),
    ("Yara Yield", "yara.yield"),
    ("Zane Zero-Day", "zane.zeroday"),
]

_EMAIL_DOMAIN = "knivesout-seed.example.com"


def _find_company(session: Session) -> Company | None:
    cid = os.environ.get("KNIVES_OUT_COMPANY_ID", "").strip()
    if cid:
        return session.execute(select(Company).where(Company.id == cid)).scalar_one_or_none()
    return session.execute(
        select(Company).where(func.lower(Company.name) == COMPANY_NAME.lower())
    ).scalar_one_or_none()


def _get_or_create_dept(session: Session, company_id: str) -> Department:
    # Match either "Tech" or "Technology" so we reuse whatever the user set up.
    r = session.execute(
        select(Department).where(
            Department.company_id == company_id,
            func.lower(Department.name).in_(("tech", "technology")),
        )
    ).scalar_one_or_none()
    if r:
        return r
    d = Department(
        id=uuid_str(),
        company_id=company_id,
        name=DEPT_NAME,
        parent_id=None,
        head_employee_id=None,
        level=0,
    )
    session.add(d)
    session.flush()
    return d


def _get_or_create_location(session: Session, company_id: str) -> Location:
    r = session.execute(
        select(Location).where(Location.company_id == company_id, Location.name == LOC_NAME)
    ).scalar_one_or_none()
    if r:
        return r
    loc = Location(
        id=uuid_str(),
        company_id=company_id,
        name=LOC_NAME,
        address="1313 Wool Street, Boston, MA — the server closet behind the bookshelf",
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
    grade: int,
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
        family="Tech",
        level="Leadership" if grade <= 2 else ("Management" if grade <= 4 else "IC"),
        grade=f"G{max(1, 10 - grade)}",
        salary_band_json={"min": 1, "max": 99, "currency": "₹S", "note": "SimCash — mind the stack trace"},
    )
    session.add(j)
    session.flush()
    return j


def _sort_positions_top_down(positions: list[Position]) -> list[Position]:
    """Sort so every position's reports_to parent appears before it (topological by grade)."""
    by_id = {p.id: p for p in positions}
    ordered: list[Position] = []
    visited: set[str] = set()

    def visit(p: Position) -> None:
        if p.id in visited:
            return
        parent = by_id.get(p.reports_to_id) if p.reports_to_id else None
        if parent is not None:
            visit(parent)
        visited.add(p.id)
        ordered.append(p)

    # Stable order: by grade ascending (senior first), then name.
    for p in sorted(positions, key=lambda x: (x.grade, x.name.lower())):
        visit(p)
    return ordered


def _slug(name: str, max_len: int = 12) -> str:
    s = "".join(ch if ch.isalnum() else "-" for ch in name.strip().lower())
    while "--" in s:
        s = s.replace("--", "-")
    s = s.strip("-")
    return (s[:max_len] or "pos").rstrip("-") or "pos"


def _ensure_user_and_employee(
    session: Session,
    *,
    company_id: str,
    email: str,
    name: str,
    password: str,
    employee_code: str,
    department_id: str,
    position_id: str,
    job_id: str | None,
    manager_id: str | None,
    location_id: str,
    hire_date: str,
    personal_info_json: dict,
) -> Employee:
    dup = session.execute(
        select(Employee).where(
            Employee.company_id == company_id, Employee.employee_code == employee_code
        )
    ).scalar_one_or_none()
    if dup:
        raise RuntimeError(
            f"Employee code {employee_code} already exists — aborting to stay idempotent."
        )

    existing_user = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing_user:
        uid = existing_user.id
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
        user_id=uid,
        employee_code=employee_code,
        department_id=department_id,
        job_id=job_id,
        position_id=position_id,
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


def _delete_existing_tech_seed(session: Session, company_id: str) -> int:
    rows = session.execute(
        select(Employee).where(
            Employee.company_id == company_id,
            Employee.employee_code.like(f"{EMP_CODE_PREFIX}%"),
        )
    ).scalars().all()
    n = 0
    uids: list[str] = []
    for e in rows:
        if e.user_id:
            uids.append(e.user_id)
        session.delete(e)
        n += 1
    session.flush()
    # Clean memberships + users for those seeded accounts so --force re-seeds fresh.
    if uids:
        session.execute(
            delete(CompanyMembership).where(
                CompanyMembership.user_id.in_(uids),
                CompanyMembership.company_id == company_id,
            )
        )
        # Only delete the user row if this company's membership was its only one.
        for uid in uids:
            other = session.execute(
                select(CompanyMembership).where(CompanyMembership.user_id == uid)
            ).first()
            if other is None:
                session.execute(delete(User).where(User.id == uid))
    session.flush()
    return n


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Tech employees (2 per position) for Knives Out.")
    parser.add_argument(
        "--force",
        action="store_true",
        help=f"Delete existing {EMP_CODE_PREFIX}* employees (and their user logins) before re-seeding.",
    )
    args = parser.parse_args()

    password = os.environ.get("KNIVES_OUT_SEED_PASSWORD", "KnivesOutSeed!2026")

    with SessionLocal() as session:
        company = _find_company(session)
        if company is None:
            print(
                f'Company "{COMPANY_NAME}" not found. Create it in the app, '
                f"or set KNIVES_OUT_COMPANY_ID=<uuid> and re-run."
            )
            sys.exit(1)

        dept = _get_or_create_dept(session, company.id)

        positions = list(
            session.execute(
                select(Position).where(
                    Position.company_id == company.id,
                    Position.department_id == dept.id,
                )
            ).scalars().all()
        )
        if not positions:
            print(
                f'Department "{dept.name}" exists but has no positions yet. Add positions '
                f"under Company → Org → Positions first, then re-run this seed."
            )
            sys.exit(2)

        already = session.execute(
            select(Employee).where(
                Employee.company_id == company.id,
                Employee.employee_code.like(f"{EMP_CODE_PREFIX}%"),
            )
        ).first()
        if already and not args.force:
            print(
                f"Tech seed already present ({EMP_CODE_PREFIX}* employees found). "
                f"Pass --force to wipe and re-seed."
            )
            sys.exit(0)
        if already and args.force:
            removed = _delete_existing_tech_seed(session, company.id)
            print(f"--force: removed {removed} existing Tech-seed employee rows.")

        loc = _get_or_create_location(session, company.id)

        ordered = _sort_positions_top_down(positions)

        # First employee created for each position (used as manager_id for reports).
        first_emp_for_position: dict[str, Employee] = {}
        # Unique codes per position slug even if position names collide.
        used_slugs: dict[str, int] = {}
        name_idx = 0

        total_created = 0
        for pos in ordered:
            base_slug = _slug(pos.name).upper()
            n = used_slugs.get(base_slug, 0)
            used_slugs[base_slug] = n + 1
            slug = base_slug if n == 0 else f"{base_slug}{n + 1}"

            job = _get_or_create_job(session, company.id, title=pos.name, grade=pos.grade)

            parent_pos_id = pos.reports_to_id
            parent_emp = first_emp_for_position.get(parent_pos_id) if parent_pos_id else None
            manager_id = parent_emp.id if parent_emp else None

            for seq in (1, 2):
                pool_name, pool_email = _TECH_NAME_POOL[name_idx % len(_TECH_NAME_POOL)]
                name_idx += 1

                employee_code = f"{EMP_CODE_PREFIX}{slug}-{seq:02d}"
                # Disambiguate email if pool cycles (every 26 hires).
                email_local = pool_email if name_idx <= len(_TECH_NAME_POOL) else f"{pool_email}.{name_idx}"
                email = f"{email_local}@{_EMAIL_DOMAIN}"

                personal_info = {
                    "fullName": pool_name,
                    "personalEmail": email,
                    "phone": f"+1 617-555-{1000 + name_idx:04d}",
                    "address": "Thrombey Manor — server closet (behind the creaky bookshelf)",
                    "emergencyContacts": [
                        {
                            "name": "Blanc (Consulting Detective)",
                            "phone": "+1 504-555-0314",
                            "relation": "Case contact",
                        }
                    ],
                    "seed_meta": {
                        "tag": SEED_TAG,
                        "position": pos.name,
                        "position_id": pos.id,
                        "movie_note": "Seeded by the Tech seed — every stack has its twist.",
                    },
                }

                emp = _ensure_user_and_employee(
                    session,
                    company_id=company.id,
                    email=email,
                    name=pool_name,
                    password=password,
                    employee_code=employee_code,
                    department_id=dept.id,
                    position_id=pos.id,
                    job_id=job.id,
                    manager_id=manager_id,
                    location_id=loc.id,
                    hire_date="2024-05-01",
                    personal_info_json=personal_info,
                )
                total_created += 1
                if seq == 1:
                    first_emp_for_position[pos.id] = emp

        # If Tech department has no head yet, pin it to the most senior seeded employee.
        if dept.head_employee_id is None:
            top_pos = ordered[0]
            top_emp = first_emp_for_position.get(top_pos.id)
            if top_emp is not None:
                dept.head_employee_id = top_emp.id

        session.commit()

        print("Knives Out — Tech seed complete.")
        print(f"  Company: {company.name} ({company.id})")
        print(f"  Department: {dept.name} (head → {dept.head_employee_id or 'unset'})")
        print(f"  Location: {loc.name}")
        print(f"  Positions found: {len(ordered)}  |  Employees seeded: {total_created} (2 per position)")
        print(
            f"  Logins: password from KNIVES_OUT_SEED_PASSWORD or default '{password}' "
            f"(users @{_EMAIL_DOMAIN})"
        )


if __name__ == "__main__":
    main()
