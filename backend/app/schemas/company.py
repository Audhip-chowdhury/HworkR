from typing import Any

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    location: str | None = Field(default=None, max_length=255)
    config_json: dict[str, Any] | None = None


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=1024)
    location: str | None = Field(default=None, max_length=255)
    config_json: dict[str, Any] | None = None


class CompanyOut(BaseModel):
    id: str
    name: str
    logo_url: str | None
    industry: str | None
    location: str | None
    config_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


class MembershipCreate(BaseModel):
    user_email: str = Field(min_length=3, max_length=255)
    role: str = Field(
        pattern="^(company_admin|talent_acquisition|hr_ops|ld_performance|compensation_analytics|employee)$"
    )
    modules_access_json: dict[str, Any] | None = None


class MembershipOut(BaseModel):
    id: str
    user_id: str
    company_id: str
    role: str
    status: str
    modules_access_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


class MemberInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(
        pattern="^(company_admin|talent_acquisition|hr_ops|ld_performance|compensation_analytics|employee)$"
    )
    name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class MemberRoleUpdate(BaseModel):
    role: str = Field(
        pattern="^(company_admin|talent_acquisition|hr_ops|ld_performance|compensation_analytics|employee)$"
    )
