from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class MemberSearchHit(BaseModel):
    user_id: str
    name: str
    email: str


class AuditCategoryOption(BaseModel):
    id: str
    label: str


class TrailEntryOut(BaseModel):
    source: Literal["activity", "audit"]
    id: str
    at: datetime
    user_id: str
    category: str
    category_label: str
    screen: str
    action: str
    detail: str | None = None
    extra: dict[str, Any] | None = None


class PolicyDocumentOut(BaseModel):
    id: str
    company_id: str
    title: str
    description: str | None
    file_name: str
    created_by: str
    created_at: datetime
    """Only populated for HR / analytics roles; omitted for employees."""
    acknowledgment_count: int | None = None
    member_count: int | None = None
    acknowledged_by_me: bool


class PolicyAckMemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    acknowledged: bool
    acknowledged_at: datetime | None


class PolicyAckDetailResponse(BaseModel):
    items: list[PolicyAckMemberOut]
    total: int
    offset: int
    limit: int
