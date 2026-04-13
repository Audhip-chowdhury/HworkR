from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WebhookSubscriptionCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    secret: str = Field(min_length=8, max_length=255)
    events: list[str] | None = Field(
        default=None,
        description="If null or empty, subscribe to all events for the company",
    )
    is_active: bool = True


class WebhookSubscriptionOut(BaseModel):
    id: str
    company_id: str
    url: str
    secret: str
    events_json: list[str] | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookSubscriptionUpdate(BaseModel):
    url: str | None = Field(default=None, min_length=8, max_length=2048)
    secret: str | None = Field(default=None, min_length=8, max_length=255)
    events_json: list[str] | None = Field(default=None, alias="events")
    is_active: bool | None = None

    model_config = {"populate_by_name": True}


class WebhookTestRequest(BaseModel):
    event_type: str = Field(default="ping", max_length=128)
    data: dict[str, Any] | None = None
