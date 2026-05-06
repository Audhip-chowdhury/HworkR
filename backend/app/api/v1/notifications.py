from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.notification import Notification
from app.models.user import User
from app.schemas.shared_services import NotificationOut
from app.services.audit import write_audit

router = APIRouter(tags=["notifications"])


def _filter_notifications_matching_open_inbox_tasks(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    items: list[Notification],
) -> list[Notification]:
    """Drop onboarding task reminders when the matching inbox task is no longer open."""
    emp_open = db.execute(
        select(InboxTask.entity_id, InboxTask.type).where(
            InboxTask.company_id == company_id,
            InboxTask.user_id == user_id,
            InboxTask.status == "open",
            InboxTask.entity_type == "employee",
            InboxTask.entity_id.isnot(None),
        )
    ).all()
    open_keys: set[tuple[str, str]] = {(str(row[0]), str(row[1])) for row in emp_open if row[0] is not None}

    out: list[Notification] = []
    for n in items:
        if n.type == "employee_onboarding_missing_info":
            ctx: dict[str, Any] = n.context_json if isinstance(n.context_json, dict) else {}
            tt = ctx.get("task_type")
            eid = n.entity_id
            if n.entity_type == "employee" and isinstance(eid, str) and isinstance(tt, str):
                if (eid, tt) not in open_keys:
                    continue
        out.append(n)
    return out


class MarkNotificationsReadBody(BaseModel):
    """When empty, marks all unread notifications for this user in the company."""

    notification_ids: list[str] = Field(default_factory=list)


@router.get(
    "/companies/{company_id}/notifications",
    response_model=list[NotificationOut],
)
def list_notifications(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Notification]:
    user, _ = ctx
    r = db.execute(
        select(Notification)
        .where(Notification.company_id == company_id, Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    raw = list(r.scalars().all())
    return _filter_notifications_matching_open_inbox_tasks(
        db, company_id=company_id, user_id=user.id, items=raw
    )


@router.post("/companies/{company_id}/notifications/mark-read", status_code=204)
def mark_notifications_read(
    company_id: str,
    body: MarkNotificationsReadBody,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user, _ = ctx
    stmt = (
        update(Notification)
        .where(
            Notification.company_id == company_id,
            Notification.user_id == user.id,
            Notification.read.is_(False),
        )
        .values(read=True)
    )
    if body.notification_ids:
        stmt = stmt.where(Notification.id.in_(body.notification_ids))
    db.execute(stmt)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="notification",
        entity_id=uuid_str(),
        action="mark_read",
        changes_json={"notification_ids": body.notification_ids} if body.notification_ids else {"scope": "all_unread"},
    )
    db.commit()
