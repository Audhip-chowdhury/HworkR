from __future__ import annotations

from collections import Counter
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.certification import CertProgress, CertTrack
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog
from app.scoring_rules import (
    CERT_DEFAULT_MIN_SCORE,
    CERT_DEFAULT_MIN_TASKS_PER_MODULE,
    CERT_MIN_SCORE_BY_ROLE,
    CERT_MIN_TASKS_PER_MODULE_BY_ROLE,
    PROGRESS_MODULES,
)


def _req(req_json: dict[str, Any] | None) -> dict[str, Any]:
    return req_json or {}


def validate_certificate_issuance(
    db: Session,
    *,
    company_id: str,
    track: CertTrack,
    target_user_id: str,
    proposed_score: float,
    issuer_is_company_admin: bool,
) -> None:
    """
    Enforce requirements_json on CertTrack (and role-based defaults):
    - min_tasks_per_module: dict module -> min count (ActivityLog rows)
    - min_actions_count / required_action_keys: legacy CertProgress.completed_actions_json
    - disallow_critical_failures: any activity log with context critical_failure
    - min_score on track (and role default floor for non-admin)
    """
    if issuer_is_company_admin:
        return

    membership = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == target_user_id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    role = membership.role if membership else "employee"

    req = _req(track.requirements_json if isinstance(track.requirements_json, dict) else None)
    min_tasks = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role, CERT_DEFAULT_MIN_TASKS_PER_MODULE)
    if isinstance(req.get("min_tasks_per_module"), dict):
        min_tasks = {str(k): int(v) for k, v in req["min_tasks_per_module"].items() if int(v) > 0}

    logs = db.execute(
        select(ActivityLog).where(
            ActivityLog.company_id == company_id,
            ActivityLog.user_id == target_user_id,
        )
    ).scalars().all()
    by_mod = Counter(x.module for x in logs if x.module in PROGRESS_MODULES)
    for mod, need in min_tasks.items():
        if by_mod.get(mod, 0) < int(need):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Module '{mod}' requires at least {need} scored tasks (have {by_mod.get(mod, 0)})",
            )

    role_min = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    effective_min = max(float(role_min), float(track.min_score))
    if proposed_score < effective_min:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum score for this track is {effective_min:.1f}",
        )

    min_actions = int(req.get("min_actions_count") or 0)
    required_keys = req.get("required_action_keys") or []

    prog = db.execute(
        select(CertProgress).where(
            CertProgress.company_id == company_id,
            CertProgress.user_id == target_user_id,
            CertProgress.track_id == track.id,
        )
    ).scalar_one_or_none()

    completed = prog.completed_actions_json if prog and isinstance(prog.completed_actions_json, dict) else {}
    action_count = 0
    for _k, v in completed.items():
        if isinstance(v, bool) and v:
            action_count += 1
        elif isinstance(v, (int, float)) and v > 0:
            action_count += 1
        elif v not in (None, False, 0, ""):
            action_count += 1

    if min_actions and action_count < min_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Certification requires at least {min_actions} completed actions (have {action_count})",
        )

    for key in required_keys:
        if key not in completed or not completed.get(key):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required completed action: {key}",
            )

    if req.get("disallow_critical_failures", True):
        for log in logs:
            ctx = log.context_json
            if isinstance(ctx, dict) and ctx.get("critical_failure"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Certification blocked due to critical failure on record",
                )
