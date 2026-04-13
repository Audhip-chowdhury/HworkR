from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ScenarioGenerateRequest(BaseModel):
    """Which synthetic signals to create."""

    create_leave_request: bool = True
    create_job_application: bool = False
    posting_id: str | None = Field(default=None, description="Required if create_job_application")
    candidate_user_id: str | None = Field(default=None, description="User to apply as; defaults to actor")
    create_inbox_task_for_hr: bool = True
    notes: str | None = None


class ScenarioRunOut(BaseModel):
    id: str
    company_id: str
    config_json: dict[str, Any] | None
    status: str
    result_json: dict[str, Any] | None
    created_by: str | None
    created_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}
