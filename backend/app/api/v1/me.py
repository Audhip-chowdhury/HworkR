from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.company import CompanyOut, MembershipOut

router = APIRouter(prefix="/me", tags=["me"])


class CompanyWithRole(BaseModel):
    company: CompanyOut
    membership: MembershipOut


@router.get("/companies", response_model=list[CompanyWithRole])
def my_companies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompanyWithRole]:
    r = db.execute(
        select(CompanyMembership)
        .options(joinedload(CompanyMembership.company))
        .where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    rows = r.unique().scalars().all()
    out: list[CompanyWithRole] = []
    for m in rows:
        c = m.company
        assert isinstance(c, Company)
        out.append(
            CompanyWithRole(
                company=CompanyOut.model_validate(c),
                membership=MembershipOut.model_validate(m),
            )
        )
    return out
