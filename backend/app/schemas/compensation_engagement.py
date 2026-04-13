from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SalaryStructureCreate(BaseModel):
    employee_id: str
    components_json: dict[str, Any] | None = None
    effective_from: str | None = None


class SalaryStructureOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    components_json: dict[str, Any] | None
    effective_from: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayRunCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)
    status: str = Field(default="draft", max_length=32)


class PayRunUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)


class PayRunOut(BaseModel):
    id: str
    company_id: str
    month: int
    year: int
    status: str
    processed_by: str | None
    processed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayslipCreate(BaseModel):
    pay_run_id: str
    employee_id: str
    gross: float = Field(ge=0)
    deductions_json: dict[str, Any] | None = None
    net: float = Field(ge=0)
    pdf_url: str | None = None


class PayslipOut(BaseModel):
    id: str
    pay_run_id: str
    company_id: str
    employee_id: str
    gross: float
    deductions_json: dict[str, Any] | None
    net: float
    pdf_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BenefitsPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    details_json: dict[str, Any] | None = None
    enrollment_period: str | None = None


class BenefitsPlanOut(BaseModel):
    id: str
    company_id: str
    name: str
    type: str | None
    details_json: dict[str, Any] | None
    enrollment_period: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BenefitsEnrollmentCreate(BaseModel):
    plan_id: str
    employee_id: str
    dependents_json: dict[str, Any] | None = None
    status: str = Field(default="active", max_length=32)


class BenefitsEnrollmentOut(BaseModel):
    id: str
    plan_id: str
    company_id: str
    employee_id: str
    dependents_json: dict[str, Any] | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SurveyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    questions_json: Any | None = None
    target_audience_json: dict[str, Any] | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str = Field(default="draft", max_length=32)


class SurveyOut(BaseModel):
    id: str
    company_id: str
    title: str
    questions_json: Any | None
    target_audience_json: dict[str, Any] | None
    start_date: str | None
    end_date: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SurveyResponseCreate(BaseModel):
    survey_id: str
    employee_id: str
    answers_json: dict[str, Any] | None = None


class SurveyResponseOut(BaseModel):
    id: str
    survey_id: str
    company_id: str
    employee_id: str
    answers_json: dict[str, Any] | None
    submitted_at: datetime

    model_config = {"from_attributes": True}
