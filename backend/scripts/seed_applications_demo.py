#!/usr/bin/env python3
"""
Insert 7 demo rows into `applications` (one per pipeline stage), with new candidate users.

Requires at least one `job_postings` row for the company (create a posting in the UI first).

Run from the `backend` folder:

    python scripts/seed_applications_demo.py <company_id>

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
from app.models.recruitment import Application, JobPosting
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


def seed(session: Session, company_id: str) -> None:
    if session.execute(select(Company).where(Company.id == company_id)).scalar_one_or_none() is None:
        raise SystemExit(f"No company found with id={company_id!r}")

    postings = list(
        session.execute(
            select(JobPosting).where(JobPosting.company_id == company_id).order_by(JobPosting.created_at.desc())
        )
        .scalars()
        .all()
    )
    if not postings:
        raise SystemExit(
            "No job postings for this company. Create at least one job posting (Recruitment → Job postings) first."
        )

    suffix = uuid_str()[:8]
    candidates: list[User] = []
    for i in range(len(STAGES)):
        u = User(
            id=uuid_str(),
            email=f"demo-candidate-{suffix}-{i + 1}@example.com",
            password_hash=get_password_hash("demo123"),
            name=f"Demo Candidate {i + 1}",
            is_platform_admin=False,
        )
        session.add(u)
        candidates.append(u)

    session.flush()

    for i, stage in enumerate(STAGES):
        posting = postings[i % len(postings)]
        session.add(
            Application(
                id=uuid_str(),
                posting_id=posting.id,
                company_id=company_id,
                candidate_user_id=candidates[i].id,
                resume_url=None,
                status="active",
                stage=stage,
                notes=f"Seeded row — stage {stage}",
            )
        )

    session.commit()
    print(f"Inserted {len(STAGES)} applications for company {company_id}.")
    print("Candidate logins (password: demo123):")
    for u in candidates:
        print(f"  {u.email}")


def main() -> None:
    p = argparse.ArgumentParser(description="Seed demo applications (7 rows, varied stages).")
    p.add_argument("company_id", help="UUID of the company")
    p.add_argument("--init-db", action="store_true", help="Run init_db() first")
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
