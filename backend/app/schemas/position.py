from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

PositionBucket = Literal["none", "c_suite", "temporary"]


class PositionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    department_id: str | None = None
    bucket: PositionBucket = "none"
    grade: int = Field(default=100, ge=0, le=999_999)
    reports_to_id: str | None = None
    works_with_id: str | None = None

    @model_validator(mode="after")
    def placement_matches_bucket(self) -> "PositionCreate":
        if self.department_id:
            if self.bucket != "none":
                raise ValueError("When department_id is set, bucket must be none")
        else:
            if self.bucket not in ("c_suite", "temporary"):
                raise ValueError("When department_id is empty, bucket must be c_suite or temporary")
        return self


class PositionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    department_id: str | None = None
    bucket: PositionBucket | None = None
    grade: int | None = Field(default=None, ge=0, le=999_999)
    reports_to_id: str | None = None
    works_with_id: str | None = None


class PositionOut(BaseModel):
    id: str
    company_id: str
    name: str
    department_id: str | None
    department_name: str | None
    bucket: str
    grade: int
    reports_to_id: str | None
    works_with_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
