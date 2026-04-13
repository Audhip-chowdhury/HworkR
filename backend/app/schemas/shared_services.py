from datetime import datetime
from typing import Any

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    company_id: str
    user_id: str
    type: str
    title: str
    message: str
    entity_type: str | None
    entity_id: str | None
    read: bool
    context_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class InboxTaskOut(BaseModel):
    id: str
    company_id: str
    user_id: str
    type: str
    title: str
    entity_type: str | None
    entity_id: str | None
    priority: str
    status: str
    due_at: datetime | None
    context_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowTemplateOut(BaseModel):
    id: str
    company_id: str
    name: str
    module: str
    steps_json: list[dict[str, Any]] | dict[str, Any]
    conditions_json: dict[str, Any] | None

    model_config = {"from_attributes": True}
