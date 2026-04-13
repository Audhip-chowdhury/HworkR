from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    user_id: str | None = None
    employee_code: str = Field(min_length=1, max_length=64)
    department_id: str | None = None
    job_id: str | None = None
    manager_id: str | None = None
    location_id: str | None = None
    status: str = Field(default="active", max_length=32)
    hire_date: str | None = None
    personal_info_json: dict[str, Any] | None = None
    documents_json: dict[str, Any] | None = None
    onboarding_checklist_json: dict[str, Any] | None = None


class EmployeeUpdate(BaseModel):
    user_id: str | None = None
    employee_code: str | None = Field(default=None, min_length=1, max_length=64)
    department_id: str | None = None
    job_id: str | None = None
    manager_id: str | None = None
    location_id: str | None = None
    status: str | None = Field(default=None, max_length=32)
    hire_date: str | None = None
    personal_info_json: dict[str, Any] | None = None
    documents_json: dict[str, Any] | None = None
    onboarding_checklist_json: dict[str, Any] | None = None


class EmployeeSelfUpdate(BaseModel):
    """Employee may only update personal/documents JSON on their own record."""

    personal_info_json: dict[str, Any] | None = None
    documents_json: dict[str, Any] | None = None


class EmployeeOut(BaseModel):
    id: str
    company_id: str
    user_id: str | None
    employee_code: str
    department_id: str | None
    job_id: str | None
    manager_id: str | None
    location_id: str | None
    status: str
    hire_date: str | None
    personal_info_json: dict[str, Any] | None
    documents_json: dict[str, Any] | None
    onboarding_checklist_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OnboardingChecklistUpdate(BaseModel):
    onboarding_checklist_json: dict[str, Any]


class LifecycleEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=64)
    effective_date: str | None = None
    payload_json: dict[str, Any] | None = None
    status: str = Field(default="completed", max_length=32)
    notes: str | None = None


class LifecycleEventOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    event_type: str
    effective_date: str | None
    payload_json: dict[str, Any] | None
    status: str
    notes: str | None
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
