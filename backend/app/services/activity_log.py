from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.tracking import ActivityLog
from app.services.scoring import composite_score


def coerce_utc(dt: datetime) -> datetime:
    """Make datetimes UTC-aware for arithmetic and storage. Naive values are treated as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def log_activity(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    role: str | None,
    module: str,
    action_type: str,
    action_detail: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    quality_factors: dict[str, Any] | None = None,
    context_json: dict[str, Any] | None = None,
    session_id: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    duration_seconds: int | None = None,
) -> ActivityLog:
    now = datetime.now(timezone.utc)
    start = coerce_utc(started_at) if started_at else now
    end = coerce_utc(completed_at) if completed_at else now
    dur = duration_seconds
    if dur is None and started_at and completed_at:
        dur = int((coerce_utc(completed_at) - coerce_utc(started_at)).total_seconds())

    qf = quality_factors or {}
    quality_score = composite_score(qf) if qf else None

    row = ActivityLog(
        id=uuid_str(),
        company_id=company_id,
        user_id=user_id,
        role=role,
        module=module,
        action_type=action_type,
        action_detail=action_detail,
        entity_type=entity_type,
        entity_id=entity_id,
        started_at=start,
        completed_at=end,
        duration_seconds=dur,
        quality_score=quality_score,
        quality_factors_json=qf if qf else None,
        context_json=context_json,
        session_id=session_id,
    )
    db.add(row)
    return row
