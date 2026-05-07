#!/usr/bin/env python3
"""
Fox Inc — seed a NEW compensation_analytics member and optionally simulate tracked actions
toward automated certification (cohort + eligibility + pending certificate).

Usage (from backend/):
  python3 scripts/seed_fox_comp_cert_demo.py                    # stops 1 employee action BEFORE auto-issue
  python3 scripts/seed_fox_comp_cert_demo.py --issue-pending  # completes logs → pending certificate + URLs
  python3 scripts/seed_fox_comp_cert_demo.py --approve        # issue + mark approved (PDF/HTML final)

Requires Fox Inc (run scripts/seed_fox_inc_full.py first if missing).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.core.security import get_password_hash
from app.database import SessionLocal, init_db
from app.models.base import uuid_str
from app.models.certification import Certificate, CertProgress
from app.models.company import Company
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.user import User
from app.services.activity_tracking import log_tracked_hr_action
from app.services.cohort_assignment import enroll_member_in_cohort

COMPANY_NAME = "Fox Inc"
EMAIL_DOMAIN = "fox-seed.example.com"
DEMO_EMAIL = f"fox-comp-cert-demo@{EMAIL_DOMAIN}"
PASSWORD = "FoxIncDemo2026!"
NAME = "Fox Comp Cert Preview"

QF = {"completeness": 94.0, "accuracy": 94.0, "timeliness": 92.0, "process_adherence": 93.0}


def _company_by_name(db: Session, name: str) -> Company | None:
    return db.execute(select(Company).where(func.lower(Company.name) == name.lower())).scalar_one_or_none()


def _ensure_demo_user(db: Session) -> User:
    u = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
    if u:
        return u
    u = User(
        id=uuid_str(),
        email=DEMO_EMAIL,
        name=NAME,
        password_hash=get_password_hash(PASSWORD),
        is_platform_admin=False,
    )
    db.add(u)
    db.flush()
    return u


def _ensure_membership_comp(db: Session, *, user_id: str, company_id: str) -> None:
    row = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user_id,
            CompanyMembership.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row:
        row.role = "compensation_analytics"
        row.status = "active"
        return
    db.add(
        CompanyMembership(
            id=uuid_str(),
            user_id=user_id,
            company_id=company_id,
            role="compensation_analytics",
            status="active",
            modules_access_json=None,
        )
    )


def _log_comp_demo(db: Session, company_id: str, user_id: str, idx: int) -> None:
    actions = (
        ("compensation", "grade_band_create", "seed_grade_band_demo"),
        ("compensation", "salary_structure_create", "seed_salary_demo"),
        ("compensation", "review_cycle_create", "seed_cycle_demo"),
        ("compensation", "proposal_create", "seed_proposal_demo"),
        ("employees", "create", "seed_employee_demo"),
        ("employees", "update", "seed_employee_update_demo"),
    )
    mod, typ, detail = actions[idx]
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user_id,
        role="compensation_analytics",
        module=mod,
        action_type=typ,
        action_detail=detail,
        entity_type="seed",
        entity_id=uuid_str(),
        quality_factors=QF,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Fox Inc comp cert demo user + simulated logs")
    ap.add_argument(
        "--issue-pending",
        action="store_true",
        help="Log all 6 actions so auto-issue creates certificate (pending approval)",
    )
    ap.add_argument(
        "--approve",
        action="store_true",
        help="After pending cert exists, set approved (for PDF preview without admin UI)",
    )
    args = ap.parse_args()

    init_db()
    num_logs = 6 if (args.issue_pending or args.approve) else 5
    co_id = ""
    vid: str | None = None
    status: str | None = None

    with SessionLocal() as db:
        co = _company_by_name(db, COMPANY_NAME)
        if co is None:
            sys.exit(f"No company named {COMPANY_NAME!r}; run scripts/seed_fox_inc_full.py first.")
        co_id = co.id

        u = _ensure_demo_user(db)
        db.commit()

        _ensure_membership_comp(db, user_id=u.id, company_id=co.id)
        db.flush()

        db.execute(delete(Certificate).where(Certificate.company_id == co.id, Certificate.user_id == u.id))
        db.execute(delete(CertProgress).where(CertProgress.company_id == co.id, CertProgress.user_id == u.id))
        db.execute(
            delete(InboxTask).where(
                InboxTask.company_id == co.id,
                InboxTask.user_id == u.id,
                InboxTask.type == "cohort_task",
            )
        )
        db.flush()

        enroll_member_in_cohort(db, co.id, u.id, "compensation_analytics")
        db.commit()

        for i in range(num_logs):
            _log_comp_demo(db, co.id, u.id, i)
            db.commit()

        if args.approve:
            pend = db.execute(
                select(Certificate).where(
                    Certificate.company_id == co.id,
                    Certificate.user_id == u.id,
                    Certificate.approval_status == "pending_approval",
                )
            ).scalar_one_or_none()
            if pend:
                pend.approval_status = "approved"
                db.add(pend)
                prog = db.execute(
                    select(CertProgress).where(
                        CertProgress.track_id == pend.track_id,
                        CertProgress.company_id == co.id,
                        CertProgress.user_id == u.id,
                    )
                ).scalar_one_or_none()
                if prog:
                    prog.status = "completed"
                    db.add(prog)
                db.commit()

        certs = db.execute(
            select(Certificate).where(Certificate.company_id == co.id, Certificate.user_id == u.id)
        ).scalars().all()
        if certs:
            vid = certs[0].verification_id
            status = certs[0].approval_status

    print("")
    print("=== Fox Inc — compensation certification demo ===")
    print(f"Company id:       {co_id}")
    print(f"Login email:      {DEMO_EMAIL}")
    print(f"Login password:   {PASSWORD}")
    print(f"My week UI:       /company/{co_id}/cohort")
    print(f"Progress UI:      /company/{co_id}/progress")
    print("")
    if num_logs == 5:
        print("Stopped after 5 tracked actions (4 compensation + 1 employees:create).")
        print("One more employees:update triggers auto-certificate. Do it in the app or re-run with --issue-pending.")
    else:
        if vid:
            print(f"verification_id:  {vid}")
            print(f"Certificate:      {status}")
            print(f"Public verify UI: http://localhost:5173/verify/{vid}")
            print(f"Public HTML:      /api/v1/certificates/verify/{vid}/page")
            if status == "approved":
                print(f"Public PDF:       /api/v1/certificates/verify/{vid}/pdf")
            else:
                print(f"Approve as company_admin at /company/{co_id}/certification/approvals — then PDF unlocks.")
        else:
            print("No certificate row — check eligibility (score / module counts / critical failures).")
    print("")


if __name__ == "__main__":
    main()
