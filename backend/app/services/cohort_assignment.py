"""Rolling cohort enrollment: default cert track + randomized inbox tasks per role."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.certification import CertProgress, Certificate, CertTrack
from app.models.inbox import InboxTask
from app.scoring_rules import (
    CERT_MIN_SCORE_BY_ROLE,
    CERT_MIN_TASKS_PER_MODULE_BY_ROLE,
    CERT_DEFAULT_MIN_SCORE,
)
from app.services.cohort_task_catalog import build_week_tasks_for_role


def _default_track_name(role: str) -> str:
    return f"Week-one certification — {role.replace('_', ' ').title()}"


def get_or_create_default_track(db: Session, company_id: str, role: str) -> CertTrack:
    r = db.execute(
        select(CertTrack).where(
            CertTrack.company_id == company_id,
            CertTrack.role_type == role,
        ).order_by(CertTrack.created_at.desc())
    )
    existing = r.scalars().first()
    if existing:
        return existing

    min_score = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    reqs = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role)
    if not reqs:
        reqs = CERT_MIN_TASKS_PER_MODULE_BY_ROLE["employee"]
    row = CertTrack(
        id=uuid_str(),
        company_id=company_id,
        role_type=role,
        level="foundation",
        name=_default_track_name(role),
        requirements_json={
            "min_tasks_per_module": dict(reqs),
            "disallow_critical_failures": True,
        },
        min_score=min_score,
    )
    db.add(row)
    db.flush()
    return row


def clear_cohort_enrollment_for_user(db: Session, company_id: str, user_id: str) -> None:
    """Remove cohort inbox tasks, cert progress, and pending certificates for a user (e.g. role change)."""
    db.execute(
        delete(InboxTask).where(
            InboxTask.company_id == company_id,
            InboxTask.user_id == user_id,
            InboxTask.type == "cohort_task",
        )
    )
    db.execute(delete(CertProgress).where(CertProgress.company_id == company_id, CertProgress.user_id == user_id))
    db.execute(
        delete(Certificate).where(
            Certificate.company_id == company_id,
            Certificate.user_id == user_id,
            Certificate.approval_status == "pending_approval",
        )
    )


def _already_enrolled(db: Session, company_id: str, user_id: str) -> bool:
    r = db.execute(
        select(InboxTask.id).where(
            InboxTask.company_id == company_id,
            InboxTask.user_id == user_id,
            InboxTask.type == "cohort_task",
        )
    )
    return r.scalar_one_or_none() is not None


def reenroll_member_after_role_change(db: Session, company_id: str, user_id: str, new_role: str) -> None:
    clear_cohort_enrollment_for_user(db, company_id, user_id)
    db.flush()
    enroll_member_in_cohort(db, company_id, user_id, new_role)


def enroll_member_in_cohort(db: Session, company_id: str, user_id: str, role: str) -> None:
    """
    Idempotent: creates default CertTrack, CertProgress, and cohort InboxTasks when a member joins.
    """
    if role not in CERT_MIN_TASKS_PER_MODULE_BY_ROLE:
        return  # no automated cohort for unknown roles
    if _already_enrolled(db, company_id, user_id):
        return

    track = get_or_create_default_track(db, company_id, role)

    prog = db.execute(
        select(CertProgress).where(
            CertProgress.company_id == company_id,
            CertProgress.user_id == user_id,
            CertProgress.track_id == track.id,
        )
    ).scalar_one_or_none()
    if prog is None:
        prog = CertProgress(
            id=uuid_str(),
            track_id=track.id,
            company_id=company_id,
            user_id=user_id,
            completed_actions_json={},
            current_score=None,
            status="in_progress",
        )
        db.add(prog)
        db.flush()

    for tpl, day in build_week_tasks_for_role(company_id=company_id, user_id=user_id, role=role):
        deeplink = f"/company/{company_id}/{tpl.deeplink_suffix}"
        task = InboxTask(
            id=uuid_str(),
            company_id=company_id,
            user_id=user_id,
            type="cohort_task",
            title=tpl.title,
            entity_type="cohort",
            entity_id=None,
            priority="normal",
            status="open",
            due_at=None,
            context_json={
                "module": tpl.module,
                "action_type": tpl.action_type,
                "role": role,
                "cohort_day": day,
                "deeplink": deeplink,
                "variant": f"{tpl.module}:{tpl.action_type}",
            },
        )
        db.add(task)
