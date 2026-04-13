from typing import Any

from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None
    head_employee_id: str | None = None
    level: int = 0


class DepartmentOut(BaseModel):
    id: str
    company_id: str
    name: str
    parent_id: str | None
    head_employee_id: str | None
    level: int

    model_config = {"from_attributes": True}


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=128)


class LocationOut(BaseModel):
    id: str
    company_id: str
    name: str
    address: str | None
    timezone: str | None
    country: str | None

    model_config = {"from_attributes": True}


class JobCatalogCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    family: str | None = None
    level: str | None = None
    grade: str | None = None
    salary_band_json: dict[str, Any] | None = None


class JobCatalogOut(BaseModel):
    id: str
    company_id: str
    title: str
    family: str | None
    level: str | None
    grade: str | None
    salary_band_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


class OrgRoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class OrgRoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class OrgRoleOut(BaseModel):
    id: str
    company_id: str
    name: str
    description: str | None

    model_config = {"from_attributes": True}


class DepartmentOrgRolesOut(BaseModel):
    """All org roles assigned to one department."""

    department_id: str
    department_name: str
    org_roles: list[OrgRoleOut]


class OrgRoleMappingCreate(BaseModel):
    org_role_id: str = Field(min_length=1, max_length=36)
