from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.recruitment import Application, Interview, JobPosting, Offer, Requisition
from app.models.user import User
from app.models.workflow import WorkflowInstance
from app.schemas.recruitment import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdateStage,
    ApplicationWithPostingOut,
    CandidateOfferOut,
    ConvertToEmployeeRequest,
    ConvertToEmployeeResponse,
    HiringCriteria,
    InterviewCreate,
    InterviewOut,
    InterviewUpdate,
    JobPostingCreate,
    JobPostingOut,
    JobPostingPublicOut,
    JobPostingUpdate,
    OfferCreate,
    OfferOut,
    OfferRespond,
    RequisitionCreate,
    RequisitionOut,
    RequisitionUpdate,
)
from app.services.audit import write_audit
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.workflow_engine import create_instance, ensure_default_recruitment_template

router = APIRouter(prefix="/companies/{company_id}/recruitment", tags=["recruitment"])


def _requisition_to_out(req: Requisition) -> RequisitionOut:
    hc: HiringCriteria | None = None
    if req.hiring_criteria_json is not None:
        try:
            hc = HiringCriteria.model_validate(req.hiring_criteria_json)
        except Exception:
            hc = HiringCriteria()
    return RequisitionOut(
        id=req.id,
        company_id=req.company_id,
        created_by=req.created_by,
        department_id=req.department_id,
        job_id=req.job_id,
        headcount=req.headcount,
        status=req.status,
        hiring_criteria=hc,
        approval_chain_json=req.approval_chain_json,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


def _get_requisition_for_company(db: Session, company_id: str, requisition_id: str) -> Requisition:
    r = db.execute(
        select(Requisition).where(Requisition.id == requisition_id, Requisition.company_id == company_id)
    )
    req = r.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
    return req


def _get_posting_for_company(db: Session, company_id: str, posting_id: str) -> JobPosting:
    r = db.execute(select(JobPosting).where(JobPosting.id == posting_id, JobPosting.company_id == company_id))
    posting = r.scalar_one_or_none()
    if posting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job posting not found")
    return posting


def _get_application_for_company(db: Session, company_id: str, application_id: str) -> Application:
    r = db.execute(
        select(Application).where(Application.id == application_id, Application.company_id == company_id)
    )
    app = r.scalar_one_or_none()
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return app


def _get_offer_for_company(db: Session, company_id: str, offer_id: str) -> Offer:
    r = db.execute(select(Offer).where(Offer.id == offer_id, Offer.company_id == company_id))
    offer = r.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return offer


def _get_interview_for_company(db: Session, company_id: str, interview_id: str) -> Interview:
    r = db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.company_id == company_id)
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    return row


def _posting_title_map(db: Session, posting_ids: set[str]) -> dict[str, str]:
    if not posting_ids:
        return {}
    r = db.execute(select(JobPosting).where(JobPosting.id.in_(posting_ids)))
    return {p.id: p.title for p in r.scalars().all()}


def _posting_job_grade_map(db: Session, posting_ids: set[str]) -> dict[str, str | None]:
    """Resolve job catalog grade per posting: posting → requisition → job_catalog.grade."""
    if not posting_ids:
        return {}
    postings = list(db.execute(select(JobPosting).where(JobPosting.id.in_(posting_ids))).scalars().all())
    req_ids = {p.requisition_id for p in postings}
    if not req_ids:
        return {p.id: None for p in postings}
    reqs = {r.id: r for r in db.execute(select(Requisition).where(Requisition.id.in_(req_ids))).scalars().all()}
    job_ids = {r.job_id for r in reqs.values() if r.job_id}
    grades_by_job: dict[str, str | None] = {}
    if job_ids:
        for jc in db.execute(select(JobCatalogEntry).where(JobCatalogEntry.id.in_(job_ids))).scalars().all():
            grades_by_job[jc.id] = jc.grade
    out: dict[str, str | None] = {}
    for p in postings:
        req = reqs.get(p.requisition_id)
        if not req or not req.job_id:
            out[p.id] = None
        else:
            out[p.id] = grades_by_job.get(req.job_id)
    return out


def _user_name_map(db: Session, user_ids: set[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    r = db.execute(select(User).where(User.id.in_(user_ids)))
    return {u.id: u.name for u in r.scalars().all()}


@router.get("/requisitions", response_model=list[RequisitionOut])
def list_requisitions(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RequisitionOut]:
    r = db.execute(select(Requisition).where(Requisition.company_id == company_id).order_by(Requisition.created_at.desc()))
    return [_requisition_to_out(x) for x in r.scalars().all()]


@router.post("/requisitions", response_model=RequisitionOut, status_code=status.HTTP_201_CREATED)
def create_requisition(
    company_id: str,
    body: RequisitionCreate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> RequisitionOut:
    user, _ = ctx
    if body.department_id:
        d = db.execute(
            select(Department).where(Department.id == body.department_id, Department.company_id == company_id)
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    if body.job_id:
        job = db.execute(
            select(JobCatalogEntry).where(JobCatalogEntry.id == body.job_id, JobCatalogEntry.company_id == company_id)
        ).scalar_one_or_none()
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job catalog entry not found")

    hiring_json = body.hiring_criteria.model_dump(mode="json") if body.hiring_criteria else None
    req = Requisition(
        id=uuid_str(),
        company_id=company_id,
        created_by=user.id,
        department_id=body.department_id,
        job_id=body.job_id,
        headcount=body.headcount,
        status="draft",
        hiring_criteria_json=hiring_json,
        approval_chain_json=body.approval_chain_json,
    )
    db.add(req)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="requisition",
        entity_id=req.id,
        action="create",
        changes_json={"headcount": body.headcount},
    )
    db.commit()
    db.refresh(req)
    return _requisition_to_out(req)


@router.patch("/requisitions/{requisition_id}", response_model=RequisitionOut)
def update_requisition(
    company_id: str,
    requisition_id: str,
    body: RequisitionUpdate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> RequisitionOut:
    user, _ = ctx
    req = _get_requisition_for_company(db, company_id, requisition_id)
    data = body.model_dump(exclude_unset=True)
    if "hiring_criteria" in data:
        req.hiring_criteria_json = data.pop("hiring_criteria")
    prev_status = req.status
    if "department_id" in data and data["department_id"]:
        d = db.execute(
            select(Department).where(
                Department.id == data["department_id"], Department.company_id == company_id
            )
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    if "job_id" in data and data["job_id"]:
        job = db.execute(
            select(JobCatalogEntry).where(
                JobCatalogEntry.id == data["job_id"], JobCatalogEntry.company_id == company_id
            )
        ).scalar_one_or_none()
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job catalog entry not found")
    for k, v in data.items():
        setattr(req, k, v)

    if "status" in data and data["status"] in ("submitted", "pending_approval"):
        ex = db.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.company_id == company_id,
                WorkflowInstance.entity_type == "requisition",
                WorkflowInstance.entity_id == requisition_id,
                WorkflowInstance.status == "active",
            )
        ).scalar_one_or_none()
        if ex is None:
            tmpl = ensure_default_recruitment_template(db, company_id)
            create_instance(
                db,
                company_id=company_id,
                template_id=tmpl.id,
                entity_type="requisition",
                entity_id=requisition_id,
                initiated_by=user.id,
            )

    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="requisition",
        entity_id=requisition_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(req)
    if "status" in data and data["status"] in ("submitted", "pending_approval") and prev_status not in (
        "submitted",
        "pending_approval",
    ):
        publish_domain_event_post_commit(
            company_id=company_id,
            event_type="requisition.submitted",
            entity_type="requisition",
            entity_id=requisition_id,
            actor_user_id=user.id,
            data={"status": req.status},
        )
    return _requisition_to_out(req)


@router.get("/postings", response_model=list[JobPostingOut])
def list_job_postings(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    posting_status: str | None = Query(default=None, alias="status"),
) -> list[JobPosting]:
    q = select(JobPosting).where(JobPosting.company_id == company_id).order_by(JobPosting.created_at.desc())
    if posting_status:
        q = q.where(JobPosting.status == posting_status)
    return list(db.execute(q).scalars().all())


@router.patch("/postings/{posting_id}", response_model=JobPostingOut)
def update_job_posting(
    company_id: str,
    posting_id: str,
    body: JobPostingUpdate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> JobPosting:
    user, _ = ctx
    posting = _get_posting_for_company(db, company_id, posting_id)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = str(data["title"]).strip()
    for k, v in data.items():
        setattr(posting, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="job_posting",
        entity_id=posting_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(posting)
    return posting


@router.post("/postings", response_model=JobPostingOut, status_code=status.HTTP_201_CREATED)
def create_job_posting(
    company_id: str,
    body: JobPostingCreate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> JobPosting:
    user, _ = ctx
    _get_requisition_for_company(db, company_id, body.requisition_id)
    posting = JobPosting(
        id=uuid_str(),
        requisition_id=body.requisition_id,
        company_id=company_id,
        title=body.title.strip(),
        description=body.description,
        requirements=body.requirements,
        deadline=body.deadline,
        status="open",
    )
    db.add(posting)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="job_posting",
        entity_id=posting.id,
        action="create",
        changes_json={"title": body.title},
    )
    db.commit()
    db.refresh(posting)
    return posting


# --- Candidate portal (employee role) ---


@router.get("/candidate/open-postings", response_model=list[JobPostingPublicOut])
def list_open_postings_for_candidate(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[JobPosting]:
    _, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can browse the candidate job board",
        )
    r = db.execute(
        select(JobPosting)
        .where(JobPosting.company_id == company_id, JobPosting.status == "open")
        .order_by(JobPosting.created_at.desc())
    )
    return list(r.scalars().all())


@router.get("/candidate/my-applications", response_model=list[ApplicationWithPostingOut])
def list_my_applications(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ApplicationWithPostingOut]:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can view application status",
        )
    apps = list(
        db.execute(
            select(Application)
            .where(Application.company_id == company_id, Application.candidate_user_id == user.id)
            .order_by(Application.applied_at.desc())
        ).scalars().all()
    )
    titles = _posting_title_map(db, {a.posting_id for a in apps})
    return [
        ApplicationWithPostingOut(
            id=a.id,
            posting_id=a.posting_id,
            company_id=a.company_id,
            candidate_user_id=a.candidate_user_id,
            resume_url=a.resume_url,
            status=a.status,
            stage=a.stage,
            notes=a.notes,
            applied_at=a.applied_at,
            updated_at=a.updated_at,
            posting_title=titles.get(a.posting_id),
        )
        for a in apps
    ]


@router.get("/candidate/my-offers", response_model=list[CandidateOfferOut])
def list_my_offers(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[CandidateOfferOut]:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can view offers",
        )
    q = (
        select(Offer, Application)
        .join(Application, Offer.application_id == Application.id)
        .where(Offer.company_id == company_id, Application.candidate_user_id == user.id)
        .order_by(Offer.sent_at.desc())
    )
    rows = db.execute(q).all()
    posting_ids = {app.posting_id for _, app in rows}
    titles = _posting_title_map(db, posting_ids)
    out: list[CandidateOfferOut] = []
    for offer, app in rows:
        out.append(
            CandidateOfferOut(
                id=offer.id,
                application_id=offer.application_id,
                company_id=offer.company_id,
                compensation_json=offer.compensation_json,
                start_date=offer.start_date,
                status=offer.status,
                sent_at=offer.sent_at,
                responded_at=offer.responded_at,
                posting_title=titles.get(app.posting_id),
            )
        )
    return out


@router.get("/candidate/offers/{offer_id}", response_model=CandidateOfferOut)
def get_my_offer(
    company_id: str,
    offer_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CandidateOfferOut:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can view offer details",
        )
    offer = _get_offer_for_company(db, company_id, offer_id)
    app_row = _get_application_for_company(db, company_id, offer.application_id)
    if app_row.candidate_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    titles = _posting_title_map(db, {app_row.posting_id})
    return CandidateOfferOut(
        id=offer.id,
        application_id=offer.application_id,
        company_id=offer.company_id,
        compensation_json=offer.compensation_json,
        start_date=offer.start_date,
        status=offer.status,
        sent_at=offer.sent_at,
        responded_at=offer.responded_at,
        posting_title=titles.get(app_row.posting_id),
    )


@router.get("/candidate/applications/{application_id}/interviews", response_model=list[InterviewOut])
def candidate_list_interviews_for_application(
    company_id: str,
    application_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Interview]:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can view their interview schedule",
        )
    app_row = _get_application_for_company(db, company_id, application_id)
    if app_row.candidate_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    r = db.execute(
        select(Interview)
        .where(Interview.company_id == company_id, Interview.application_id == application_id)
        .order_by(Interview.created_at.asc())
    )
    return list(r.scalars().all())


@router.post("/applications", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def create_application(
    company_id: str,
    body: ApplicationCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Application:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can create job applications",
        )
    posting = _get_posting_for_company(db, company_id, body.posting_id)
    if posting.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This job posting is not open for applications",
        )
    if body.candidate_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate user id must match authenticated user",
        )

    app_row = Application(
        id=uuid_str(),
        posting_id=body.posting_id,
        company_id=company_id,
        candidate_user_id=body.candidate_user_id,
        resume_url=body.resume_url,
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
        changes_json={"posting_id": body.posting_id},
    )
    db.commit()
    db.refresh(app_row)
    return app_row


@router.patch("/applications/{application_id}/stage", response_model=ApplicationOut)
def update_application_stage(
    company_id: str,
    application_id: str,
    body: ApplicationUpdateStage,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> Application:
    user, _ = ctx
    app_row = _get_application_for_company(db, company_id, application_id)
    app_row.stage = body.stage
    app_row.status = body.status
    app_row.notes = body.notes
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="application",
        entity_id=app_row.id,
        action="update_stage",
        changes_json={"stage": body.stage, "status": body.status},
    )
    db.commit()
    db.refresh(app_row)
    return app_row


@router.get("/applications", response_model=list[ApplicationWithPostingOut])
def list_applications(
    company_id: str,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
    stage: str | None = Query(default=None),
) -> list[ApplicationWithPostingOut]:
    q = select(Application).where(Application.company_id == company_id).order_by(Application.applied_at.desc())
    if stage:
        q = q.where(Application.stage == stage)
    apps = list(db.execute(q).scalars().all())
    titles = _posting_title_map(db, {a.posting_id for a in apps})
    grades = _posting_job_grade_map(db, {a.posting_id for a in apps})
    names = _user_name_map(db, {a.candidate_user_id for a in apps})
    return [
        ApplicationWithPostingOut(
            id=a.id,
            posting_id=a.posting_id,
            company_id=a.company_id,
            candidate_user_id=a.candidate_user_id,
            resume_url=a.resume_url,
            status=a.status,
            stage=a.stage,
            notes=a.notes,
            applied_at=a.applied_at,
            updated_at=a.updated_at,
            posting_title=titles.get(a.posting_id),
            candidate_name=names.get(a.candidate_user_id),
            job_grade=grades.get(a.posting_id),
        )
        for a in apps
    ]


@router.get("/offers", response_model=list[OfferOut])
def list_offers(
    company_id: str,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[Offer]:
    r = db.execute(select(Offer).where(Offer.company_id == company_id).order_by(Offer.sent_at.desc()))
    return list(r.scalars().all())


@router.get("/applications/{application_id}/interviews", response_model=list[InterviewOut])
def list_interviews(
    company_id: str,
    application_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Interview]:
    _get_application_for_company(db, company_id, application_id)
    r = db.execute(
        select(Interview)
        .where(Interview.company_id == company_id, Interview.application_id == application_id)
        .order_by(Interview.created_at.asc())
    )
    return list(r.scalars().all())


@router.post(
    "/applications/{application_id}/interviews",
    response_model=InterviewOut,
    status_code=status.HTTP_201_CREATED,
)
def create_interview(
    company_id: str,
    application_id: str,
    body: InterviewCreate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> Interview:
    user, _ = ctx
    _get_application_for_company(db, company_id, application_id)
    row = Interview(
        id=uuid_str(),
        application_id=application_id,
        company_id=company_id,
        scheduled_at=body.scheduled_at,
        panel_json=body.panel_json,
        format=body.format,
        feedback_json=body.feedback_json,
        status=body.status,
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="interview",
        entity_id=row.id,
        action="create",
        changes_json={"application_id": application_id},
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/interviews/{interview_id}", response_model=InterviewOut)
def update_interview(
    company_id: str,
    interview_id: str,
    body: InterviewUpdate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> Interview:
    user, _ = ctx
    row = _get_interview_for_company(db, company_id, interview_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="interview",
        entity_id=interview_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
def create_offer(
    company_id: str,
    body: OfferCreate,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "talent_acquisition"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> Offer:
    user, _ = ctx
    app_row = _get_application_for_company(db, company_id, body.application_id)
    app_row.stage = "offer"
    offer = Offer(
        id=uuid_str(),
        application_id=body.application_id,
        company_id=company_id,
        compensation_json=body.compensation_json,
        start_date=body.start_date,
        status="sent",
    )
    db.add(offer)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="offer",
        entity_id=offer.id,
        action="create",
        changes_json={"application_id": body.application_id},
    )
    db.commit()
    db.refresh(offer)
    return offer


@router.patch("/offers/{offer_id}/respond", response_model=OfferOut)
def respond_offer(
    company_id: str,
    offer_id: str,
    body: OfferRespond,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Offer:
    user, membership = ctx
    if membership.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employee-role users can respond to offers",
        )
    offer = _get_offer_for_company(db, company_id, offer_id)
    app_row = _get_application_for_company(db, company_id, offer.application_id)
    if app_row.candidate_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only respond to your own offer",
        )

    offer.status = body.status
    offer.responded_at = datetime.now(timezone.utc)
    if body.status == "accepted":
        app_row.stage = "hired"
        app_row.status = "accepted"
    elif body.status == "declined":
        app_row.stage = "rejected"
        app_row.status = "declined"
    else:
        app_row.status = "negotiating"

    db.commit()
    db.refresh(offer)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type=f"offer.{body.status}",
        entity_type="offer",
        entity_id=offer_id,
        actor_user_id=user.id,
        data={"application_id": offer.application_id},
    )
    return offer


@router.post("/offers/{offer_id}/convert-to-employee", response_model=ConvertToEmployeeResponse)
def convert_offer_to_employee(
    company_id: str,
    offer_id: str,
    body: ConvertToEmployeeRequest,
    ctx: Annotated[
        tuple[User, CompanyMembership],
        Depends(require_company_roles_path({"company_admin", "hr_ops"})),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> ConvertToEmployeeResponse:
    user, _ = ctx
    offer = _get_offer_for_company(db, company_id, offer_id)
    if offer.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only accepted offers can be converted to employees",
        )
    app_row = _get_application_for_company(db, company_id, offer.application_id)
    existing = db.execute(
        select(Employee).where(Employee.company_id == company_id, Employee.user_id == app_row.candidate_user_id)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee already exists for this user")

    if body.department_id:
        d = db.execute(
            select(Department).where(Department.id == body.department_id, Department.company_id == company_id)
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    if body.job_id:
        job = db.execute(
            select(JobCatalogEntry).where(JobCatalogEntry.id == body.job_id, JobCatalogEntry.company_id == company_id)
        ).scalar_one_or_none()
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job catalog entry not found")
    if body.location_id:
        loc = db.execute(
            select(Location).where(Location.id == body.location_id, Location.company_id == company_id)
        ).scalar_one_or_none()
        if loc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    employee = Employee(
        id=uuid_str(),
        company_id=company_id,
        user_id=app_row.candidate_user_id,
        employee_code=body.employee_code.strip(),
        department_id=body.department_id,
        job_id=body.job_id,
        manager_id=body.manager_id,
        location_id=body.location_id,
        status="active",
        hire_date=body.hire_date or offer.start_date,
        personal_info_json=body.personal_info_json or {},
        documents_json={},
    )
    db.add(employee)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=employee.id,
        action="create_from_offer",
        changes_json={"offer_id": offer_id, "application_id": app_row.id},
    )
    db.commit()
    return ConvertToEmployeeResponse(
        application_id=app_row.id,
        offer_id=offer_id,
        employee_id=employee.id,
        message="Candidate converted to employee successfully.",
    )
