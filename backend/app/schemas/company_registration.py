from datetime import datetime

from pydantic import BaseModel, Field


class CompanyRegistrationRequestOut(BaseModel):
    id: str
    requester_user_id: str
    requester_email: str
    company_name: str
    logo_url: str | None
    industry: str | None
    location: str | None
    submitted_at: datetime
    status: str
    reviewed_at: datetime | None
    reviewed_by_user_id: str | None
    rejection_reason: str | None
    created_company_id: str | None

    model_config = {"from_attributes": True}


class CompanyRegistrationRejectBody(BaseModel):
    reason: str | None = Field(default=None, max_length=1024)
