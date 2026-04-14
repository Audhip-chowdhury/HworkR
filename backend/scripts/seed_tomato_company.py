"""
Seed **Tomato** — online food delivery demo company for compensation, payroll, HR, and ATS testing.

Run from the `backend` directory::

    python -m scripts.seed_tomato_company

Idempotent: if a company named ``Tomato`` already exists, the script exits without duplicating data.
To replace an old Tomato seed (e.g. after switching email domains), run with ``--force`` (deletes that company row and cascades related rows, then re-seeds).

**Emails** use ``@example.com`` so browsers and Pydantic ``EmailStr`` validation accept sign-in.

**Demo password (all Tomato demo users):** ``TomatoDemo2026!``

**What gets created**

- Company: Tomato (industry: online food delivery, remote-first India)
- Users (logins) + memberships: admin, compensation, HR, TA, two employees
- Candidate users (no membership): offered candidate + pipeline candidate
- Departments: Fleet & Delivery, Technology, Operations, People & Culture, Customer Experience
- Locations: Bengaluru HQ Hub, Remote / All-India
- Job catalog: roles from delivery partner to engineering (with grade hints in ``level``)
- Employees: 6 records with names/codes, departments, jobs, reporting line
- Salary structures (SimCash): ``ctc_annual`` + ``bonus_pct_of_ctc`` per employee
- Pay run: current calendar month, status ``draft``
- Recruitment: approved requisition, open job posting, applications (offer stage + interview stage), one sent offer with SimCash compensation

Environment: uses the same database as the API (see ``DATABASE_URL`` / ``database_url`` in ``.env``).
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

# Allow `python scripts/seed_tomato_company.py` from backend/
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, ".")

from app.core.security import get_password_hash
from app.database import SessionLocal
from app.models.base import uuid_str
from app.models.company import Company
from app.models.compensation_engagement import PayRun, SalaryStructure
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.recruitment import Application, Interview, JobPosting, Offer, Requisition
from app.models.user import User

DEMO_PASSWORD = "TomatoDemo2026!"
COMPANY_NAME = "Tomato"

# Use a public-domain suffix so Pydantic/email-validator accepts logins (avoid *.local).
_EMAIL_DOMAIN = "example.com"
E_TOMATO_ADMIN = f"tomato-admin@{_EMAIL_DOMAIN}"
E_TOMATO_COMP = f"tomato-comp@{_EMAIL_DOMAIN}"
E_TOMATO_HR = f"tomato-hr@{_EMAIL_DOMAIN}"
E_TOMATO_TA = f"tomato-ta@{_EMAIL_DOMAIN}"
E_TOMATO_RIDER = f"tomato-rider@{_EMAIL_DOMAIN}"
E_TOMATO_DEV = f"tomato-dev@{_EMAIL_DOMAIN}"
E_CAND_OFFERED = f"tomato-cand-offered@{_EMAIL_DOMAIN}"
E_CAND_PIPELINE = f"tomato-cand-pipeline@{_EMAIL_DOMAIN}"

# Previous seed used *.demo.hworkr.local (rejected by strict email validators) — remove on --force
_LEGACY_TOMATO_EMAILS = (
    "tomato.admin@demo.hworkr.local",
    "tomato.comp@demo.hworkr.local",
    "tomato.hr@demo.hworkr.local",
    "tomato.ta@demo.hworkr.local",
    "tomato.rider@demo.hworkr.local",
    "tomato.dev@demo.hworkr.local",
    "candidate.offered@demo.hworkr.local",
    "candidate.pipeline@demo.hworkr.local",
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


def _membership(db: Session, user_id: str, company_id: str, role: str) -> None:
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
    with SessionLocal() as db:
        existing = db.execute(select(Company).where(Company.name == COMPANY_NAME)).scalar_one_or_none()
        if existing:
            if not force:
                print(f'Company "{COMPANY_NAME}" already exists (id={existing.id}). Skip seed.')
                print('Re-run with --force to delete this company and seed again (dev DB).')
                return
            db.execute(delete(Company).where(Company.id == existing.id))
            db.commit()
            print(f'Removed existing "{COMPANY_NAME}" (id={existing.id}) and related rows. Continuing...\n')

        if force:
            # Recreate users cleanly; also drop legacy @demo.hworkr.local accounts from older seeds
            for email in (
                E_TOMATO_ADMIN,
                E_TOMATO_COMP,
                E_TOMATO_HR,
                E_TOMATO_TA,
                E_TOMATO_RIDER,
                E_TOMATO_DEV,
                E_CAND_OFFERED,
                E_CAND_PIPELINE,
                *_LEGACY_TOMATO_EMAILS,
            ):
                u = _user(db, email)
                if u:
                    db.delete(u)
            db.commit()

        # --- Company ---
        company = Company(
            id=uuid_str(),
            name=COMPANY_NAME,
            logo_url=None,
            industry="Online food delivery",
            location="India · remote-first",
            config_json={"demo_seed": "tomato_v2_example_com", "tagline": "Hot meals, fast delivery."},
        )
        db.add(company)
        db.flush()

        # --- Users ---
        u_admin = _ensure_user(db, E_TOMATO_ADMIN, "Tomato Admin")
        u_comp = _ensure_user(db, E_TOMATO_COMP, "Tomato Compensation")
        u_hr = _ensure_user(db, E_TOMATO_HR, "Tomato HR")
        u_ta = _ensure_user(db, E_TOMATO_TA, "Tomato Talent")
        u_rider = _ensure_user(db, E_TOMATO_RIDER, "Meera Nair")
        u_dev = _ensure_user(db, E_TOMATO_DEV, "Rahul Verma")
        u_cand_offer = _ensure_user(db, E_CAND_OFFERED, "Sanjay Kulkarni")
        u_cand_pipe = _ensure_user(db, E_CAND_PIPELINE, "Deepa Iyer")

        _membership(db, u_admin.id, company.id, "company_admin")
        _membership(db, u_comp.id, company.id, "compensation_analytics")
        _membership(db, u_hr.id, company.id, "hr_ops")
        _membership(db, u_ta.id, company.id, "talent_acquisition")
        _membership(db, u_rider.id, company.id, "employee")
        _membership(db, u_dev.id, company.id, "employee")

        # --- Locations ---
        loc_hq = Location(
            id=uuid_str(),
            company_id=company.id,
            name="Bengaluru HQ Hub",
            address="Koramangala, Bengaluru",
            timezone="Asia/Kolkata",
            country="IN",
        )
        loc_remote = Location(
            id=uuid_str(),
            company_id=company.id,
            name="Remote · All India",
            address=None,
            timezone="Asia/Kolkata",
            country="IN",
        )
        db.add_all([loc_hq, loc_remote])
        db.flush()

        # --- Departments ---
        dept_fleet = Department(
            id=uuid_str(), company_id=company.id, name="Fleet & Delivery", parent_id=None, head_employee_id=None, level=0
        )
        dept_tech = Department(
            id=uuid_str(), company_id=company.id, name="Technology", parent_id=None, head_employee_id=None, level=0
        )
        dept_ops = Department(
            id=uuid_str(), company_id=company.id, name="Operations", parent_id=None, head_employee_id=None, level=0
        )
        dept_people = Department(
            id=uuid_str(), company_id=company.id, name="People & Culture", parent_id=None, head_employee_id=None, level=0
        )
        dept_cx = Department(
            id=uuid_str(), company_id=company.id, name="Customer Experience", parent_id=None, head_employee_id=None, level=0
        )
        db.add_all([dept_fleet, dept_tech, dept_ops, dept_people, dept_cx])
        db.flush()

        # --- Job catalog (positions) ---
        jobs_spec: list[tuple[str, str | None, str | None, str | None]] = [
            ("Delivery Partner", "Operations", "L2", "G2"),
            ("Fleet Supervisor", "Operations", "L3", "G3"),
            ("Software Engineer", "Engineering", "L4", "G4"),
            ("HR Executive", "People", "L3", "G3"),
            ("Operations Manager", "Operations", "L5", "G5"),
            ("Customer Support Agent", "Support", "L2", "G2"),
        ]
        job_rows: list[JobCatalogEntry] = []
        for title, family, level, grade in jobs_spec:
            j = JobCatalogEntry(
                id=uuid_str(),
                company_id=company.id,
                title=title,
                family=family,
                level=level,
                grade=grade,
                salary_band_json={"currency": "SimCash", "notes": "Demo band for Tomato"},
            )
            db.add(j)
            job_rows.append(j)
        db.flush()
        job_by_title = {j.title: j for j in job_rows}

        # --- Employees (manager first) ---
        def emp(
            code: str,
            full_name: str,
            dept: Department,
            job: JobCatalogEntry,
            uid: str | None,
            manager: Employee | None,
            hire: str,
            status: str = "active",
        ) -> Employee:
            e = Employee(
                id=uuid_str(),
                company_id=company.id,
                user_id=uid,
                employee_code=code,
                department_id=dept.id,
                job_id=job.id,
                manager_id=manager.id if manager else None,
                location_id=loc_hq.id,
                status=status,
                hire_date=hire,
                personal_info_json={"full_name": full_name},
                documents_json=None,
                onboarding_checklist_json={"items": [{"task": "Bank KYC", "done": True}, {"task": "FSSAI disclosure", "done": False}]},
            )
            db.add(e)
            return e

        e_priya = emp(
            "TOM-M01",
            "Priya Sharma",
            dept_ops,
            job_by_title["Operations Manager"],
            None,
            None,
            "2023-01-15",
        )
        db.flush()

        e_meera = emp(
            "TOM-R01",
            "Meera Nair",
            dept_fleet,
            job_by_title["Delivery Partner"],
            u_rider.id,
            e_priya,
            "2024-06-01",
        )
        e_rahul = emp(
            "TOM-T01",
            "Rahul Verma",
            dept_tech,
            job_by_title["Software Engineer"],
            u_dev.id,
            e_priya,
            "2023-09-10",
        )
        e_anita = emp(
            "TOM-H01",
            "Anita Desai",
            dept_people,
            job_by_title["HR Executive"],
            None,
            e_priya,
            "2024-02-20",
        )
        e_vikram = emp(
            "TOM-F01",
            "Vikram Singh",
            dept_fleet,
            job_by_title["Fleet Supervisor"],
            None,
            e_priya,
            "2023-11-05",
        )
        e_kavita = emp(
            "TOM-C01",
            "Kavita Reddy",
            dept_cx,
            job_by_title["Customer Support Agent"],
            None,
            e_priya,
            "2025-01-08",
        )
        e_offer_new = emp(
            "TOM-P01",
            "Arjun Mehta (pending start)",
            dept_tech,
            job_by_title["Software Engineer"],
            None,
            e_priya,
            "2026-05-01",
            status="onboarding",
        )
        db.flush()

        # --- SimCash salary structures (annual CTC, bonus % of CTC) ---
        ctc_map: list[tuple[Employee, float, float]] = [
            (e_priya, 120_000.0, 0.10),
            (e_meera, 48_000.0, 0.05),
            (e_rahul, 95_000.0, 0.08),
            (e_anita, 65_000.0, 0.0625),
            (e_vikram, 72_000.0, 0.06),
            (e_kavita, 52_000.0, 0.05),
            (e_offer_new, 88_000.0, 0.07),
        ]
        for e, ctc, bonus_pct in ctc_map:
            db.add(
                SalaryStructure(
                    id=uuid_str(),
                    company_id=company.id,
                    employee_id=e.id,
                    components_json={
                        "ctc_annual": ctc,
                        "bonus_pct_of_ctc": bonus_pct,
                    },
                    effective_from="2026-04-01",
                )
            )

        now = datetime.now(tz=UTC)
        pr = PayRun(
            id=uuid_str(),
            company_id=company.id,
            month=now.month,
            year=now.year,
            status="draft",
            processed_by=None,
            processed_at=None,
        )
        db.add(pr)

        # --- Recruitment ---
        req = Requisition(
            id=uuid_str(),
            company_id=company.id,
            created_by=u_ta.id,
            department_id=dept_tech.id,
            job_id=job_by_title["Software Engineer"].id,
            headcount=4,
            status="approved",
            hiring_criteria_json={"stack": ["Python", "PostgreSQL"], "location": "remote_IN"},
            approval_chain_json=None,
        )
        db.add(req)
        db.flush()

        post = JobPosting(
            id=uuid_str(),
            requisition_id=req.id,
            company_id=company.id,
            title="Senior Backend Engineer — Tomato",
            description="Build reliable dispatch and order APIs for millions of deliveries.",
            requirements="4+ yrs backend; Python/FastAPI or similar; SQL.",
            deadline=(now + timedelta(days=30)).date().isoformat(),
            status="open",
        )
        db.add(post)
        db.flush()

        app_offer = Application(
            id=uuid_str(),
            posting_id=post.id,
            company_id=company.id,
            candidate_user_id=u_cand_offer.id,
            resume_url=None,
            status="active",
            stage="offer",
            notes="Strong system design round.",
        )
        app_pipe = Application(
            id=uuid_str(),
            posting_id=post.id,
            company_id=company.id,
            candidate_user_id=u_cand_pipe.id,
            resume_url=None,
            status="active",
            stage="interview",
            notes="Scheduled panel interview.",
        )
        db.add_all([app_offer, app_pipe])
        db.flush()

        db.add(
            Interview(
                id=uuid_str(),
                application_id=app_pipe.id,
                company_id=company.id,
                scheduled_at=now + timedelta(days=3),
                panel_json={"interviewers": [E_TOMATO_TA], "format": "video"},
                format="video",
                feedback_json=None,
                status="scheduled",
            )
        )

        db.add(
            Offer(
                id=uuid_str(),
                application_id=app_offer.id,
                company_id=company.id,
                compensation_json={
                    "currency": "SimCash",
                    "ctc_annual_simcash": 90000,
                    "bonus_pct_of_ctc": 0.075,
                    "joining_bonus_simcash": 5000,
                    "notes": "Aligned to Tomato L4 engineering band",
                },
                start_date="2026-05-15",
                status="sent",
            )
        )

        db.commit()

        print("Tomato demo seed complete.\n")
        print(f"  Company: {COMPANY_NAME}  (id={company.id})")
        print(f"  Password for all Tomato demo accounts: {DEMO_PASSWORD}\n")
        print("  Logins (company membership):")
        print(f"    {E_TOMATO_ADMIN}   -> company_admin")
        print(f"    {E_TOMATO_COMP}    -> compensation_analytics  (payroll / SimCash)")
        print(f"    {E_TOMATO_HR}      -> hr_ops")
        print(f"    {E_TOMATO_TA}      -> talent_acquisition")
        print(f"    {E_TOMATO_RIDER}   -> employee (Meera, delivery)")
        print(f"    {E_TOMATO_DEV}     -> employee (Rahul, engineer)")
        print("\n  Candidate accounts (no company login; use for candidate flows / tests):")
        print(f"    {E_CAND_OFFERED}   -> application in offer stage")
        print(f"    {E_CAND_PIPELINE}  -> application in interview stage")
        print("\n  Employees: 7 rows (incl. onboarding). Salary structures + draft pay run for current month.")
        print("  ATS: 1 approved requisition, 1 open posting, 2 applications, 1 interview, 1 sent offer.\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed Tomato demo company (compensation / HR / ATS).")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Delete existing Tomato company (and on re-seed, demo users) then seed again. For dev SQLite DBs.",
    )
    args = ap.parse_args()
    seed(force=args.force)


if __name__ == "__main__":
    main()
