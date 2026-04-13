from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_eligible_company_registration_submitter
from app.config import settings
from app.database import get_db
from app.models.base import uuid_str
from app.models.company_registration_request import CompanyRegistrationRequest
from app.models.user import User
from app.schemas.company_registration import CompanyRegistrationRequestOut
from app.services.logo_upload import save_company_logo

router = APIRouter(prefix="/company-registration-requests", tags=["company-registration"])


def _empty_to_none(s: str | None) -> str | None:
    if s is None:
        return None
    s = s.strip()
    return s if s else None


@router.post("", response_model=CompanyRegistrationRequestOut, status_code=status.HTTP_201_CREATED)
async def submit_company_registration(
    user: Annotated[User, Depends(require_eligible_company_registration_submitter)],
    db: Annotated[Session, Depends(get_db)],
    company_name: Annotated[str, Form()],
    industry: Annotated[str | None, Form()] = None,
    location: Annotated[str | None, Form()] = None,
    logo: Annotated[UploadFile | None, File()] = None,
) -> CompanyRegistrationRequest:
    pending = db.execute(
        select(CompanyRegistrationRequest).where(
            CompanyRegistrationRequest.requester_user_id == user.id,
            CompanyRegistrationRequest.status == "pending",
        )
    ).scalar_one_or_none()
    if pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending company registration request",
        )

    name = company_name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required")

    logo_url: str | None = None
    if logo is not None and logo.filename:
        logo_url = await save_company_logo(
            logo,
            upload_root=settings.upload_dir,
            max_bytes=settings.max_upload_bytes,
        )

    req = CompanyRegistrationRequest(
        id=uuid_str(),
        requester_user_id=user.id,
        company_name=name,
        logo_url=logo_url,
        industry=_empty_to_none(industry),
        location=_empty_to_none(location),
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    ur = db.execute(select(User).where(User.id == user.id))
    u = ur.scalar_one()
    return CompanyRegistrationRequestOut(
        id=req.id,
        requester_user_id=req.requester_user_id,
        requester_email=u.email,
        company_name=req.company_name,
        logo_url=req.logo_url,
        industry=req.industry,
        location=req.location,
        submitted_at=req.submitted_at,
        status=req.status,
        reviewed_at=req.reviewed_at,
        reviewed_by_user_id=req.reviewed_by_user_id,
        rejection_reason=req.rejection_reason,
        created_company_id=req.created_company_id,
    )


@router.get("/me", response_model=CompanyRegistrationRequestOut | None)
def my_latest_registration_request(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CompanyRegistrationRequestOut | None:
    r = db.execute(
        select(CompanyRegistrationRequest)
        .options(joinedload(CompanyRegistrationRequest.requester))
        .where(CompanyRegistrationRequest.requester_user_id == user.id)
        .order_by(CompanyRegistrationRequest.submitted_at.desc())
        .limit(1)
    )
    req = r.unique().scalar_one_or_none()
    if req is None:
        return None
    u = req.requester
    assert u is not None
    return CompanyRegistrationRequestOut(
        id=req.id,
        requester_user_id=req.requester_user_id,
        requester_email=u.email,
        company_name=req.company_name,
        logo_url=req.logo_url,
        industry=req.industry,
        location=req.location,
        submitted_at=req.submitted_at,
        status=req.status,
        reviewed_at=req.reviewed_at,
        reviewed_by_user_id=req.reviewed_by_user_id,
        rejection_reason=req.rejection_reason,
        created_company_id=req.created_company_id,
    )
