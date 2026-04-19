from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


ApplicationStage = Literal[
    "applied",
    "screened",
    "phone_screen",
    "interview",
    "assessment",
    "offer",
    "hired",
    "rejected",
]


class HiringCriteria(BaseModel):
    """Structured hiring criteria stored in `requisitions.hiring_criteria_json`."""

    model_config = ConfigDict(extra="ignore")

    skills: list[str] = Field(default_factory=list)
    experience: str | None = Field(default=None, max_length=2000)
    education: str | None = Field(default=None, max_length=2000)


class RequisitionCreate(BaseModel):
    department_id: str | None = None
    job_id: str | None = None
    headcount: int = Field(default=1, ge=1, le=1000)
    hiring_criteria: HiringCriteria | None = None
    approval_chain_json: dict[str, Any] | None = None


class RequisitionOut(BaseModel):
    id: str
    company_id: str
    created_by: str
    department_id: str | None
    job_id: str | None
    req_code: str | None = None
    headcount: int
    status: str
    hiring_criteria: HiringCriteria | None = None
    approval_chain_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class RequisitionUpdate(BaseModel):
    department_id: str | None = None
    job_id: str | None = None
    headcount: int | None = Field(default=None, ge=1, le=1000)
    status: str | None = Field(default=None, min_length=1, max_length=32)
    hiring_criteria: HiringCriteria | None = None
    approval_chain_json: dict[str, Any] | None = None


class JobPostingCreate(BaseModel):
    requisition_id: str
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    requirements: str | None = None
    deadline: str | None = None


class JobPostingOut(BaseModel):
    id: str
    requisition_id: str
    company_id: str
    title: str
    description: str | None
    requirements: str | None
    deadline: str | None
    status: str
    posted: bool = False
    posting_ref: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobPostingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    requirements: str | None = None
    deadline: str | None = None
    status: str | None = Field(default=None, min_length=1, max_length=32)
    posted: bool | None = None
    posting_ref: str | None = Field(default=None, max_length=128)


class ApplicationCreate(BaseModel):
    posting_id: str
    candidate_user_id: str
    resume_url: str | None = Field(default=None, max_length=1024)


class ApplicationUpdateStage(BaseModel):
    stage: ApplicationStage
    status: str = Field(default="active", min_length=1, max_length=32)
    notes: str | None = None


class ApplicationOut(BaseModel):
    id: str
    posting_id: str
    company_id: str
    candidate_user_id: str
    resume_url: str | None
    status: str
    stage: str
    notes: str | None
    applied_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicApplyByReqCodeRequest(BaseModel):
    """Candidate account + application in one step. `req_code` is globally unique (URL path)."""

    email: EmailStr
    password: str = Field(min_length=8, description="New account password, or existing user's password")
    name: str = Field(min_length=1, max_length=255)
    resume_url: str | None = Field(default=None, max_length=1024)


class PublicApplyByReqCodeResponse(BaseModel):
    application: ApplicationOut
    access_token: str
    token_type: str = "bearer"


class ApplicationWithPostingOut(ApplicationOut):
    posting_title: str | None = None
    candidate_name: str | None = None
    job_grade: str | None = None


class ApplicationActivityOut(BaseModel):
    """One audit row for candidate / application pipeline activity."""

    id: str
    timestamp: datetime
    application_id: str
    posting_id: str
    posting_title: str | None = None
    candidate_user_id: str
    candidate_name: str | None = None
    actor_user_id: str | None = None
    actor_name: str | None = None
    action: str
    previous_stage: str | None = None
    previous_status: str | None = None
    stage: str | None = None
    status: str | None = None
    via: str | None = Field(
        default=None,
        description="When set: offer_created (offer sent) or offer_response (candidate responded).",
    )


class JobPostingPublicOut(BaseModel):
    """Candidate-facing job board (no internal tracking fields)."""

    id: str
    requisition_id: str
    company_id: str
    title: str
    description: str | None
    requirements: str | None
    deadline: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterviewCreate(BaseModel):
    scheduled_at: datetime | None = None
    panel_json: Any | None = None
    format: str | None = Field(default=None, max_length=64)
    feedback_json: Any | None = None
    status: str = Field(default="scheduled", min_length=1, max_length=32)


class InterviewUpdate(BaseModel):
    scheduled_at: datetime | None = None
    panel_json: Any | None = None
    format: str | None = Field(default=None, max_length=64)
    feedback_json: Any | None = None
    status: str | None = Field(default=None, min_length=1, max_length=32)


class InterviewOut(BaseModel):
    id: str
    application_id: str
    company_id: str
    scheduled_at: datetime | None
    panel_json: Any | None
    format: str | None
    feedback_json: Any | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InterviewCalendarItemOut(InterviewOut):
    """Scheduled interviews for calendar view (excludes cancelled / removed rows)."""

    posting_title: str | None = None
    candidate_name: str | None = None


class OfferCreate(BaseModel):
    application_id: str
    compensation_json: dict[str, Any] | None = None
    start_date: str | None = None


class OfferRespond(BaseModel):
    status: Literal["accepted", "declined", "negotiating"]


class OfferOut(BaseModel):
    id: str
    application_id: str
    company_id: str
    compensation_json: dict[str, Any] | None
    start_date: str | None
    status: str
    sent_at: datetime
    responded_at: datetime | None

    model_config = {"from_attributes": True}


class CandidateOfferOut(OfferOut):
    posting_title: str | None = None


class ConvertToEmployeeRequest(BaseModel):
    employee_code: str = Field(min_length=1, max_length=64)
    department_id: str | None = None
    job_id: str | None = None
    manager_id: str | None = None
    location_id: str | None = None
    hire_date: str | None = None
    personal_info_json: dict[str, Any] | None = None


class ConvertToEmployeeResponse(BaseModel):
    application_id: str
    offer_id: str
    employee_id: str
    message: str
