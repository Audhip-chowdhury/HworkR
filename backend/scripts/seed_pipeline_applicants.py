#!/usr/bin/env python3
"""
Seed 7 job applications (one per pipeline stage) so Recruitment → Pipeline has data.

Creates a requisition + open job posting if the company has none, then inserts candidate users
and applications. Safe to re-run: uses a fresh email suffix each run (like seed_applications_demo).

Run from `backend`:

    python scripts/seed_pipeline_applicants.py
    python scripts/seed_pipeline_applicants.py <company_id>
    python scripts/seed_pipeline_applicants.py --company-name "Demo org tree (seed)"

Optional: --init-db
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.database import SessionLocal, init_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.membership import CompanyMembership
from app.models.recruitment import Application, JobPosting, Requisition
from app.services.requisition_codes import allocate_req_code
from app.models.user import User

STAGES = [
    "applied",
    "screened",
    "phone_screen",
    "interview",
    "assessment",
    "offer",
    "hired",
]


def _pick_created_by(session: Session, company_id: str) -> str:
    for role in ("company_admin", "talent_acquisition", "hr_ops", "employee"):
        m = session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.role == role,
                CompanyMembership.status == "active",
            ).limit(1)
        ).scalar_one_or_none()
        if m is not None:
            return m.user_id
    raise SystemExit(f"No active company membership found for company_id={company_id!r}")


def _ensure_open_posting(session: Session, company_id: str) -> JobPosting:
    postings = list(
        session.execute(
            select(JobPosting).where(JobPosting.company_id == company_id, JobPosting.status == "open")
        )
        .scalars()
        .all()
    )
    if postings:
        return postings[0]

    created_by = _pick_created_by(session, company_id)
    req = Requisition(
        id=uuid_str(),
        company_id=company_id,
        created_by=created_by,
        req_code=allocate_req_code(session),
        headcount=5,
        status="draft",
    )
    session.add(req)
    session.flush()
    posting = JobPosting(
        id=uuid_str(),
        requisition_id=req.id,
        company_id=company_id,
        title="Engineering hire (pipeline seed)",
        description="Seeded requisition for ATS pipeline demo.",
        requirements="See internal job description.",
        status="open",
    )
    session.add(posting)
    session.flush()
    print(f"Created requisition {req.id} and open posting {posting.id!r} ({posting.title!r}).")
    return posting


def _resolve_company(session: Session, company_id: str | None, company_name: str | None) -> Company:
    if company_id and company_id.strip():
        c = session.execute(select(Company).where(Company.id == company_id.strip())).scalar_one_or_none()
        if c is None:
            raise SystemExit(f"No company with id={company_id!r}")
        return c
    name = (company_name or "Demo org tree (seed)").strip()
    c = session.execute(select(Company).where(Company.name == name)).scalar_one_or_none()
    if c is None:
        raise SystemExit(
            f"No company named {name!r}. Pass a company UUID, or create the demo org: "
            "python scripts/seed_demo_org_tree.py"
        )
    return c


def seed(session: Session, company_id: str) -> None:
    posting = _ensure_open_posting(session, company_id)

    suffix = uuid_str()[:8]
    candidates: list[User] = []
    for i in range(len(STAGES)):
        u = User(
            id=uuid_str(),
            email=f"pipeline-seed-{suffix}-{i + 1}@example.com",
            password_hash=get_password_hash("demo123"),
            name=f"Pipeline Demo Candidate {i + 1}",
            is_platform_admin=False,
        )
        session.add(u)
        candidates.append(u)

    session.flush()

    for i, stage in enumerate(STAGES):
        session.add(
            Application(
                id=uuid_str(),
                posting_id=posting.id,
                company_id=company_id,
                candidate_user_id=candidates[i].id,
                resume_url=None,
                status="active",
                stage=stage,
                notes=f"Seeded — stage {stage}",
            )
        )

    session.commit()
    print(f"Inserted {len(STAGES)} applications for company {company_id}.")
    print(f"Posting: {posting.title!r} ({posting.id})")
    print("Candidate logins (password: demo123):")
    for u in candidates:
        print(f"  {u.email}")


def main() -> None:
    p = argparse.ArgumentParser(description="Seed pipeline applicants (7 rows, one per stage).")
    p.add_argument(
        "company_id",
        nargs="?",
        default=None,
        help="Company UUID (optional if --company-name matches)",
    )
    p.add_argument(
        "--company-name",
        default="Demo org tree (seed)",
        help="Company name to look up if company_id is omitted (default: Demo org tree (seed))",
    )
    p.add_argument("--init-db", action="store_true", help="Run init_db() first")
    args = p.parse_args()

    if args.init_db:
        init_db()

    db = SessionLocal()
    try:
        company = _resolve_company(db, args.company_id, args.company_name)
        print(f"Company: {company.name!r} ({company.id})")
        seed(db, company.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()
