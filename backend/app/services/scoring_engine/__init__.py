"""
Scoring engine: rule-based quality factors (four dimensions) for HworkR activity logging.

See docs/hworkr-scoring-engine-spec.md and docs/hworkr-scoring-implementation-map.md.
"""

from app.services.scoring_engine.core import as_float_dict, factors_at, merge_worst, min_dim
from app.services.scoring_engine.employees import profile_completeness_factors
from app.services.scoring_engine.recruitment import (
    application_process_nudge_factors,
    job_posting_completeness_factors,
    offer_compensation_factors,
    requisition_completeness_factors,
)
from app.services.scoring_engine.training import (
    training_assigner_late_mandatory_nudge,
    training_assigner_quality_factors,
    training_completion_factors,
)

__all__ = [
    "as_float_dict",
    "factors_at",
    "merge_worst",
    "min_dim",
    "profile_completeness_factors",
    "requisition_completeness_factors",
    "job_posting_completeness_factors",
    "offer_compensation_factors",
    "application_process_nudge_factors",
    "training_completion_factors",
    "training_assigner_late_mandatory_nudge",
    "training_assigner_quality_factors",
]
