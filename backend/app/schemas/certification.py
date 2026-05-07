from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CertTrackCreate(BaseModel):
    role_type: str = Field(min_length=1, max_length=64)
    level: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    requirements_json: dict[str, Any] | None = None
    min_score: float = Field(default=70.0, ge=0, le=100)


class CertTrackOut(BaseModel):
    id: str
    company_id: str
    role_type: str
    level: str
    name: str
    requirements_json: dict[str, Any] | None
    min_score: float
    created_at: datetime

    model_config = {"from_attributes": True}


class CertProgressOut(BaseModel):
    id: str
    track_id: str
    company_id: str
    user_id: str
    completed_actions_json: dict[str, Any] | None
    current_score: float | None
    status: str
    started_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CertProgressUpsert(BaseModel):
    completed_actions_json: dict[str, Any] | None = None
    current_score: float | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, max_length=32)


class CertificateIssueRequest(BaseModel):
    track_id: str
    level: str = Field(min_length=1, max_length=32)
    score: float = Field(ge=0, le=100)
    breakdown_json: dict[str, Any] | None = None
    # If set, company_admin only — issue certificate for another user.
    target_user_id: str | None = None


class CertificateOut(BaseModel):
    id: str
    track_id: str
    company_id: str
    user_id: str
    level: str
    score: float
    breakdown_json: dict[str, Any] | None
    issued_at: datetime
    verification_id: str
    approval_status: str = "pending_approval"

    model_config = {"from_attributes": True}


class PublicCertificateOut(BaseModel):
    verification_id: str
    approval_status: str
    recipient_name: str
    company_name: str
    track_name: str
    level: str
    score: float
    issued_at: datetime


class ProgressDimensionOut(BaseModel):
    completeness: float | None
    accuracy: float | None
    timeliness: float | None
    process_adherence: float | None


class ProgressModuleOut(BaseModel):
    module: str
    label: str
    action_count: int
    avg_score: float | None


class ProgressRecentActionOut(BaseModel):
    id: str
    occurred_at: datetime
    module: str
    action_type: str
    action_detail: str | None
    score: float | None


class ModuleTaskProgressOut(BaseModel):
    module: str
    required: int
    completed: int


class CertificationProgressDashboardOut(BaseModel):
    overall_score: float | None
    action_count: int
    dimension_averages: ProgressDimensionOut
    module_breakdown: list[ProgressModuleOut]
    required_actions_total: int
    required_actions_completed: int
    missing_required_actions: list[str]
    module_task_progress: list[ModuleTaskProgressOut] = Field(default_factory=list)
    critical_failure_count: int
    status: str
    recent_actions: list[ProgressRecentActionOut]
