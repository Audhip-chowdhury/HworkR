"""
Seed **Acme Cloud** — a 50-employee mid-stage B2B SaaS demo company.

Run from the ``backend`` directory::

    python -m scripts.seed_acme_cloud
    python -m scripts.seed_acme_cloud --force

Idempotent on company name. ``--force`` deletes the existing Acme Cloud row
(cascade clears departments, positions, employees, memberships) and the six
demo logins, then re-seeds.

If Acme Cloud **already exists** and you omit ``--force``, the script skips the
heavy seed but **still applies** (or refreshes) symmetric ``works_with_id``
pairs on positions — useful after DB upgrades or imports that omitted peers.

**Demo password (all Acme Cloud demo logins):** ``AcmeCloud2026!``

**Logins seeded** (only what is needed to administer + verify HR):

    acme-admin@example.com         company_admin            (no employee row)
    acme-head-people@example.com   hr_ops                   (Nadia Roberts)
    acme-hrbp@example.com          hr_ops                   (Camille Dubois)
    acme-ta@example.com            talent_acquisition       (Joon Park)
    acme-comp@example.com          compensation_analytics   (Alex Greene)
    acme-ld@example.com            ld_performance           (Riya Sharma)

The other 44 employees are seeded as ``Employee`` rows with ``user_id = None``
so the org chart, headcount, and HR dashboards are populated without
polluting the user table.

Headcount per department (totals to 50):

    Executive Office       1   (CEO)
    Engineering           11   (CTO + VP + 2 Eng Mgrs + SRE Lead + 6 ICs)
    Product                4
    Design                 3
    Sales                  7
    Marketing              4
    Customer Success       5
    Support                2   (Support Lead + 1 IC; Lead reports to VP CS)
    Finance                3
    People (HR)            7
    IT and Security        2
    Legal                  1
"""

from __future__ import annotations

import argparse
import sys
from typing import NamedTuple

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

# Allow `python scripts/seed_acme_cloud.py` from backend/ as well as `-m scripts.seed_acme_cloud`.
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, ".")

from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.position import Position
from app.models.user import User


COMPANY_NAME = "Acme Cloud"
DEMO_PASSWORD = "AcmeCloud2026!"
EMAIL_DOMAIN = "example.com"

E_ADMIN = f"acme-admin@{EMAIL_DOMAIN}"
E_HEAD_PEOPLE = f"acme-head-people@{EMAIL_DOMAIN}"
E_HRBP = f"acme-hrbp@{EMAIL_DOMAIN}"
E_TA = f"acme-ta@{EMAIL_DOMAIN}"
E_COMP = f"acme-comp@{EMAIL_DOMAIN}"
E_LD = f"acme-ld@{EMAIL_DOMAIN}"

DEMO_LOGIN_EMAILS = (E_ADMIN, E_HEAD_PEOPLE, E_HRBP, E_TA, E_COMP, E_LD)

# Department keys must stay stable; the EMPLOYEES table below references them.
DEPARTMENTS: tuple[tuple[str, str], ...] = (
    ("executive", "Executive Office"),
    ("engineering", "Engineering"),
    ("product", "Product"),
    ("design", "Design"),
    ("sales", "Sales"),
    ("marketing", "Marketing"),
    ("customer_success", "Customer Success"),
    ("support", "Support"),
    ("finance", "Finance"),
    ("people", "People"),
    ("it", "IT and Security"),
    ("legal", "Legal"),
)


class EmpSpec(NamedTuple):
    """One row of the Acme Cloud org chart, source-of-truth for the seed."""

    code: str
    name: str
    dept_key: str
    title: str
    grade: int
    bucket: str  # "c_suite" or "none"
    manager_code: str | None
    login_email: str | None
    login_role: str | None
    hire_date: str


# 50 employees, manager_code references another employee's `code`. Order is
# only documentation; the seed handles forward refs by writing manager_id in a
# second pass.
EMPLOYEES: tuple[EmpSpec, ...] = (
    # --- Executive ---
    EmpSpec("AC-EXE001", "Daniel Kim", "executive", "CEO", 1, "c_suite", None, None, None, "2019-03-04"),

    # --- Engineering (11) ---
    EmpSpec("AC-ENG001", "Aarav Patel", "engineering", "CTO", 5, "c_suite", "AC-EXE001", None, None, "2019-06-12"),
    EmpSpec("AC-ENG002", "Sara Lindgren", "engineering", "VP Engineering", 10, "none", "AC-ENG001", None, None, "2020-01-22"),
    EmpSpec("AC-ENG003", "Marcus Webb", "engineering", "Engineering Manager, Platform", 15, "none", "AC-ENG002", None, None, "2020-08-03"),
    EmpSpec("AC-ENG004", "Yuki Tanaka", "engineering", "Engineering Manager, Application", 15, "none", "AC-ENG002", None, None, "2021-02-15"),
    EmpSpec("AC-ENG005", "Andre Costa", "engineering", "SRE Lead", 18, "none", "AC-ENG002", None, None, "2021-05-10"),
    EmpSpec("AC-ENG006", "Priya Iyer", "engineering", "Senior Software Engineer", 20, "none", "AC-ENG003", None, None, "2021-09-09"),
    EmpSpec("AC-ENG007", "James Okafor", "engineering", "Software Engineer II - Backend", 28, "none", "AC-ENG003", None, None, "2022-04-18"),
    EmpSpec("AC-ENG008", "Lin Wei", "engineering", "Software Engineer II - Backend", 28, "none", "AC-ENG003", None, None, "2022-11-07"),
    EmpSpec("AC-ENG009", "Tom Anderson", "engineering", "Software Engineer I", 35, "none", "AC-ENG003", None, None, "2024-07-01"),
    EmpSpec("AC-ENG010", "Hannah Schmidt", "engineering", "Software Engineer II - Frontend", 28, "none", "AC-ENG004", None, None, "2023-02-13"),
    EmpSpec("AC-ENG011", "Devon Lee", "engineering", "Site Reliability Engineer", 28, "none", "AC-ENG005", None, None, "2023-08-21"),

    # --- Product (4) ---
    EmpSpec("AC-PRD001", "Maya Rodriguez", "product", "VP Product", 10, "none", "AC-ENG001", None, None, "2020-04-06"),
    EmpSpec("AC-PRD002", "Robert Patel", "product", "Senior Product Manager", 20, "none", "AC-PRD001", None, None, "2021-07-12"),
    EmpSpec("AC-PRD003", "Aisha Khan", "product", "Product Manager", 28, "none", "AC-PRD001", None, None, "2022-09-26"),
    EmpSpec("AC-PRD004", "Felix Brandt", "product", "Product Manager", 28, "none", "AC-PRD001", None, None, "2023-05-03"),

    # --- Design (3) ---
    EmpSpec("AC-DES001", "Eva Rasmussen", "design", "Director, Design", 10, "none", "AC-ENG001", None, None, "2020-10-19"),
    EmpSpec("AC-DES002", "Noor Hassan", "design", "Senior Product Designer", 20, "none", "AC-DES001", None, None, "2022-01-14"),
    EmpSpec("AC-DES003", "Theo Park", "design", "Product Designer", 28, "none", "AC-DES001", None, None, "2023-06-08"),

    # --- Sales (7) ---
    EmpSpec("AC-SAL001", "Carlos Mendes", "sales", "VP Sales", 5, "c_suite", "AC-EXE001", None, None, "2020-02-11"),
    EmpSpec("AC-SAL002", "Olivia Chen", "sales", "Sales Manager", 15, "none", "AC-SAL001", None, None, "2021-03-29"),
    EmpSpec("AC-SAL003", "Kwame Asante", "sales", "Account Executive", 28, "none", "AC-SAL002", None, None, "2022-05-23"),
    EmpSpec("AC-SAL004", "Anya Petrov", "sales", "Account Executive", 28, "none", "AC-SAL002", None, None, "2022-10-04"),
    EmpSpec("AC-SAL005", "Liam O'Connor", "sales", "Account Executive", 28, "none", "AC-SAL002", None, None, "2023-04-17"),
    EmpSpec("AC-SAL006", "Mei Zhang", "sales", "Sales Development Representative", 35, "none", "AC-SAL002", None, None, "2024-02-12"),
    EmpSpec("AC-SAL007", "Diego Alvarez", "sales", "Sales Development Representative", 35, "none", "AC-SAL002", None, None, "2024-09-05"),

    # --- Marketing (4) ---
    EmpSpec("AC-MKT001", "Victoria Holm", "marketing", "VP Marketing", 5, "c_suite", "AC-EXE001", None, None, "2020-06-01"),
    EmpSpec("AC-MKT002", "Sanjay Bhatt", "marketing", "Marketing Manager", 15, "none", "AC-MKT001", None, None, "2021-08-30"),
    EmpSpec("AC-MKT003", "Chloe Martin", "marketing", "Marketing Specialist", 35, "none", "AC-MKT002", None, None, "2023-01-20"),
    EmpSpec("AC-MKT004", "Ravi Pillai", "marketing", "Marketing Specialist", 35, "none", "AC-MKT002", None, None, "2023-11-13"),

    # --- Customer Success (5) ---
    EmpSpec("AC-CSM001", "Sebastian Roth", "customer_success", "VP Customer Success", 5, "c_suite", "AC-EXE001", None, None, "2020-09-14"),
    EmpSpec("AC-CSM002", "Hina Suzuki", "customer_success", "Customer Success Manager Lead", 15, "none", "AC-CSM001", None, None, "2021-11-02"),
    EmpSpec("AC-CSM003", "Olu Adebayo", "customer_success", "Customer Success Manager", 28, "none", "AC-CSM002", None, None, "2022-08-15"),
    EmpSpec("AC-CSM004", "Beatriz Silva", "customer_success", "Customer Success Manager", 28, "none", "AC-CSM002", None, None, "2023-03-27"),
    EmpSpec("AC-CSM005", "Tara Nguyen", "customer_success", "Customer Success Manager", 28, "none", "AC-CSM002", None, None, "2023-10-09"),

    # --- Support (2) ---
    EmpSpec("AC-SUP001", "Jordan Brooks", "support", "Support Lead", 18, "none", "AC-CSM001", None, None, "2021-12-06"),
    EmpSpec("AC-SUP002", "Mira Patel", "support", "Support Specialist", 35, "none", "AC-SUP001", None, None, "2023-07-24"),

    # --- Finance (3) ---
    EmpSpec("AC-FIN001", "Henry Wallace", "finance", "CFO", 5, "c_suite", "AC-EXE001", None, None, "2019-11-18"),
    EmpSpec("AC-FIN002", "Sofia Marin", "finance", "Controller", 15, "none", "AC-FIN001", None, None, "2020-12-02"),
    EmpSpec("AC-FIN003", "Erik Nilsson", "finance", "Senior Accountant", 28, "none", "AC-FIN002", None, None, "2022-03-21"),

    # --- People / HR (7) ---
    EmpSpec("AC-PPL001", "Nadia Roberts", "people", "Head of People", 5, "c_suite", "AC-EXE001", E_HEAD_PEOPLE, "hr_ops", "2020-05-04"),
    EmpSpec("AC-PPL002", "Camille Dubois", "people", "HR Business Partner", 15, "none", "AC-PPL001", E_HRBP, "hr_ops", "2021-06-21"),
    EmpSpec("AC-PPL003", "Joon Park", "people", "Talent Acquisition Lead", 18, "none", "AC-PPL001", E_TA, "talent_acquisition", "2021-09-13"),
    EmpSpec("AC-PPL004", "Esha Chowdhury", "people", "Recruiter", 28, "none", "AC-PPL003", None, None, "2023-02-06"),
    EmpSpec("AC-PPL005", "Alex Greene", "people", "Compensation and Benefits Analyst", 20, "none", "AC-PPL001", E_COMP, "compensation_analytics", "2022-04-11"),
    EmpSpec("AC-PPL006", "Riya Sharma", "people", "Learning and Development Specialist", 20, "none", "AC-PPL001", E_LD, "ld_performance", "2022-08-29"),
    EmpSpec("AC-PPL007", "Marcus Hall", "people", "HR Operations Generalist", 28, "none", "AC-PPL002", None, None, "2023-05-15"),

    # --- IT and Security (2) ---
    EmpSpec("AC-ITS001", "Kazuo Yamada", "it", "Head of IT and Security", 5, "c_suite", "AC-EXE001", None, None, "2020-07-22"),
    EmpSpec("AC-ITS002", "Naomi Green", "it", "IT Engineer", 28, "none", "AC-ITS001", None, None, "2022-10-17"),

    # --- Legal (1) ---
    EmpSpec("AC-LGL001", "Elena Vargas", "legal", "General Counsel", 5, "c_suite", "AC-EXE001", None, None, "2020-11-30"),
)

# Symmetric "works with" peers for org-chart demo (two-way pointer on each position).
# Pairs are employee `code` values; applied after `reports_to_id` is wired.
# One works_with partner per position; each code may appear in at most one pair here.
WORKS_WITH_SYMMETRIC: tuple[tuple[str, str], ...] = (
    ("AC-PRD001", "AC-ENG002"),  # VP Product <-> VP Engineering
    ("AC-MKT001", "AC-SAL001"),  # VP Marketing <-> VP Sales
    ("AC-DES001", "AC-PRD002"),  # Director, Design <-> Sr PM (cross design / product pillars)
    ("AC-SUP001", "AC-CSM001"),  # Support Lead <-> VP Customer Success
    ("AC-ITS001", "AC-LGL001"),  # Head of IT <-> General Counsel
    ("AC-FIN002", "AC-PPL003"),  # Controller <-> Talent Acquisition Lead (finance / people)
)


def _user(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def _ensure_user(db: Session, email: str, name: str) -> User:
    existing = _user(db, email)
    if existing:
        return existing
    u = User(
        id=uuid_str(),
        email=email,
        password_hash=get_password_hash(DEMO_PASSWORD),
        name=name,
        is_platform_admin=False,
    )
    db.add(u)
    db.flush()
    return u


def patch_works_with_for_existing_acme(db: Session, company_id: str) -> None:
    """Set symmetric ``works_with_id`` links from ``WORKS_WITH_SYMMETRIC`` via ``employee_code``."""
    codes: set[str] = set()
    for code_a, code_b in WORKS_WITH_SYMMETRIC:
        codes.add(code_a)
        codes.add(code_b)

    emps = list(
        db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                Employee.employee_code.in_(codes),
            )
        ).scalars().all()
    )

    pos_by_code: dict[str, Position] = {}
    unresolved: list[str] = []
    for c in sorted(codes):
        e = next((row for row in emps if row.employee_code == c), None)
        if not e or not e.position_id:
            unresolved.append(c)
            continue
        p = db.get(Position, e.position_id)
        if not p or p.company_id != company_id:
            unresolved.append(c)
            continue
        pos_by_code[c] = p

    if unresolved:
        print(
            f'  Warning: could not resolve position for employee_code(s): {", ".join(unresolved)}',
        )

    pairs_updated = 0
    for code_a, code_b in WORKS_WITH_SYMMETRIC:
        pa = pos_by_code.get(code_a)
        pb = pos_by_code.get(code_b)
        if not pa or not pb or pa.id == pb.id:
            continue
        if pa.works_with_id != pb.id or pb.works_with_id != pa.id:
            pa.works_with_id = pb.id
            pb.works_with_id = pa.id
            pairs_updated += 1

    if pairs_updated:
        db.commit()
        print(f'  Applied works-with data: {pairs_updated} symmetric peer pair(s) updated.')
    else:
        print("  Works-with peer links already match the seed (no position changes).")


def _membership(db: Session, *, user_id: str, company_id: str, role: str) -> None:
    dup = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user_id,
            CompanyMembership.company_id == company_id,
        )
    ).scalar_one_or_none()
    if dup:
        return
    db.add(
        CompanyMembership(
            id=uuid_str(),
            user_id=user_id,
            company_id=company_id,
            role=role,
            status="active",
            modules_access_json=None,
        )
    )


def seed(*, force: bool = False) -> None:
    # Guard against an obvious mistake before we do anything destructive.
    seen_codes = {e.code for e in EMPLOYEES}
    assert len(seen_codes) == len(EMPLOYEES), "Duplicate employee code in EMPLOYEES table"
    code_to_spec = {e.code: e for e in EMPLOYEES}
    for spec in EMPLOYEES:
        if spec.manager_code is not None:
            assert spec.manager_code in code_to_spec, (
                f"Employee {spec.code} references unknown manager {spec.manager_code}"
            )

    with SessionLocal() as db:
        existing = db.execute(select(Company).where(Company.name == COMPANY_NAME)).scalar_one_or_none()
        if existing:
            if not force:
                print(f'Company "{COMPANY_NAME}" already exists (id={existing.id}). Skip full seed.')
                print(
                    'Applying symmetric "works-with" peers on org positions (see WORKS_WITH_SYMMETRIC'
                    " in this script). Use --force to wipe the company and re-seed from scratch.\n",
                )
                patch_works_with_for_existing_acme(db, existing.id)
                return
            db.execute(delete(Company).where(Company.id == existing.id))
            db.commit()
            print(f'Removed existing "{COMPANY_NAME}" (id={existing.id}) and related rows. Continuing...\n')

        if force:
            for email in DEMO_LOGIN_EMAILS:
                u = _user(db, email)
                if u:
                    db.delete(u)
            db.commit()

        # --- Company ---
        company = Company(
            id=uuid_str(),
            name=COMPANY_NAME,
            logo_url=None,
            industry="B2B SaaS",
            location="San Francisco, CA (HQ) · Remote-friendly",
            config_json={"demo_seed": "acme_cloud_v1", "tagline": "Cloud workflow automation."},
        )
        db.add(company)
        db.flush()

        # --- Locations ---
        loc_hq = Location(
            id=uuid_str(),
            company_id=company.id,
            name="San Francisco HQ",
            address="201 California St, San Francisco, CA 94111",
            timezone="America/Los_Angeles",
            country="US",
        )
        loc_remote = Location(
            id=uuid_str(),
            company_id=company.id,
            name="Remote · US",
            address=None,
            timezone="America/Los_Angeles",
            country="US",
        )
        db.add_all([loc_hq, loc_remote])
        db.flush()

        # --- Departments ---
        dept_by_key: dict[str, Department] = {}
        for key, name in DEPARTMENTS:
            d = Department(
                id=uuid_str(),
                company_id=company.id,
                name=name,
                parent_id=None,
                head_employee_id=None,
                level=0,
            )
            db.add(d)
            dept_by_key[key] = d
        db.flush()

        # --- Job catalog (one row per unique title used by EMPLOYEES) ---
        job_by_title: dict[str, JobCatalogEntry] = {}
        for spec in EMPLOYEES:
            if spec.title in job_by_title:
                continue
            j = JobCatalogEntry(
                id=uuid_str(),
                company_id=company.id,
                title=spec.title,
                family=dept_by_key[spec.dept_key].name,
                level=f"L{max(1, 10 - spec.grade // 5)}",
                grade=f"G{spec.grade}",
                salary_band_json={"currency": "SimCash", "notes": "Demo band for Acme Cloud"},
            )
            db.add(j)
            job_by_title[spec.title] = j
        db.flush()

        # --- Positions: one chair per employee on the chart ---
        # First pass: create with reports_to_id=None; second pass fills it in.
        # Only the CEO has no department on the chart (synthetic C-suite column);
        # every other c_suite role lives in the department they lead so the column
        # placement matches the real reporting structure.
        pos_by_code: dict[str, Position] = {}
        for spec in EMPLOYEES:
            is_ceo = spec.code == "AC-EXE001"
            dept_id = None if is_ceo else dept_by_key[spec.dept_key].id
            p = Position(
                id=uuid_str(),
                company_id=company.id,
                name=spec.title,
                department_id=dept_id,
                bucket=spec.bucket,
                grade=spec.grade,
                reports_to_id=None,
                works_with_id=None,
            )
            db.add(p)
            pos_by_code[spec.code] = p
        db.flush()
        for spec in EMPLOYEES:
            if spec.manager_code is None:
                continue
            pos_by_code[spec.code].reports_to_id = pos_by_code[spec.manager_code].id
        db.flush()

        for code_a, code_b in WORKS_WITH_SYMMETRIC:
            pos_by_code[code_a].works_with_id = pos_by_code[code_b].id
            pos_by_code[code_b].works_with_id = pos_by_code[code_a].id
        db.flush()

        # --- Employees: same two-pass trick for manager_id ---
        emp_by_code: dict[str, Employee] = {}
        for spec in EMPLOYEES:
            e = Employee(
                id=uuid_str(),
                company_id=company.id,
                user_id=None,
                employee_code=spec.code,
                department_id=dept_by_key[spec.dept_key].id,
                job_id=job_by_title[spec.title].id,
                position_id=pos_by_code[spec.code].id,
                manager_id=None,
                location_id=loc_hq.id,
                status="active",
                hire_date=spec.hire_date,
                personal_info_json={"full_name": spec.name},
                documents_json=None,
                onboarding_checklist_json={
                    "items": [
                        {"task": "Sign offer letter", "done": True},
                        {"task": "I-9 verification", "done": True},
                        {"task": "Laptop pickup", "done": True},
                    ]
                },
            )
            db.add(e)
            emp_by_code[spec.code] = e
        db.flush()
        for spec in EMPLOYEES:
            if spec.manager_code is None:
                continue
            emp_by_code[spec.code].manager_id = emp_by_code[spec.manager_code].id
        db.flush()

        # Mark CEO as Executive Office department head; Head of People as People head.
        dept_by_key["executive"].head_employee_id = emp_by_code["AC-EXE001"].id
        dept_by_key["people"].head_employee_id = emp_by_code["AC-PPL001"].id

        # --- Logins ---
        # 1. Standalone company admin (no employee row).
        u_admin = _ensure_user(db, E_ADMIN, "Acme Cloud Admin")
        _membership(db, user_id=u_admin.id, company_id=company.id, role="company_admin")

        # 2. Five HR personas linked to their employee record.
        for spec in EMPLOYEES:
            if spec.login_email is None or spec.login_role is None:
                continue
            u = _ensure_user(db, spec.login_email, spec.name)
            _membership(db, user_id=u.id, company_id=company.id, role=spec.login_role)
            emp_by_code[spec.code].user_id = u.id

        db.commit()

        # --- Verification + summary ---
        emp_count = db.scalar(
            select(func.count()).select_from(Employee).where(Employee.company_id == company.id)
        )
        pos_count = db.scalar(
            select(func.count()).select_from(Position).where(Position.company_id == company.id)
        )
        dept_count = db.scalar(
            select(func.count()).select_from(Department).where(Department.company_id == company.id)
        )

        print("Acme Cloud demo seed complete.\n")
        print(f"  Company: {COMPANY_NAME}  (id={company.id})")
        print(f"  Departments: {dept_count}   Positions: {pos_count}   Employees: {emp_count}\n")
        print(f"  Demo password (all logins): {DEMO_PASSWORD}\n")
        print("  Logins:")
        print(f"    {E_ADMIN:<35} -> company_admin              (no employee row)")
        print(f"    {E_HEAD_PEOPLE:<35} -> hr_ops                     (Head of People)")
        print(f"    {E_HRBP:<35} -> hr_ops                     (HR Business Partner)")
        print(f"    {E_TA:<35} -> talent_acquisition         (TA Lead)")
        print(f"    {E_COMP:<35} -> compensation_analytics    (Comp Analyst)")
        print(f"    {E_LD:<35} -> ld_performance             (L&D Specialist)")
        print()
        # Per-department headcount.
        rows = db.execute(
            select(Department.name, func.count(Employee.id))
            .join(Employee, Employee.department_id == Department.id)
            .where(Department.company_id == company.id)
            .group_by(Department.id)
            .order_by(Department.name)
        ).all()
        print("  Per-department headcount:")
        for dname, n in rows:
            print(f"    {dname:<22} {n}")
        print()


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed Acme Cloud (50-employee SaaS demo).")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Delete existing Acme Cloud company and demo logins, then re-seed. Dev/SQLite use only.",
    )
    args = ap.parse_args()
    seed(force=args.force)


if __name__ == "__main__":
    main()
