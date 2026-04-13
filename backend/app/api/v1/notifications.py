from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path
from app.database import get_db
from app.models.membership import CompanyMembership
from app.models.notification import Notification
from app.models.user import User
from app.schemas.shared_services import NotificationOut

router = APIRouter(tags=["notifications"])


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
    return list(r.scalars().all())
