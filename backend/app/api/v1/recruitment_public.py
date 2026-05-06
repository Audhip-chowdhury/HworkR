"""Public recruitment routes (no company id in URL — req_code is globally unique)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash, verify_password
from app.database import get_db
from app.models.base import uuid_str
from app.models.membership import CompanyMembership
from app.models.recruitment import Application, JobPosting, Requisition
from app.models.user import User
from app.schemas.recruitment import PublicApplyByReqCodeRequest, PublicApplyByReqCodeResponse
from app.services.audit import write_audit
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.recruitment_external_status import post_application_pipeline_status
from app.services.requisition_codes import normalize_req_code_path

router = APIRouter(prefix="/recruitment", tags=["recruitment"])


@router.post(
    "/public-apply/{req_code}",
    response_model=PublicApplyByReqCodeResponse,
    status_code=status.HTTP_201_CREATED,
)
def public_apply_by_req_code(
    req_code: str,
    body: PublicApplyByReqCodeRequest,
    db: Annotated[Session, Depends(get_db)],
) -> PublicApplyByReqCodeResponse:
    """
    Public apply: **`req_code` is unique across all companies.** Resolve the requisition, find its
    job posting, create or verify the user, add employee membership, and create an application.

    **URL:** `POST /api/v1/recruitment/public-apply/{req_code}`

    **Body:** `email`, `password` (min 8), `name`, optional `resume_url`.
    """
    try:
        code = normalize_req_code_path(req_code)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    req_row = db.execute(select(Requisition).where(Requisition.req_code == code)).scalar_one_or_none()
    if req_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No requisition found for this code",
        )

    company_id = req_row.company_id

    posting = db.execute(
        select(JobPosting).where(
            JobPosting.company_id == company_id,
            JobPosting.requisition_id == req_row.id,
        )
    ).scalar_one_or_none()
    if posting is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No job posting exists for this requisition yet",
        )
    if posting.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This job posting is not open for applications",
        )

    email = str(body.email).strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            id=uuid_str(),
            email=email,
            password_hash=get_password_hash(body.password),
            name=body.name.strip(),
            is_platform_admin=False,
        )
        db.add(user)
        db.flush()
    else:
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials for existing account",
            )

    membership = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    if membership is not None and membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This email is already a staff member for this company; use your HR account instead",
        )
    if membership is None:
        db.add(
            CompanyMembership(
                id=uuid_str(),
                user_id=user.id,
                company_id=company_id,
                role="employee",
                status="active",
                modules_access_json=None,
            )
        )
        db.flush()

    dup = db.execute(
        select(Application.id).where(
            Application.company_id == company_id,
            Application.posting_id == posting.id,
            Application.candidate_user_id == user.id,
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already applied to this job posting",
        )

    resume = (body.resume_url or "").strip() or None
    app_row = Application(
        id=uuid_str(),
        posting_id=posting.id,
        company_id=company_id,
        candidate_user_id=user.id,
        resume_url=resume,
        status="active",
        stage="applied",
    )
    db.add(app_row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="application",
        entity_id=app_row.id,
        action="create",
        changes_json={
            "posting_id": posting.id,
            "stage": "applied",
            "status": "active",
            "via": "public_apply_by_req_code",
            "req_code": code,
            "previous_stage": None,
            "previous_status": None,
        },
    )
    db.commit()
    db.refresh(app_row)
    post_application_pipeline_status(candidate_user_id=user.id, status="applied", job_posting_code=code)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="application.created",
        entity_type="application",
        entity_id=app_row.id,
        actor_user_id=user.id,
        data={
            "posting_id": app_row.posting_id,
            "candidate_user_id": app_row.candidate_user_id,
            "stage": app_row.stage,
            "via": "public_apply_by_req_code",
        },
    )
    token = create_access_token(user.id)
    return PublicApplyByReqCodeResponse(
        application=app_row,
        access_token=token,
        token_type="bearer",
    )
