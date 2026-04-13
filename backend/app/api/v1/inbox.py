from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path
from app.database import get_db
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.shared_services import InboxTaskOut

router = APIRouter(tags=["inbox"])


@router.get(
    "/companies/{company_id}/inbox/tasks",
    response_model=list[InboxTaskOut],
)
def list_inbox_tasks(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[InboxTask]:
    user, _ = ctx
    r = db.execute(
        select(InboxTask)
        .where(InboxTask.company_id == company_id, InboxTask.user_id == user.id)
        .order_by(InboxTask.created_at.desc())
        .limit(100)
    )
    return list(r.scalars().all())
