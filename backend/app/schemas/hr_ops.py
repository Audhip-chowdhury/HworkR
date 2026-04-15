from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LeavePolicyCreate(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    accrual_rules_json: dict[str, Any] | None = None
    carry_forward_limit: int | None = None
    applicable_to_json: dict[str, Any] | None = None


class LeavePolicyOut(BaseModel):
    id: str
    company_id: str
    type: str
    accrual_rules_json: dict[str, Any] | None
    carry_forward_limit: int | None
    applicable_to_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeaveRequestCreate(BaseModel):
    """HR may set employee_id; employees omit it (uses linked employee record)."""

    employee_id: str | None = None
    type: str = Field(min_length=1, max_length=64)
    start_date: str
    end_date: str
    reason: str | None = None


class LeaveRequestApprove(BaseModel):
    status: Literal["approved", "rejected"]
    reason: str | None = None


class LeaveRequestOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    type: str
    start_date: str
    end_date: str
    reason: str | None
    status: str
    approved_by: str | None
    created_at: datetime
    updated_at: datetime
    employee_display_name: str | None = None
    employee_code: str | None = None

    model_config = {"from_attributes": True}


class LeaveTypeSummaryOut(BaseModel):
    type: str
    allocated: float
    used: float
    pending: float
    remaining: float


class LeaveYearSummaryOut(BaseModel):
    year: int
    types: list[LeaveTypeSummaryOut]


class LeaveBalanceCreate(BaseModel):
    employee_id: str
    type: str = Field(min_length=1, max_length=64)
    balance: float = Field(ge=0)
    year: int = Field(ge=2000, le=2100)


class LeaveBalanceOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    type: str
    balance: float
    year: int

    model_config = {"from_attributes": True}


class AttendanceRecordCreate(BaseModel):
    employee_id: str
    date: str
    clock_in: str | None = None
    clock_out: str | None = None
    status: str | None = Field(default=None, max_length=32)


class AttendanceRecordOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    date: str
    clock_in: str | None
    clock_out: str | None
    status: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HolidayCreate(BaseModel):
    location_id: str | None = None
    date: str
    name: str = Field(min_length=1, max_length=255)


class HolidayOut(BaseModel):
    id: str
    company_id: str
    location_id: str | None
    date: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
