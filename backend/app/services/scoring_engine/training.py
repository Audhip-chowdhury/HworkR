"""T-DUE-OWN-01 — mandatory training follow-up nudge (assigner)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.models.performance_learning import Course, TrainingAssignment
from app.services.scoring_engine.core import factors_at


def _parse_iso(s: str | None) -> date | None:
    if not s or not str(s).strip():
        return None
    raw = str(s).strip()[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def training_completion_factors(
    ta: TrainingAssignment,
    course: Course | None,
    completed_at: datetime,
) -> dict[str, float]:
    """
    Employee completion log: lower timeliness if they completed *after* the due date
    (assignment or course), for mandatory courses in particular.
    """
    if not course or not bool(course.mandatory):
        return factors_at(100.0, 100.0, 100.0, 100.0)
    due = _parse_iso(ta.due_date) or _parse_iso(getattr(course, "due_date", None) or None)
    if due is None:
        return factors_at(100.0, 100.0, 100.0, 100.0)
    done = completed_at.astimezone(timezone.utc).date() if completed_at.tzinfo else completed_at.date()
    if done > due:
        return factors_at(
            completeness=88.0,
            accuracy=92.0,
            timeliness=62.0,
            process_adherence=90.0,
        )
    return factors_at(
        completeness=100.0,
        accuracy=95.0,
        timeliness=92.0,
        process_adherence=94.0,
    )


def training_assigner_late_mandatory_nudge(
    ta: TrainingAssignment,
    course: Course | None,
    completed_at: datetime,
) -> bool:
    """
    If True, also log a nudge for `ta.assigned_by` (late mandatory training finally completed).
    """
    if not course or not bool(course.mandatory) or not ta.assigned_by:
        return False
    due = _parse_iso(ta.due_date) or _parse_iso(getattr(course, "due_date", None) or None)
    if due is None:
        return False
    done = completed_at.astimezone(timezone.utc).date() if completed_at.tzinfo else completed_at.date()
    return done > due


def training_assigner_quality_factors() -> dict[str, float]:
    return factors_at(
        completeness=100.0,
        accuracy=88.0,
        timeliness=55.0,
        process_adherence=72.0,
    )
