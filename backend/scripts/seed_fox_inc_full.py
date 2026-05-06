#!/usr/bin/env python3
"""
Seed a rich, cross-module demo dataset for company "Fox Inc".

Creates (or updates) enough data for meaningful charts across:
- employees / org / locations / grades / diversity
- recruitment (reqs, postings, applications, interviews, offers)
- compensation + payroll (salary structures, pay runs, payslips)
- compensation review cycles + proposals (increment cycles)
- leave (policies, balances, requests)
- L&D (courses, assignments, completions)
- benefits (plans + enrollments)
- surveys (responses + action plans)
- audits / notifications / inbox / policy docs + acknowledgments

Run (from backend/):
  python3 scripts/seed_fox_inc_full.py
  python3 scripts/seed_fox_inc_full.py --force --employees 50
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.core.security import get_password_hash
from app.database import SessionLocal, init_db
from app.models.audit import AuditTrailEntry
from app.models.base import uuid_str
from app.models.company import Company
from app.models.compensation_engagement import (
    BenefitsEnrollment,
    BenefitsPlan,
    CompensationGradeBand,
    CompensationReviewCycle,
    CompensationReviewGuideline,
    CompensationReviewProposal,
    PayRun,
    PayRunEmployeeLine,
    Payslip,
    SalaryStructure,
    Survey,
    SurveyActionPlan,
    SurveyResponse,
)
from app.models.employee import Employee
from app.models.hr_ops import LeaveBalance, LeavePolicy, LeaveRequest
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.notification import Notification
from app.models.org import Department, JobCatalogEntry, Location
from app.models.performance_learning import Course, TrainingAssignment, TrainingCompletion
from app.models.policy import PolicyAcknowledgment, PolicyDocument
from app.models.position import Position
from app.models.recruitment import Application, Interview, JobPosting, Offer, Requisition
from app.models.user import User

COMPANY_NAME = "Fox Inc"
SEED_TAG = "fox_inc_full_seed_v1"
DEFAULT_EMPLOYEES = 50
SEED_PASSWORD = "FoxIncDemo2026!"
EMAIL_DOMAIN = "fox-seed.example.com"
PRIMARY_ADMIN_EMAIL = "mfox@email.com"


@dataclass
class SeedContext:
    company: Company
    admin_user: User
    hr_user: User
    ta_user: User
    comp_user: User
    ld_user: User
    employees: list[Employee]
    departments: dict[str, Department]
    locations: list[Location]
    jobs: list[JobCatalogEntry]
    positions: list[Position]


def _company_by_name(db: Session, name: str) -> Company | None:
    return db.execute(select(Company).where(func.lower(Company.name) == name.lower())).scalar_one_or_none()


def _ensure_user(db: Session, email: str, name: str, *, platform_admin: bool = False) -> User:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u:
        if platform_admin and not u.is_platform_admin:
            u.is_platform_admin = True
        return u
    u = User(
        id=uuid_str(),
        email=email,
        name=name,
        password_hash=get_password_hash(SEED_PASSWORD),
        is_platform_admin=platform_admin,
    )
    db.add(u)
    db.flush()
    return u


def _ensure_membership(db: Session, *, user_id: str, company_id: str, role: str) -> None:
    row = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user_id,
            CompanyMembership.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row:
        row.role = role
        row.status = "active"
        return
    db.add(
        CompanyMembership(
            id=uuid_str(),
            user_id=user_id,
            company_id=company_id,
            role=role,
            status="active",
        )
    )


def _seed_admin_users(db: Session, company: Company) -> tuple[User, User, User, User, User]:
    # Ensure the user's real admin account is attached to Fox Inc.
    primary_admin = _ensure_user(db, PRIMARY_ADMIN_EMAIL, "Fox Platform Admin")
    admin = _ensure_user(db, f"fox-admin@{EMAIL_DOMAIN}", "Fox Inc Admin")
    hr = _ensure_user(db, f"fox-hr@{EMAIL_DOMAIN}", "Fox HR Lead")
    ta = _ensure_user(db, f"fox-ta@{EMAIL_DOMAIN}", "Fox Talent Lead")
    comp = _ensure_user(db, f"fox-comp@{EMAIL_DOMAIN}", "Fox Compensation Lead")
    ld = _ensure_user(db, f"fox-ld@{EMAIL_DOMAIN}", "Fox Learning Lead")
    _ensure_membership(db, user_id=primary_admin.id, company_id=company.id, role="company_admin")
    _ensure_membership(db, user_id=admin.id, company_id=company.id, role="company_admin")
    _ensure_membership(db, user_id=hr.id, company_id=company.id, role="hr_ops")
    _ensure_membership(db, user_id=ta.id, company_id=company.id, role="talent_acquisition")
    _ensure_membership(db, user_id=comp.id, company_id=company.id, role="compensation_analytics")
    _ensure_membership(db, user_id=ld.id, company_id=company.id, role="ld_performance")
    db.flush()
    return admin, hr, ta, comp, ld


def _seed_org_basics(db: Session, company: Company) -> tuple[dict[str, Department], list[Location], list[JobCatalogEntry], list[Position]]:
    dept_names = [
        "Engineering",
        "Product",
        "Sales",
        "Marketing",
        "People Operations",
        "Finance",
        "Customer Success",
        "Operations",
    ]
    departments: dict[str, Department] = {}
    for i, name in enumerate(dept_names):
        d = db.execute(
            select(Department).where(Department.company_id == company.id, func.lower(Department.name) == name.lower())
        ).scalar_one_or_none()
        if not d:
            d = Department(
                id=uuid_str(),
                company_id=company.id,
                name=name,
                parent_id=None,
                head_employee_id=None,
                level=0,
            )
            db.add(d)
            db.flush()
        departments[name] = d

    location_specs = [
        ("Bengaluru HQ", "Outer Ring Road, Bengaluru", "Asia/Kolkata", "IN"),
        ("Mumbai Hub", "BKC, Mumbai", "Asia/Kolkata", "IN"),
        ("Delhi Office", "Gurugram", "Asia/Kolkata", "IN"),
        ("Remote India", "Anywhere", "Asia/Kolkata", "IN"),
    ]
    locations: list[Location] = []
    for name, addr, tz, country in location_specs:
        loc = db.execute(select(Location).where(Location.company_id == company.id, Location.name == name)).scalar_one_or_none()
        if not loc:
            loc = Location(
                id=uuid_str(),
                company_id=company.id,
                name=name,
                address=addr,
                timezone=tz,
                country=country,
            )
            db.add(loc)
            db.flush()
        locations.append(loc)

    job_specs = [
        ("Director", "Leadership", "L7", "L7"),
        ("Engineering Manager", "Engineering", "L6", "L6"),
        ("Senior Software Engineer", "Engineering", "L5", "L5"),
        ("Software Engineer", "Engineering", "L4", "L4"),
        ("Product Manager", "Product", "L5", "L5"),
        ("Sales Manager", "Sales", "L5", "L5"),
        ("Account Executive", "Sales", "L3", "L3"),
        ("Marketing Manager", "Marketing", "L5", "L5"),
        ("HR Manager", "People", "L5", "L5"),
        ("Finance Analyst", "Finance", "L3", "L3"),
        ("Success Manager", "Customer Success", "L4", "L4"),
        ("Ops Specialist", "Operations", "L3", "L3"),
    ]
    jobs: list[JobCatalogEntry] = []
    for title, family, level, grade in job_specs:
        j = db.execute(
            select(JobCatalogEntry).where(JobCatalogEntry.company_id == company.id, JobCatalogEntry.title == title)
        ).scalar_one_or_none()
        if not j:
            j = JobCatalogEntry(
                id=uuid_str(),
                company_id=company.id,
                title=title,
                family=family,
                level=level,
                grade=grade,
                salary_band_json={"currency": "INR", "seeded": True, "tag": SEED_TAG},
            )
            db.add(j)
            db.flush()
        jobs.append(j)

    pos_specs = [
        ("CTO", "Engineering", 1, None),
        ("VP Product", "Product", 1, None),
        ("VP Sales", "Sales", 1, None),
        ("Head of People", "People Operations", 1, None),
        ("Head of Finance", "Finance", 1, None),
        ("Head of CS", "Customer Success", 1, None),
        ("Head of Ops", "Operations", 1, None),
    ]
    positions: list[Position] = []
    by_name: dict[str, Position] = {}
    for name, dept_name, grade, parent_name in pos_specs:
        p = db.execute(
            select(Position).where(Position.company_id == company.id, Position.name == name, Position.department_id == departments[dept_name].id)
        ).scalar_one_or_none()
        if not p:
            p = Position(
                id=uuid_str(),
                company_id=company.id,
                name=name,
                department_id=departments[dept_name].id,
                bucket="none",
                grade=grade,
                reports_to_id=None,
                works_with_id=None,
            )
            db.add(p)
            db.flush()
        by_name[name] = p
        positions.append(p)

    if by_name["VP Product"].reports_to_id is None:
        by_name["VP Product"].reports_to_id = by_name["CTO"].id
    if by_name["VP Sales"].reports_to_id is None:
        by_name["VP Sales"].reports_to_id = by_name["CTO"].id
    if by_name["Head of People"].reports_to_id is None:
        by_name["Head of People"].reports_to_id = by_name["CTO"].id
    if by_name["Head of Finance"].reports_to_id is None:
        by_name["Head of Finance"].reports_to_id = by_name["CTO"].id
    if by_name["Head of CS"].reports_to_id is None:
        by_name["Head of CS"].reports_to_id = by_name["VP Sales"].id
    if by_name["Head of Ops"].reports_to_id is None:
        by_name["Head of Ops"].reports_to_id = by_name["VP Sales"].id

    db.flush()
    return departments, locations, jobs, positions


def _seed_employees(db: Session, ctx: SeedContext, *, count: int) -> list[Employee]:
    random.seed(7)
    first_names = [
        "Aarav", "Vihaan", "Arjun", "Aditya", "Ishaan", "Kavya", "Anaya", "Diya", "Ira", "Meera",
        "Riya", "Nisha", "Rahul", "Rohan", "Dev", "Neha", "Pooja", "Sanya", "Maya", "Aditi",
        "Kunal", "Vikram", "Siddharth", "Nikhil", "Akash", "Priya", "Sneha", "Anita", "Shreya", "Ishita",
    ]
    last_names = [
        "Sharma", "Verma", "Nair", "Iyer", "Reddy", "Singh", "Patel", "Gupta", "Kumar", "Das",
        "Joshi", "Menon", "Kapoor", "Malhotra", "Bose", "Kulkarni", "Mehta", "Chopra", "Saxena", "Mishra",
    ]
    genders = ["female", "male", "female", "male", "non-binary"]
    dept_list = list(ctx.departments.values())
    job_by_title = {j.title: j for j in ctx.jobs}
    pos_list = ctx.positions

    existing = db.execute(
        select(Employee).where(
            Employee.company_id == ctx.company.id,
            Employee.employee_code.like("FOX-%"),
        )
    ).scalars().all()
    if len(existing) >= count:
        return sorted(existing, key=lambda e: e.employee_code)

    employees = sorted(existing, key=lambda e: e.employee_code)
    next_idx = len(employees) + 1
    while len(employees) < count:
        idx = next_idx
        next_idx += 1
        full_name = f"{first_names[idx % len(first_names)]} {last_names[(idx * 3) % len(last_names)]}"
        email = f"fox-emp-{idx:03d}@{EMAIL_DOMAIN}"
        user = _ensure_user(db, email, full_name)
        _ensure_membership(db, user_id=user.id, company_id=ctx.company.id, role="employee")

        dept = dept_list[idx % len(dept_list)]
        location = ctx.locations[idx % len(ctx.locations)]
        pos = pos_list[idx % len(pos_list)]
        if dept.name == "Engineering":
            job = job_by_title["Software Engineer"] if idx % 3 else job_by_title["Senior Software Engineer"]
        elif dept.name == "Product":
            job = job_by_title["Product Manager"]
        elif dept.name == "Sales":
            job = job_by_title["Account Executive"] if idx % 4 else job_by_title["Sales Manager"]
        elif dept.name == "Marketing":
            job = job_by_title["Marketing Manager"]
        elif dept.name == "People Operations":
            job = job_by_title["HR Manager"]
        elif dept.name == "Finance":
            job = job_by_title["Finance Analyst"]
        elif dept.name == "Customer Success":
            job = job_by_title["Success Manager"]
        else:
            job = job_by_title["Ops Specialist"]

        manager = employees[(idx // 3) % len(employees)] if employees else None
        hire_dt = date(2022 + (idx % 4), ((idx % 12) + 1), ((idx * 2) % 27) + 1)
        emp = Employee(
            id=uuid_str(),
            company_id=ctx.company.id,
            user_id=user.id,
            employee_code=f"FOX-{idx:04d}",
            department_id=dept.id,
            job_id=job.id,
            position_id=pos.id,
            manager_id=manager.id if manager else None,
            location_id=location.id,
            status="active" if idx % 17 else "offboarding",
            hire_date=hire_dt.isoformat(),
            personal_info_json={
                "fullName": full_name,
                "personalEmail": email,
                "phone": f"+91-98{idx:08d}"[-13:],
                "gender": genders[idx % len(genders)],
                "seed_tag": SEED_TAG,
            },
            documents_json={},
        )
        db.add(emp)
        db.flush()
        employees.append(emp)
    return employees


def _seed_recruitment(db: Session, ctx: SeedContext) -> None:
    random.seed(11)
    now = datetime.now(tz=UTC)
    candidates: list[User] = []
    for i in range(70):
        c = _ensure_user(db, f"fox-candidate-{i+1:03d}@{EMAIL_DOMAIN}", f"Candidate {i+1:03d}")
        candidates.append(c)

    open_reqs = []
    job_ids = [j.id for j in ctx.jobs]
    dept_ids = [d.id for d in ctx.departments.values()]
    for i in range(8):
        req = Requisition(
            id=uuid_str(),
            company_id=ctx.company.id,
            created_by=ctx.ta_user.id,
            department_id=dept_ids[i % len(dept_ids)],
            job_id=job_ids[i % len(job_ids)],
            req_code=f"F{i+101}",
            headcount=1 + (i % 4),
            status="approved" if i < 6 else "draft",
            hiring_criteria_json={"skills": ["communication", "ownership", "domain"], "seed_tag": SEED_TAG},
        )
        db.add(req)
        db.flush()
        open_reqs.append(req)

    postings: list[JobPosting] = []
    for i, req in enumerate(open_reqs[:6]):
        post = JobPosting(
            id=uuid_str(),
            requisition_id=req.id,
            company_id=ctx.company.id,
            title=f"Fox Role {i+1}",
            description=f"Hiring for {req.req_code}",
            requirements="2+ years experience, strong collaboration",
            deadline=(now + timedelta(days=30 + i * 5)).date().isoformat(),
            status="open" if i < 4 else "closed",
            posted=True,
            posting_ref=f"FOX-JOB-{i+1:03d}",
        )
        db.add(post)
        db.flush()
        postings.append(post)

    stages = ["applied", "screening", "interview", "offer", "hired", "rejected"]
    for i, cand in enumerate(candidates):
        post = postings[i % len(postings)]
        applied_at = now - timedelta(days=(i % 180))
        stage = stages[(i * 2) % len(stages)]
        app = Application(
            id=uuid_str(),
            posting_id=post.id,
            company_id=ctx.company.id,
            candidate_user_id=cand.id,
            resume_url=f"https://example.com/resumes/{cand.id}.pdf",
            status="active" if stage != "rejected" else "closed",
            stage=stage,
            notes=f"Pipeline seed {i+1}",
            applied_at=applied_at,
            updated_at=applied_at + timedelta(days=2),
        )
        db.add(app)
        db.flush()
        if stage in {"interview", "offer", "hired"}:
            db.add(
                Interview(
                    id=uuid_str(),
                    application_id=app.id,
                    company_id=ctx.company.id,
                    scheduled_at=applied_at + timedelta(days=5),
                    panel_json={"members": [ctx.ta_user.email, ctx.hr_user.email], "round": "tech+behavioral"},
                    format="video",
                    feedback_json={"score": 3 + (i % 3), "notes": "Good potential"},
                    status="completed" if stage in {"offer", "hired"} else "scheduled",
                )
            )
        if stage in {"offer", "hired"}:
            sent_at = applied_at + timedelta(days=12)
            status = "accepted" if stage == "hired" else "sent"
            db.add(
                Offer(
                    id=uuid_str(),
                    application_id=app.id,
                    company_id=ctx.company.id,
                    compensation_json={
                        "currency": "INR",
                        "ctc_annual": 850000 + ((i % 6) * 120000),
                        "bonus_pct": 8 + (i % 5),
                        "joining_bonus": (i % 4) * 50000,
                    },
                    start_date=(date.today() + timedelta(days=30 + (i % 60))).isoformat(),
                    status=status,
                    sent_at=sent_at,
                    responded_at=(sent_at + timedelta(days=4)) if status == "accepted" else None,
                )
            )


def _seed_comp_payroll(db: Session, ctx: SeedContext) -> None:
    random.seed(13)
    active_emps = [e for e in ctx.employees if e.status == "active"]
    now = datetime.now(tz=UTC)

    band_codes = ["L2", "L3", "L4", "L5", "L6", "L7"]
    for i, code in enumerate(band_codes):
        if db.execute(
            select(CompensationGradeBand).where(
                CompensationGradeBand.company_id == ctx.company.id,
                CompensationGradeBand.band_code == code,
                CompensationGradeBand.effective_from == "2026-04-01",
            )
        ).scalar_one_or_none():
            continue
        base = 600000 + i * 250000
        db.add(
            CompensationGradeBand(
                id=uuid_str(),
                company_id=ctx.company.id,
                band_code=code,
                display_name=f"Level {code}",
                min_annual=base,
                mid_annual=base + 150000,
                max_annual=base + 350000,
                currency_code="INR",
                effective_from="2026-04-01",
                notes="Seeded band",
            )
        )

    cycle = db.execute(
        select(CompensationReviewCycle).where(
            CompensationReviewCycle.company_id == ctx.company.id,
            CompensationReviewCycle.label == "FY26 Merit Cycle",
        )
    ).scalar_one_or_none()
    if not cycle:
        cycle = CompensationReviewCycle(
            id=uuid_str(),
            company_id=ctx.company.id,
            label="FY26 Merit Cycle",
            fiscal_year="FY26",
            state="open",
            budget_amount=18_000_000,
            budget_currency="INR",
            effective_from_default="2026-04-01",
            notes="Merit + promotion calibration",
        )
        db.add(cycle)
        db.flush()
        for i, code in enumerate(band_codes):
            db.add(
                CompensationReviewGuideline(
                    id=uuid_str(),
                    cycle_id=cycle.id,
                    band_code=code,
                    min_increase_pct=4 + i * 0.5,
                    max_increase_pct=12 + i * 1.0,
                    merit_pool_weight=1.0 + (i * 0.2),
                    notes="Seed guideline",
                )
            )

    for i, e in enumerate(active_emps):
        ctc = 650000 + (i % 10) * 175000 + (i // 10) * 120000
        db.add(
            SalaryStructure(
                id=uuid_str(),
                company_id=ctx.company.id,
                employee_id=e.id,
                components_json={
                    "currency": "INR",
                    "ctc_annual": ctc,
                    "bonus_pct_of_ctc": round(0.06 + (i % 6) * 0.01, 3),
                    "seed_tag": SEED_TAG,
                },
                effective_from="2026-04-01",
            )
        )
        if i < 35:
            proposed = int(ctc * (1 + (0.04 + (i % 8) * 0.01)))
            db.add(
                CompensationReviewProposal(
                    id=uuid_str(),
                    cycle_id=cycle.id,
                    employee_id=e.id,
                    current_ctc_annual=ctc,
                    proposed_ctc_annual=proposed,
                    band_code=band_codes[i % len(band_codes)],
                    justification="Performance + market alignment",
                    status="approved" if i % 6 == 0 else ("submitted" if i % 4 else "draft"),
                    submitted_at=now - timedelta(days=(i % 30)),
                    approved_by_user_id=ctx.comp_user.id if i % 6 == 0 else None,
                    approved_at=(now - timedelta(days=(i % 15))) if i % 6 == 0 else None,
                )
            )

    for mdelta in (1, 0):
        dt = date.today().replace(day=1) - timedelta(days=mdelta * 28)
        run = PayRun(
            id=uuid_str(),
            company_id=ctx.company.id,
            month=dt.month,
            year=dt.year,
            status="processed" if mdelta else "draft",
            processed_by=ctx.comp_user.id if mdelta else None,
            processed_at=(now - timedelta(days=10)) if mdelta else None,
            run_kind="regular",
            pay_date=(dt + timedelta(days=27)).isoformat(),
            run_label=f"{dt.strftime('%b %Y')} Payroll",
        )
        db.add(run)
        db.flush()
        for i, e in enumerate(active_emps[:40]):
            gross = 45000 + (i % 12) * 5500
            deductions = round(gross * (0.12 + (i % 4) * 0.01), 2)
            net = gross - deductions
            db.add(
                PayRunEmployeeLine(
                    id=uuid_str(),
                    company_id=ctx.company.id,
                    pay_run_id=run.id,
                    employee_id=e.id,
                    status="salary_released" if mdelta else ("payslip_generated" if i % 3 else "to_be_processed"),
                )
            )
            db.add(
                Payslip(
                    id=uuid_str(),
                    pay_run_id=run.id,
                    company_id=ctx.company.id,
                    employee_id=e.id,
                    gross=gross,
                    earnings_json={
                        "basic": round(gross * 0.5, 2),
                        "hra": round(gross * 0.22, 2),
                        "special_allowance": round(gross * 0.2, 2),
                        "bonus": round(gross * 0.08, 2),
                    },
                    deductions_json={
                        "pf": round(deductions * 0.5, 2),
                        "tax": round(deductions * 0.4, 2),
                        "professional_tax": round(deductions * 0.1, 2),
                    },
                    net=net,
                    pdf_url=f"https://example.com/payslips/{run.id}/{e.id}.pdf",
                )
            )


def _seed_leave_learning_benefits_surveys(db: Session, ctx: SeedContext) -> None:
    random.seed(17)
    active_emps = [e for e in ctx.employees if e.status == "active"]
    today = date.today()
    year = today.year
    leave_types = ["annual", "sick", "casual", "parental"]

    for t in leave_types:
        db.add(
            LeavePolicy(
                id=uuid_str(),
                company_id=ctx.company.id,
                type=t,
                accrual_rules_json={"days_per_year": 24 if t == "annual" else 12, "seed_tag": SEED_TAG},
                carry_forward_limit=10 if t == "annual" else 3,
                applicable_to_json={"all": True},
            )
        )

    for i, e in enumerate(active_emps):
        for t in leave_types:
            db.add(
                LeaveBalance(
                    id=uuid_str(),
                    company_id=ctx.company.id,
                    employee_id=e.id,
                    type=t,
                    balance=round(4 + (i % 10) * 1.6, 1),
                    year=year,
                )
            )
        if i < 35:
            start = today - timedelta(days=(i % 120) + 3)
            end = start + timedelta(days=(i % 5) + 1)
            status = "approved" if i % 4 else "pending"
            db.add(
                LeaveRequest(
                    id=uuid_str(),
                    company_id=ctx.company.id,
                    employee_id=e.id,
                    type=leave_types[i % len(leave_types)],
                    start_date=start.isoformat(),
                    end_date=end.isoformat(),
                    reason="Personal time / family event",
                    status=status,
                    approved_by=ctx.hr_user.id if status == "approved" else None,
                )
            )

    course_specs = [
        ("Workplace Safety Basics", "Compliance", True),
        ("Data Privacy & Security", "Compliance", True),
        ("Manager Coaching Fundamentals", "Leadership", False),
        ("Customer Obsession Masterclass", "Customer Success", False),
        ("Advanced Python for Product Teams", "Technical", False),
        ("Inclusive Hiring Workshop", "People", False),
    ]
    courses: list[Course] = []
    for title, cat, mandatory in course_specs:
        c = Course(
            id=uuid_str(),
            company_id=ctx.company.id,
            title=title,
            category=cat,
            duration="2-4h",
            prerequisites_json=[],
            content_url=f"https://learning.example.com/{title.lower().replace(' ', '-')}",
            mandatory=mandatory,
            points=50.0 if mandatory else 25.0,
            due_date=(today + timedelta(days=45)).isoformat(),
        )
        db.add(c)
        db.flush()
        courses.append(c)

    for i, e in enumerate(active_emps[:42]):
        c = courses[i % len(courses)]
        assigned_at = datetime.now(tz=UTC) - timedelta(days=(i % 90))
        assignment = TrainingAssignment(
            id=uuid_str(),
            company_id=ctx.company.id,
            employee_id=e.id,
            course_id=c.id,
            assigned_by=ctx.ld_user.id,
            due_date=(today + timedelta(days=10 + (i % 40))).isoformat(),
            status="completed" if i % 3 else "assigned",
            created_at=assigned_at,
        )
        db.add(assignment)
        db.flush()
        if assignment.status == "completed":
            db.add(
                TrainingCompletion(
                    id=uuid_str(),
                    assignment_id=assignment.id,
                    company_id=ctx.company.id,
                    completed_at=assigned_at + timedelta(days=7 + (i % 12)),
                    score=78 + (i % 20),
                    certificate_url=f"https://learning.example.com/cert/{assignment.id}",
                )
            )

    plan_specs = [
        ("Health Insurance Plus", "health"),
        ("Term Life Cover", "life"),
        ("Wellness Reimbursement", "wellness"),
        ("Internet & WFH Allowance", "allowance"),
    ]
    plans: list[BenefitsPlan] = []
    for name, typ in plan_specs:
        p = BenefitsPlan(
            id=uuid_str(),
            company_id=ctx.company.id,
            name=name,
            type=typ,
            details_json={"seed_tag": SEED_TAG, "provider": "Fox Benefits Co."},
            enrollment_period=f"{year}-01-01 to {year}-12-31",
        )
        db.add(p)
        db.flush()
        plans.append(p)

    for i, e in enumerate(active_emps[:45]):
        plan = plans[i % len(plans)]
        db.add(
            BenefitsEnrollment(
                id=uuid_str(),
                plan_id=plan.id,
                company_id=ctx.company.id,
                employee_id=e.id,
                dependents_json={"count": i % 3},
                status="active" if i % 9 else "pending",
                created_at=datetime.now(tz=UTC) - timedelta(days=(i % 120)),
            )
        )

    surveys = []
    survey_specs = [
        ("Quarterly Engagement Pulse", "pulse"),
        ("Manager Effectiveness Survey", "standard"),
    ]
    for i, (title, s_type) in enumerate(survey_specs):
        s = Survey(
            id=uuid_str(),
            company_id=ctx.company.id,
            title=title,
            questions_json=[
                {"id": "q1", "text": "I feel empowered to do my best work.", "type": "rating"},
                {"id": "q2", "text": "What should we improve?", "type": "text"},
            ],
            target_audience_json={"all_employees": True},
            start_date=(today - timedelta(days=40 + i * 30)).isoformat(),
            end_date=(today - timedelta(days=10 + i * 20)).isoformat(),
            status="closed",
            survey_type=s_type,
        )
        db.add(s)
        db.flush()
        surveys.append(s)

    for i, e in enumerate(active_emps[:36]):
        s = surveys[i % len(surveys)]
        db.add(
            SurveyResponse(
                id=uuid_str(),
                survey_id=s.id,
                company_id=ctx.company.id,
                employee_id=e.id,
                answers_json={"q1": 3 + (i % 3), "q2": "More role clarity and better cross-team planning."},
                submitted_at=datetime.now(tz=UTC) - timedelta(days=(i % 21)),
            )
        )

    for i in range(8):
        db.add(
            SurveyActionPlan(
                id=uuid_str(),
                survey_id=surveys[i % len(surveys)].id,
                company_id=ctx.company.id,
                title=f"Survey action item {i+1}",
                description="Follow-up initiative based on feedback trends.",
                assignee_employee_id=active_emps[i].id if i < len(active_emps) else None,
                owner_department_id=active_emps[i].department_id if i < len(active_emps) else None,
                participant_scope="department",
                participant_filter_json={"seed": True},
                due_date=(today + timedelta(days=20 + i * 7)).isoformat(),
                status="open" if i % 3 else "in_progress",
                created_by=ctx.hr_user.id,
            )
        )


def _seed_policy_notification_audit(db: Session, ctx: SeedContext) -> None:
    random.seed(19)
    users = db.execute(
        select(User).join(CompanyMembership, CompanyMembership.user_id == User.id).where(CompanyMembership.company_id == ctx.company.id)
    ).scalars().all()
    active_emps = [e for e in ctx.employees if e.status == "active"]
    today = date.today()

    policies: list[PolicyDocument] = []
    policy_titles = [
        "Code of Conduct 2026",
        "Information Security Policy",
        "Hybrid Work Policy",
        "Leave & Attendance Policy",
        "Compensation Review Policy",
        "Recruitment & Interview Policy",
    ]
    for i, title in enumerate(policy_titles):
        p = PolicyDocument(
            id=uuid_str(),
            company_id=ctx.company.id,
            title=title,
            description=f"{title} (seeded)",
            file_name=title.lower().replace(" ", "_") + ".pdf",
            stored_path=f"/seed/policies/{title.lower().replace(' ', '_')}.pdf",
            created_by=ctx.hr_user.id,
            created_at=datetime.now(tz=UTC) - timedelta(days=90 - i * 5),
        )
        db.add(p)
        db.flush()
        policies.append(p)

    for i, u in enumerate(users[:60]):
        p = policies[i % len(policies)]
        db.add(
            PolicyAcknowledgment(
                id=uuid_str(),
                policy_id=p.id,
                company_id=ctx.company.id,
                user_id=u.id,
                acknowledged_at=datetime.now(tz=UTC) - timedelta(days=(i % 45)),
            )
        )

    for i, u in enumerate(users[:80]):
        db.add(
            Notification(
                id=uuid_str(),
                company_id=ctx.company.id,
                user_id=u.id,
                type="workflow_update" if i % 3 else "action_required",
                title=f"Fox alert {i+1}",
                message="Seeded notification for dashboard and panel testing.",
                entity_type="seed_event",
                entity_id=str(i + 1),
                read=(i % 4 == 0),
                context_json={"seed_tag": SEED_TAG, "priority": "high" if i % 6 == 0 else "normal"},
                created_at=datetime.now(tz=UTC) - timedelta(hours=i * 3),
            )
        )

    for i, u in enumerate(users[:70]):
        db.add(
            InboxTask(
                id=uuid_str(),
                company_id=ctx.company.id,
                user_id=u.id,
                type="approval" if i % 2 else "review",
                title=f"Inbox task {i+1}",
                entity_type="seed_work_item",
                entity_id=str(i + 1),
                priority="high" if i % 5 == 0 else "normal",
                status="open" if i % 4 else "done",
                due_at=datetime.now(tz=UTC) + timedelta(days=(i % 14)),
                context_json={"module": "seed", "seed_tag": SEED_TAG},
                created_at=datetime.now(tz=UTC) - timedelta(days=(i % 30)),
            )
        )

    entity_types = [
        "employee", "salary_structure", "pay_run", "payslip", "requisition", "application",
        "offer", "leave_request", "training_assignment", "policy_document", "survey_response",
    ]
    actions = ["create", "update", "approve", "publish", "complete"]
    for i in range(220):
        actor = users[i % len(users)] if users else None
        db.add(
            AuditTrailEntry(
                id=uuid_str(),
                company_id=ctx.company.id,
                user_id=actor.id if actor else None,
                entity_type=entity_types[i % len(entity_types)],
                entity_id=f"seed-{i+1:04d}",
                action=actions[i % len(actions)],
                changes_json={"seed": True, "idx": i, "note": "Generated by Fox full seed"},
                ip_address=f"10.0.0.{(i % 220) + 1}",
                timestamp=datetime.now(tz=UTC) - timedelta(minutes=i * 15),
            )
        )

    # A few department heads for nicer org metadata
    by_dept: dict[str, list[Employee]] = {}
    for e in active_emps:
        by_dept.setdefault(e.department_id or "", []).append(e)
    for dept in ctx.departments.values():
        members = by_dept.get(dept.id, [])
        if members and not dept.head_employee_id:
            dept.head_employee_id = members[0].id


def seed_fox_inc(*, employees: int = DEFAULT_EMPLOYEES, force: bool = False) -> None:
    # Ensure local SQLite/dev DB has schema before seeding.
    init_db()
    with SessionLocal() as db:
        company = _company_by_name(db, COMPANY_NAME)
        if company and not force:
            existing_seed_emp = db.execute(
                select(func.count()).select_from(Employee).where(
                    Employee.company_id == company.id,
                    Employee.employee_code.like("FOX-%"),
                )
            ).scalar_one()
            if existing_seed_emp >= max(10, employees):
                # Even on no-op runs, ensure the real admin login is linked.
                primary_admin = _ensure_user(db, PRIMARY_ADMIN_EMAIL, "Fox Platform Admin")
                _ensure_membership(db, user_id=primary_admin.id, company_id=company.id, role="company_admin")
                db.commit()
                print(
                    f'Fox Inc already appears seeded ({existing_seed_emp} FOX-* employees found). '
                    "Use --force to rebuild from scratch."
                )
                return
        if company and force:
            db.execute(delete(Company).where(Company.id == company.id))
            db.commit()
            company = None
            print(f'--force: removed existing "{COMPANY_NAME}" company row. Re-seeding fresh.')

        if not company:
            company = Company(
                id=uuid_str(),
                name=COMPANY_NAME,
                industry="Technology",
                location="India (multi-city)",
                config_json={"seed_tag": SEED_TAG, "source": "seed_fox_inc_full"},
            )
            db.add(company)
            db.flush()

        admin, hr, ta, comp, ld = _seed_admin_users(db, company)
        departments, locations, jobs, positions = _seed_org_basics(db, company)
        ctx = SeedContext(
            company=company,
            admin_user=admin,
            hr_user=hr,
            ta_user=ta,
            comp_user=comp,
            ld_user=ld,
            employees=[],
            departments=departments,
            locations=locations,
            jobs=jobs,
            positions=positions,
        )
        ctx.employees = _seed_employees(db, ctx, count=max(10, employees))
        _seed_recruitment(db, ctx)
        _seed_comp_payroll(db, ctx)
        _seed_leave_learning_benefits_surveys(db, ctx)
        _seed_policy_notification_audit(db, ctx)

        db.commit()
        print("Fox Inc comprehensive seed complete.")
        print(f"  Company: {company.name} ({company.id})")
        print(f"  Employees: {len(ctx.employees)} (codes FOX-0001..)")
        print(f"  Password (seed users): {SEED_PASSWORD}")
        print(f"  Seed domain: *@{EMAIL_DOMAIN}")
        print("  Modules: org, recruitment, payroll, increments, leave, learning, benefits, surveys, policies, audits.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed Fox Inc with rich cross-module demo data.")
    ap.add_argument("--employees", type=int, default=DEFAULT_EMPLOYEES, help="Employee count target (default: 50)")
    ap.add_argument("--force", action="store_true", help="Delete existing Fox Inc company before seeding.")
    args = ap.parse_args()
    seed_fox_inc(employees=args.employees, force=args.force)


if __name__ == "__main__":
    main()
