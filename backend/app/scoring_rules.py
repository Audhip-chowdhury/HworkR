"""Single-file scoring and SLA configuration for tracked HR actions.

Edit this file to change how scores are computed globally.
"""

from __future__ import annotations

from typing import Final

# Weighted contribution of each quality dimension to final quality_score.
SCORING_WEIGHTS: Final[dict[str, float]] = {
    "completeness": 0.25,
    "accuracy": 0.30,
    "timeliness": 0.20,
    "process_adherence": 0.25,
}

# Default quality factors when a tracked action is logged without explicit factors.
DEFAULT_QUALITY_FACTORS: Final[dict[str, float]] = {
    "completeness": 85.0,
    "accuracy": 85.0,
    "timeliness": 90.0,
    "process_adherence": 85.0,
}

# Timeliness fallback when SLA exists but no reference start timestamp is supplied.
SLA_NO_REFERENCE_TIMELINESS: Final[float] = 95.0

# SLA seconds for each module/action_type pair that uses tracked scoring.
# Use None or remove a key if no SLA should be applied.
SLA_SECONDS_BY_ACTION: Final[dict[str, dict[str, int | None]]] = {
    "employees": {
        "create": 2 * 24 * 60 * 60,  # 2 days
        "update": 24 * 60 * 60,  # 1 day
        "update_profile": 12 * 60 * 60,  # 12 hours
        "document_upload": 48 * 60 * 60,  # 2 days
        "onboarding_update": 24 * 60 * 60,  # 1 day
        "lifecycle_transfer": 3 * 24 * 60 * 60,  # 3 days
        "lifecycle_promotion": 5 * 24 * 60 * 60,  # 5 days
        "lifecycle_termination": 3 * 24 * 60 * 60,  # 3 days
        "lifecycle_rehire": 5 * 24 * 60 * 60,  # 5 days
        "lifecycle_event": 3 * 24 * 60 * 60,  # generic lifecycle fallback
    },
    "compliance": {
        "policy_created": 3 * 24 * 60 * 60,  # 3 days
        "policy_acknowledged": 14 * 24 * 60 * 60,  # 14 days
        "policy_downloaded": 2 * 24 * 60 * 60,  # 2 days
    },
    "leave": {
        "create": 8 * 60 * 60,  # 8 hours for request intake quality
        "approved": 24 * 60 * 60,  # 1 day
        "rejected": 24 * 60 * 60,  # 1 day
        "policy_create": 2 * 24 * 60 * 60,  # 2 days
        "balance_upsert": 24 * 60 * 60,  # 1 day
        "attendance_recorded": 24 * 60 * 60,  # 1 day
        "holiday_create": 2 * 24 * 60 * 60,  # 2 days
    },
    "certification": {
        "issue": 7 * 24 * 60 * 60,  # 7 days
    },
}

# Progress dashboard module labels (must match ActivityLog.module for rows to roll up).
PROGRESS_MODULES: Final[dict[str, str]] = {
    "employees": "Employee",
    "compliance": "Audit",
    "leave": "Leave",
    "recruitment": "Recruitment",
    "training": "Learning",
    "compensation": "Compensation",
}

# Required action coverage used by progress dashboard readiness checks.
PROGRESS_REQUIRED_ACTIONS: Final[tuple[str, ...]] = (
    "employees:create",
    "compliance:policy_acknowledged",
    "leave:approved",
)

# Minimum overall score required for "eligible_for_assessment".
PROGRESS_ELIGIBLE_MIN_SCORE: Final[float] = 80.0

# --- Automated cohort / certification (per membership role) ---

# Minimum ActivityLog rows per module for auto-certificate eligibility.
CERT_MIN_TASKS_PER_MODULE_BY_ROLE: Final[dict[str, dict[str, int]]] = {
    "hr_ops": {"employees": 3, "compliance": 2, "leave": 3},
    "talent_acquisition": {"recruitment": 4, "employees": 2},
    "ld_performance": {"training": 4, "employees": 2},
    "compensation_analytics": {"compensation": 4, "employees": 2},
    "company_admin": {
        "employees": 3,
        "compliance": 2,
        "leave": 2,
        "recruitment": 2,
        "training": 2,
        "compensation": 2,
    },
    "employee": {"employees": 1, "compliance": 1, "leave": 1},
}

CERT_MIN_SCORE_BY_ROLE: Final[dict[str, float]] = {
    "hr_ops": 75.0,
    "talent_acquisition": 75.0,
    "ld_performance": 75.0,
    "compensation_analytics": 75.0,
    "company_admin": 80.0,
    "employee": 65.0,
}

CERT_DEFAULT_MIN_TASKS_PER_MODULE: Final[dict[str, int]] = {
    "employees": 2,
    "compliance": 1,
    "leave": 1,
}
CERT_DEFAULT_MIN_SCORE: Final[float] = 70.0

