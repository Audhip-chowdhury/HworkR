from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ActivityLogCreate(BaseModel):
    module: str = Field(min_length=1, max_length=64)
    action_type: str = Field(min_length=1, max_length=64)
    action_detail: str | None = Field(default=None, max_length=255)
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: str | None = None
    quality_factors: dict[str, Any] | None = None
    context_json: dict[str, Any] | None = None
    session_id: str | None = None
    reference_started_at: datetime | None = Field(
        default=None,
        description="When set, SLA timeliness is computed from this timestamp via scoring rules",
    )


class ActivityLogOut(BaseModel):
    id: str
    company_id: str
    user_id: str
    role: str | None
    module: str
    action_type: str
    action_detail: str | None
    entity_type: str | None
    entity_id: str | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: int | None
    quality_score: float | None
    quality_factors_json: dict[str, Any] | None
    context_json: dict[str, Any] | None
    session_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScoringRuleCreate(BaseModel):
    module: str = Field(min_length=1, max_length=64)
    action_type: str = Field(min_length=1, max_length=64)
    sla_seconds: int | None = Field(default=None, ge=0)
    weight_completeness: float = Field(default=0.25, ge=0, le=1)
    weight_accuracy: float = Field(default=0.30, ge=0, le=1)
    weight_timeliness: float = Field(default=0.20, ge=0, le=1)
    weight_process: float = Field(default=0.25, ge=0, le=1)
    criteria_json: dict[str, Any] | None = None


class ScoringRuleOut(BaseModel):
    id: str
    company_id: str
    module: str
    action_type: str
    sla_seconds: int | None
    weight_completeness: float
    weight_accuracy: float
    weight_timeliness: float
    weight_process: float
    criteria_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScoreDashboardOut(BaseModel):
    overall_score: float | None
    avg_completeness: float | None
    avg_accuracy: float | None
    avg_timeliness: float | None
    avg_process_adherence: float | None
    action_count: int
