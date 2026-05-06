from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.scoring_rules import (
    DEFAULT_QUALITY_FACTORS,
    SLA_NO_REFERENCE_TIMELINESS,
    SLA_SECONDS_BY_ACTION,
)
from app.services.activity_log import coerce_utc, log_activity


def log_tracked_hr_action(
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
    reference_started_at: datetime | None = None,
    quality_factors: dict[str, Any] | None = None,
    critical_failure: bool = False,
    extra_context: dict[str, Any] | None = None,
    session_id: str | None = None,
) -> Any:
    """
    Apply configured defaults/SLA, then persist ActivityLog (caller commits).
    """
    factors: dict[str, Any] = dict(DEFAULT_QUALITY_FACTORS)
    if quality_factors:
        factors.update({k: float(v) for k, v in quality_factors.items() if v is not None})

    sla_seconds = (SLA_SECONDS_BY_ACTION.get(module, {}) or {}).get(action_type)
    now = datetime.now(timezone.utc)
    if sla_seconds and reference_started_at is not None:
        elapsed = max(0.0, (now - coerce_utc(reference_started_at)).total_seconds())
        ratio = min(1.0, elapsed / float(sla_seconds))
        factors["timeliness"] = max(0.0, 100.0 - ratio * 100.0)
    elif sla_seconds:
        factors["timeliness"] = SLA_NO_REFERENCE_TIMELINESS

    ctx: dict[str, Any] = dict(extra_context or {})
    if critical_failure:
        ctx["critical_failure"] = True

    return log_activity(
        db,
        company_id=company_id,
        user_id=user_id,
        role=role,
        module=module,
        action_type=action_type,
        action_detail=action_detail,
        entity_type=entity_type,
        entity_id=entity_id,
        quality_factors=factors,
        context_json=ctx or None,
        session_id=session_id,
        started_at=reference_started_at,
        completed_at=now,
    )
