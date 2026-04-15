import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.certification import CertProgress, Certificate, CertTrack
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog
from app.models.user import User
from app.scoring_rules import (
    PROGRESS_ELIGIBLE_MIN_SCORE,
    PROGRESS_MODULES,
    PROGRESS_REQUIRED_ACTIONS,
)
from app.schemas.certification import (
    CertificationProgressDashboardOut,
    CertificateIssueRequest,
    CertificateOut,
    CertProgressOut,
    CertProgressUpsert,
    CertTrackCreate,
    CertTrackOut,
    ProgressDimensionOut,
    ProgressModuleOut,
    ProgressRecentActionOut,
)
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.certification_rules import validate_certificate_issuance
from app.services.integration_hooks import publish_domain_event_post_commit

router = APIRouter(prefix="/companies/{company_id}/certification", tags=["certification"])


@router.post("/tracks", response_model=CertTrackOut, status_code=status.HTTP_201_CREATED)
def create_cert_track(
    company_id: str,
    body: CertTrackCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> CertTrack:
    user, _ = ctx
    row = CertTrack(
        id=uuid_str(),
        company_id=company_id,
        role_type=body.role_type.strip(),
        level=body.level.strip(),
        name=body.name.strip(),
        requirements_json=body.requirements_json,
        min_score=body.min_score,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="cert_track", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/tracks", response_model=list[CertTrackOut])
def list_cert_tracks(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[CertTrack]:
    r = db.execute(select(CertTrack).where(CertTrack.company_id == company_id).order_by(CertTrack.name))
    return list(r.scalars().all())


def _get_or_create_progress(db: Session, company_id: str, user_id: str, track_id: str) -> CertProgress:
    r = db.execute(
        select(CertProgress).where(
            CertProgress.company_id == company_id,
            CertProgress.user_id == user_id,
            CertProgress.track_id == track_id,
        )
    )
    row = r.scalar_one_or_none()
    if row:
        return row
    row = CertProgress(
        id=uuid_str(),
        track_id=track_id,
        company_id=company_id,
        user_id=user_id,
        completed_actions_json={},
        current_score=None,
        status="in_progress",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/progress/me", response_model=CertProgressOut)
def get_my_cert_progress(
    company_id: str,
    track_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CertProgress:
    user, _ = ctx
    t = db.execute(select(CertTrack).where(CertTrack.id == track_id, CertTrack.company_id == company_id)).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return _get_or_create_progress(db, company_id, user.id, track_id)


@router.put("/progress/me", response_model=CertProgressOut)
def upsert_my_cert_progress(
    company_id: str,
    track_id: str,
    body: CertProgressUpsert,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CertProgress:
    user, _ = ctx
    t = db.execute(select(CertTrack).where(CertTrack.id == track_id, CertTrack.company_id == company_id)).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    row = _get_or_create_progress(db, company_id, user.id, track_id)
    data = body.model_dump(exclude_unset=True)
    if "completed_actions_json" in data:
        row.completed_actions_json = data["completed_actions_json"]
    if "current_score" in data:
        row.current_score = data["current_score"]
    if "status" in data and data["status"]:
        row.status = data["status"]
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="cert_progress", entity_id=row.id, action="upsert", changes_json=data)
    db.commit()
    db.refresh(row)
    return row


@router.get("/progress/me/dashboard", response_model=CertificationProgressDashboardOut)
def get_my_progress_dashboard(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    recent_limit: int = 15,
) -> CertificationProgressDashboardOut:
    user, _ = ctx
    logs = db.execute(
        select(ActivityLog)
        .where(
            ActivityLog.company_id == company_id,
            ActivityLog.user_id == user.id,
            ActivityLog.module.in_(tuple(PROGRESS_MODULES.keys())),
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(5000)
    ).scalars().all()

    scores = [float(x.quality_score) for x in logs if x.quality_score is not None]

    def _avg(vals: list[float]) -> float | None:
        return round(sum(vals) / len(vals), 2) if vals else None

    dim_vals: dict[str, list[float]] = {
        "completeness": [],
        "accuracy": [],
        "timeliness": [],
        "process_adherence": [],
    }
    for row in logs:
        qf = row.quality_factors_json
        if not isinstance(qf, dict):
            continue
        for k in dim_vals:
            v = qf.get(k)
            if isinstance(v, (int, float)):
                dim_vals[k].append(float(v))

    by_module: dict[str, list[ActivityLog]] = {m: [] for m in PROGRESS_MODULES}
    for row in logs:
        if row.module in by_module:
            by_module[row.module].append(row)

    module_breakdown: list[ProgressModuleOut] = []
    for mod, label in PROGRESS_MODULES.items():
        mod_logs = by_module.get(mod, [])
        mod_scores = [float(x.quality_score) for x in mod_logs if x.quality_score is not None]
        module_breakdown.append(
            ProgressModuleOut(
                module=mod,
                label=label,
                action_count=len(mod_logs),
                avg_score=_avg(mod_scores),
            )
        )

    seen_actions = {f"{x.module}:{x.action_type}" for x in logs}
    completed_required = sum(1 for a in PROGRESS_REQUIRED_ACTIONS if a in seen_actions)
    missing_required = [a for a in PROGRESS_REQUIRED_ACTIONS if a not in seen_actions]
    critical_failure_count = sum(
        1
        for x in logs
        if isinstance(x.context_json, dict) and bool(x.context_json.get("critical_failure"))
    )

    overall = _avg(scores)
    if not logs:
        status = "not_started"
    elif critical_failure_count > 0:
        status = "failed"
    elif (
        completed_required == len(PROGRESS_REQUIRED_ACTIONS)
        and overall is not None
        and overall >= PROGRESS_ELIGIBLE_MIN_SCORE
    ):
        status = "eligible_for_assessment"
    else:
        status = "in_progress"

    recent_actions = [
        ProgressRecentActionOut(
            id=x.id,
            occurred_at=x.created_at,
            module=x.module,
            action_type=x.action_type,
            action_detail=x.action_detail,
            score=float(x.quality_score) if x.quality_score is not None else None,
        )
        for x in logs[: max(1, min(recent_limit, 50))]
    ]

    return CertificationProgressDashboardOut(
        overall_score=overall,
        action_count=len(logs),
        dimension_averages=ProgressDimensionOut(
            completeness=_avg(dim_vals["completeness"]),
            accuracy=_avg(dim_vals["accuracy"]),
            timeliness=_avg(dim_vals["timeliness"]),
            process_adherence=_avg(dim_vals["process_adherence"]),
        ),
        module_breakdown=module_breakdown,
        required_actions_total=len(PROGRESS_REQUIRED_ACTIONS),
        required_actions_completed=completed_required,
        missing_required_actions=missing_required,
        critical_failure_count=critical_failure_count,
        status=status,
        recent_actions=recent_actions,
    )


@router.post("/certificates/issue", response_model=CertificateOut, status_code=status.HTTP_201_CREATED)
def issue_certificate(
    company_id: str,
    body: CertificateIssueRequest,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Certificate:
    user, membership = ctx
    track = db.execute(
        select(CertTrack).where(CertTrack.id == body.track_id, CertTrack.company_id == company_id)
    ).scalar_one_or_none()
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    target_user_id = body.target_user_id or user.id
    if body.target_user_id and membership.role != "company_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only company admin can issue for another user")

    issuer_is_company_admin = membership.role == "company_admin"
    validate_certificate_issuance(
        db,
        company_id=company_id,
        track=track,
        target_user_id=target_user_id,
        proposed_score=body.score,
        issuer_is_company_admin=issuer_is_company_admin,
    )

    verification_id = uuid.uuid4().hex
    cert = Certificate(
        id=uuid_str(),
        track_id=body.track_id,
        company_id=company_id,
        user_id=target_user_id,
        level=body.level,
        score=body.score,
        breakdown_json=body.breakdown_json,
        verification_id=verification_id,
    )
    db.add(cert)
    prog = db.execute(
        select(CertProgress).where(
            CertProgress.track_id == body.track_id,
            CertProgress.company_id == company_id,
            CertProgress.user_id == target_user_id,
        )
    ).scalar_one_or_none()
    prog_started = prog.started_at if prog else None
    if prog:
        prog.status = "completed"
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="certificate", entity_id=cert.id, action="issue", changes_json={})
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="certification",
        action_type="issue",
        action_detail="issue_certificate",
        entity_type="certificate",
        entity_id=cert.id,
        reference_started_at=prog_started,
    )
    db.commit()
    db.refresh(cert)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="certificate.issued",
        entity_type="certificate",
        entity_id=cert.id,
        actor_user_id=user.id,
        data={"user_id": target_user_id, "track_id": body.track_id, "verification_id": cert.verification_id},
    )
    return cert


@router.get("/certificates/{certificate_id}/pdf")
def certificate_pdf_placeholder(
    company_id: str,
    certificate_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Contract placeholder until a PDF renderer is integrated."""
    user, membership = ctx
    c = db.execute(
        select(Certificate).where(
            Certificate.id == certificate_id,
            Certificate.company_id == company_id,
        )
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    if c.user_id != user.id and membership.role != "company_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view this certificate")
    return {
        "status": "not_implemented",
        "message": "PDF generation is not wired yet. Use verification_id for external rendering.",
        "certificate_id": certificate_id,
        "verification_id": c.verification_id,
        "suggested_url": f"/api/v1/companies/{company_id}/certification/certificates/verify/{c.verification_id}",
    }


@router.get("/certificates/verify/{verification_id}", response_model=CertificateOut)
def verify_certificate(
    company_id: str,
    verification_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> Certificate:
    r = db.execute(
        select(Certificate).where(
            Certificate.verification_id == verification_id,
            Certificate.company_id == company_id,
        )
    )
    cert = r.scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return cert


@router.get("/certificates/me", response_model=list[CertificateOut])
def list_my_certificates(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Certificate]:
    user, _ = ctx
    r = db.execute(
        select(Certificate)
        .where(Certificate.company_id == company_id, Certificate.user_id == user.id)
        .order_by(Certificate.issued_at.desc())
    )
    return list(r.scalars().all())
