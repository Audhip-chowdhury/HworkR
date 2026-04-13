from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class WorkflowInstanceCreate(BaseModel):
    template_id: str
    entity_type: str = Field(min_length=1, max_length=64)
    entity_id: str = Field(min_length=1, max_length=36)


class WorkflowInstanceOut(BaseModel):
    id: str
    template_id: str
    company_id: str
    entity_type: str
    entity_id: str
    current_step: int
    status: str
    initiated_by: str | None
    initiated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowActionBody(BaseModel):
    action: Literal["approve", "reject"]
    comments: str | None = None


class WorkflowActionOut(BaseModel):
    id: str
    instance_id: str
    step: int
    actor_id: str | None
    action: str
    comments: str | None
    acted_at: datetime

    model_config = {"from_attributes": True}
