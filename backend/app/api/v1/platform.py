from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_platform_admin
from app.database import get_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.company_registration_request import CompanyRegistrationRequest
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.company import CompanyOut
from app.schemas.company_registration import CompanyRegistrationRejectBody, CompanyRegistrationRequestOut
from app.services.audit import write_audit

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/companies", response_model=list[CompanyOut])
def list_companies(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Company]:
    r = db.execute(select(Company).order_by(Company.name))
    return list(r.scalars().all())


def _to_request_out(req: CompanyRegistrationRequest) -> CompanyRegistrationRequestOut:
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


@router.get("/company-registration-requests", response_model=list[CompanyRegistrationRequestOut])
def list_registration_requests(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: str = Query("pending", alias="status"),
) -> list[CompanyRegistrationRequestOut]:
    q = select(CompanyRegistrationRequest).options(
        joinedload(CompanyRegistrationRequest.requester)
    )
    if status_filter != "all":
        q = q.where(CompanyRegistrationRequest.status == status_filter)
    q = q.order_by(CompanyRegistrationRequest.submitted_at.desc())
    r = db.execute(q)
    rows = r.unique().scalars().all()
    return [_to_request_out(req) for req in rows]


@router.post(
    "/company-registration-requests/{request_id}/approve",
    response_model=CompanyOut,
    status_code=status.HTTP_201_CREATED,
)
def approve_registration(
    request_id: str,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> Company:
    r = db.execute(
        select(CompanyRegistrationRequest)
        .options(joinedload(CompanyRegistrationRequest.requester))
        .where(CompanyRegistrationRequest.id == request_id)
    )
    req = r.unique().scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This request is not pending",
        )

    company = Company(
        id=uuid_str(),
        name=req.company_name,
        logo_url=req.logo_url,
        industry=req.industry,
        location=req.location,
        config_json={},
    )
    db.add(company)
    db.flush()

    membership = CompanyMembership(
        id=uuid_str(),
        user_id=req.requester_user_id,
        company_id=company.id,
        role="company_admin",
        status="active",
        modules_access_json=None,
    )
    db.add(membership)

    now = datetime.now(timezone.utc)
    req.status = "approved"
    req.reviewed_at = now
    req.reviewed_by_user_id = admin.id
    req.created_company_id = company.id

    write_audit(
        db,
        company_id=company.id,
        user_id=admin.id,
        entity_type="company",
        entity_id=company.id,
        action="create",
        changes_json={"name": company.name, "from_registration_request_id": req.id},
    )
    write_audit(
        db,
        company_id=company.id,
        user_id=admin.id,
        entity_type="company_registration_request",
        entity_id=req.id,
        action="approve",
        changes_json={"company_id": company.id},
    )
    db.commit()
    db.refresh(company)
    return company


@router.post(
    "/company-registration-requests/{request_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_registration(
    request_id: str,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
    body: Annotated[CompanyRegistrationRejectBody | None, Body()] = None,
) -> None:
    r = db.execute(select(CompanyRegistrationRequest).where(CompanyRegistrationRequest.id == request_id))
    req = r.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This request is not pending",
        )

    now = datetime.now(timezone.utc)
    req.status = "rejected"
    req.reviewed_at = now
    req.reviewed_by_user_id = admin.id
    req.rejection_reason = (body.reason.strip() if body and body.reason else None) or None

    write_audit(
        db,
        company_id=None,
        user_id=admin.id,
        entity_type="company_registration_request",
        entity_id=req.id,
        action="reject",
        changes_json={"reason": req.rejection_reason},
    )
    db.commit()
