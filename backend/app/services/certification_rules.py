from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.certification import CertProgress, CertTrack
from app.models.tracking import ActivityLog


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
    Enforce requirements_json on CertTrack:
    - min_actions_count: int
    - required_action_keys: list[str] — keys in completed_actions_json that must be truthy / >0
    - max_days: number — from CertProgress.started_at
    - disallow_critical_failures: bool — any activity log with context critical_failure
    """
    if issuer_is_company_admin:
        return

    req = _req(track.requirements_json if isinstance(track.requirements_json, dict) else None)
    min_actions = int(req.get("min_actions_count") or 0)
    max_days = req.get("max_days")
    disallow_crit = req.get("disallow_critical_failures") is True
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

    md = 0.0
    if max_days is not None:
        try:
            md = float(max_days)
        except (TypeError, ValueError):
            md = 0.0

    if md > 0 and prog is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certification progress record required for time-windowed tracks",
        )

    if md > 0 and prog and prog.started_at:
        elapsed_days = (datetime.now(timezone.utc) - prog.started_at).total_seconds() / 86400.0
        if elapsed_days > md:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Certification time window exceeded ({md} days)",
            )

    if disallow_crit:
        crit = db.execute(
            select(ActivityLog).where(
                ActivityLog.company_id == company_id,
                ActivityLog.user_id == target_user_id,
            )
        ).scalars().all()
        for log in crit:
            ctx = log.context_json
            if isinstance(ctx, dict) and ctx.get("critical_failure"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Certification blocked due to critical failure on record",
                )

    if proposed_score < track.min_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum score for this track is {track.min_score}",
        )
