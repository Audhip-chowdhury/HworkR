from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog, ScoringRule
from app.models.user import User
from app.schemas.tracking import (
    ActivityLogCreate,
    ActivityLogOut,
    ScoreDashboardOut,
    ScoringRuleCreate,
    ScoringRuleOut,
)
from app.services.activity_log import log_activity
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit

router = APIRouter(prefix="/companies/{company_id}/tracking", tags=["tracking"])

_ADMIN_TA = frozenset({"company_admin", "talent_acquisition", "hr_ops", "ld_performance", "compensation_analytics"})


@router.post("/activity-logs", response_model=ActivityLogOut, status_code=status.HTTP_201_CREATED)
def create_activity_log(
    company_id: str,
    body: ActivityLogCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> ActivityLog:
    user, membership = ctx
    if body.reference_started_at is not None:
        row = log_tracked_hr_action(
            db,
            company_id=company_id,
            user_id=user.id,
            role=membership.role,
            module=body.module,
            action_type=body.action_type,
            action_detail=body.action_detail,
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            reference_started_at=body.reference_started_at,
            quality_factors=body.quality_factors,
            extra_context=body.context_json,
            session_id=body.session_id,
        )
    else:
        row = log_activity(
            db,
            company_id=company_id,
            user_id=user.id,
            role=membership.role,
            module=body.module,
            action_type=body.action_type,
            action_detail=body.action_detail,
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            quality_factors=body.quality_factors,
            context_json=body.context_json,
            session_id=body.session_id,
        )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="activity_log",
        entity_id=row.id,
        action="create",
        changes_json={"module": body.module},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/activity-logs", response_model=list[ActivityLogOut])
def list_activity_logs(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    user_id: str | None = Query(default=None),
    module: str | None = None,
    limit: int = Query(default=100, le=500),
) -> list[ActivityLog]:
    _, membership = ctx
    q = select(ActivityLog).where(ActivityLog.company_id == company_id)
    if membership.role not in _ADMIN_TA and membership.role != "company_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR-related role required to list logs")
    if user_id:
        q = q.where(ActivityLog.user_id == user_id)
    if module:
        q = q.where(ActivityLog.module == module)
    q = q.order_by(ActivityLog.created_at.desc()).limit(limit)
    return list(db.execute(q).scalars().all())


@router.get("/dashboard/score", response_model=ScoreDashboardOut)
def my_score_dashboard(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> ScoreDashboardOut:
    user, _ = ctx
    logs = db.execute(
        select(ActivityLog).where(ActivityLog.company_id == company_id, ActivityLog.user_id == user.id)
    ).scalars().all()
    if not logs:
        return ScoreDashboardOut(
            overall_score=None,
            avg_completeness=None,
            avg_accuracy=None,
            avg_timeliness=None,
            avg_process_adherence=None,
            action_count=0,
        )
    scores = [x.quality_score for x in logs if x.quality_score is not None]
    overall = sum(scores) / len(scores) if scores else None

    def _avg_dim(key: str) -> float | None:
        vals: list[float] = []
        for x in logs:
            if x.quality_factors_json and key in x.quality_factors_json:
                try:
                    vals.append(float(x.quality_factors_json[key]))
                except (TypeError, ValueError):
                    continue
        return round(sum(vals) / len(vals), 2) if vals else None

    return ScoreDashboardOut(
        overall_score=round(overall, 2) if overall is not None else None,
        avg_completeness=_avg_dim("completeness"),
        avg_accuracy=_avg_dim("accuracy"),
        avg_timeliness=_avg_dim("timeliness"),
        avg_process_adherence=_avg_dim("process_adherence"),
        action_count=len(logs),
    )


@router.get("/dashboard/recent-activity", response_model=list[ActivityLogOut])
def my_recent_activity(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, le=100),
) -> list[ActivityLog]:
    user, _ = ctx
    q = (
        select(ActivityLog)
        .where(ActivityLog.company_id == company_id, ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return list(db.execute(q).scalars().all())


@router.post("/scoring-rules", response_model=ScoringRuleOut, status_code=status.HTTP_201_CREATED)
def create_scoring_rule(
    company_id: str,
    body: ScoringRuleCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> ScoringRule:
    user, _ = ctx
    row = ScoringRule(
        id=uuid_str(),
        company_id=company_id,
        module=body.module.strip(),
        action_type=body.action_type.strip(),
        sla_seconds=body.sla_seconds,
        weight_completeness=body.weight_completeness,
        weight_accuracy=body.weight_accuracy,
        weight_timeliness=body.weight_timeliness,
        weight_process=body.weight_process,
        criteria_json=body.criteria_json,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="scoring_rule", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/scoring-rules", response_model=list[ScoringRuleOut])
def list_scoring_rules(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ScoringRule]:
    r = db.execute(select(ScoringRule).where(ScoringRule.company_id == company_id).order_by(ScoringRule.module))
    return list(r.scalars().all())
