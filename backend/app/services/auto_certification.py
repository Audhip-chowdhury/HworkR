"""Close cohort inbox tasks on matching logs; auto-create pending certificates when eligible."""

from __future__ import annotations

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.certification import CertProgress, Certificate, CertTrack
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog
from app.scoring_rules import (
    CERT_DEFAULT_MIN_SCORE,
    CERT_DEFAULT_MIN_TASKS_PER_MODULE,
    CERT_MIN_SCORE_BY_ROLE,
    CERT_MIN_TASKS_PER_MODULE_BY_ROLE,
    PROGRESS_MODULES,
)
from app.services.cohort_assignment import get_or_create_default_track


def _close_matching_cohort_tasks(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    module: str,
    action_type: str,
) -> None:
    r = db.execute(
        select(InboxTask).where(
            InboxTask.company_id == company_id,
            InboxTask.user_id == user_id,
            InboxTask.type == "cohort_task",
            InboxTask.status == "open",
        )
    )
    for task in r.scalars().all():
        ctx = task.context_json if isinstance(task.context_json, dict) else {}
        if ctx.get("module") != module:
            continue
        want = str(ctx.get("action_type") or "")
        if want == action_type or (
            want == "lifecycle_event" and action_type.startswith("lifecycle_")
        ):
            task.status = "done"
            db.add(task)
            break


def _avg_scores(logs: list[ActivityLog]) -> float | None:
    scores = [float(x.quality_score) for x in logs if x.quality_score is not None]
    return round(sum(scores) / len(scores), 2) if scores else None


def _user_eligible_for_auto_cert(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    role: str,
    track: CertTrack,
    logs: list[ActivityLog],
) -> tuple[bool, float | None, dict[str, int]]:
    """Returns (eligible, overall_score, tasks_by_module_for_breakdown)."""
    min_tasks = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role, CERT_DEFAULT_MIN_TASKS_PER_MODULE)
    req_json = track.requirements_json if isinstance(track.requirements_json, dict) else {}
    if isinstance(req_json.get("min_tasks_per_module"), dict):
        min_tasks = {str(k): int(v) for k, v in req_json["min_tasks_per_module"].items() if int(v) > 0}

    scoped = [x for x in logs if x.module in PROGRESS_MODULES]
    by_mod = Counter(x.module for x in scoped)
    for mod, need in min_tasks.items():
        if by_mod.get(mod, 0) < int(need):
            return False, _avg_scores(scoped), dict(by_mod)

    role_min = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    effective_min = max(float(role_min), float(track.min_score))
    overall = _avg_scores(scoped)
    if overall is None or overall < effective_min:
        return False, overall, dict(by_mod)

    if req_json.get("disallow_critical_failures", True):
        for x in logs:
            cj = x.context_json
            if isinstance(cj, dict) and cj.get("critical_failure"):
                return False, overall, dict(by_mod)

    return True, overall, dict(by_mod)


def check_and_auto_issue(db: Session, company_id: str, user_id: str) -> Certificate | None:
    """
    After a tracked HR action: close matching cohort tasks, then create a pending certificate if eligible.
    Caller commits the session.
    """
    membership = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    if membership is None:
        return None
    role = membership.role

    # Re-fetch last log row for this user to close tasks (caller already added row; may be flushed)
    last = db.execute(
        select(ActivityLog)
        .where(ActivityLog.company_id == company_id, ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if last:
        _close_matching_cohort_tasks(
            db, company_id=company_id, user_id=user_id, module=last.module, action_type=last.action_type
        )

    if role not in CERT_MIN_TASKS_PER_MODULE_BY_ROLE:
        return None

    track = get_or_create_default_track(db, company_id, role)

    existing = db.execute(
        select(Certificate).where(
            Certificate.company_id == company_id,
            Certificate.user_id == user_id,
            Certificate.track_id == track.id,
        )
    ).scalar_one_or_none()
    if existing:
        return None

    logs = db.execute(
        select(ActivityLog)
        .where(ActivityLog.company_id == company_id, ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(8000)
    ).scalars().all()

    ok, overall, by_mod = _user_eligible_for_auto_cert(
        db, company_id=company_id, user_id=user_id, role=role, track=track, logs=list(logs)
    )
    if not ok or overall is None:
        return None

    prog = db.execute(
        select(CertProgress).where(
            CertProgress.company_id == company_id,
            CertProgress.user_id == user_id,
            CertProgress.track_id == track.id,
        )
    ).scalar_one_or_none()

    cert = Certificate(
        id=uuid_str(),
        track_id=track.id,
        company_id=company_id,
        user_id=user_id,
        level=track.level,
        score=float(overall),
        breakdown_json={
            "overall": overall,
            "tasks_by_module": by_mod,
            "role": role,
            "auto_issued": True,
        },
        verification_id=uuid.uuid4().hex,
        approval_status="pending_approval",
    )
    db.add(cert)
    if prog:
        prog.status = "pending_approval"
        prog.current_score = float(overall)
        db.add(prog)
    return cert
