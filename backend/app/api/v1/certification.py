import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.certification import CertProgress, Certificate, CertTrack
from app.models.company import Company
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog
from app.models.user import User
from app.scoring_rules import (
    CERT_DEFAULT_MIN_SCORE,
    CERT_DEFAULT_MIN_TASKS_PER_MODULE,
    CERT_MIN_SCORE_BY_ROLE,
    CERT_MIN_TASKS_PER_MODULE_BY_ROLE,
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
    ModuleTaskProgressOut,
    ProgressDimensionOut,
    ProgressModuleOut,
    ProgressRecentActionOut,
)
from app.config import settings
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.certification_rules import validate_certificate_issuance
from app.services.certificate_logo import resolve_certificate_logo_path
from app.services.certificate_pdf import render_certificate_pdf
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
    user, membership = ctx
    role = membership.role
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

    min_tasks_map = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role) or CERT_MIN_TASKS_PER_MODULE_BY_ROLE["employee"]
    tasks_by_module = Counter(x.module for x in logs)
    module_task_progress: list[ModuleTaskProgressOut] = [
        ModuleTaskProgressOut(module=mod, required=int(req), completed=int(tasks_by_module.get(mod, 0)))
        for mod, req in min_tasks_map.items()
    ]
    required_actions_total = sum(int(v) for v in min_tasks_map.values())
    required_actions_completed = sum(
        min(tasks_by_module.get(mod, 0), int(req)) for mod, req in min_tasks_map.items()
    )
    missing_required.extend(
        [
            f"{mod} ({tasks_by_module.get(mod, 0)}/{req})"
            for mod, req in min_tasks_map.items()
            if tasks_by_module.get(mod, 0) < int(req)
        ]
    )

    overall = _avg(scores)
    track = db.execute(
        select(CertTrack)
        .where(CertTrack.company_id == company_id, CertTrack.role_type == role)
        .order_by(CertTrack.created_at.desc())
    ).scalars().first()

    pending_cert = None
    approved_cert = None
    if track:
        pending_cert = db.execute(
            select(Certificate).where(
                Certificate.company_id == company_id,
                Certificate.user_id == user.id,
                Certificate.track_id == track.id,
                Certificate.approval_status == "pending_approval",
            )
        ).scalar_one_or_none()
        approved_cert = db.execute(
            select(Certificate).where(
                Certificate.company_id == company_id,
                Certificate.user_id == user.id,
                Certificate.track_id == track.id,
                Certificate.approval_status == "approved",
            )
        ).scalar_one_or_none()

    role_min = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    effective_min = float(role_min)
    if track is not None:
        effective_min = max(effective_min, float(track.min_score))

    modules_ok = all(tasks_by_module.get(mod, 0) >= int(req) for mod, req in min_tasks_map.items())
    score_ok = overall is not None and overall >= effective_min

    if not logs:
        dash_status = "not_started"
    elif critical_failure_count > 0:
        dash_status = "failed"
    elif approved_cert is not None:
        dash_status = "completed"
    elif pending_cert is not None:
        dash_status = "pending_approval"
    elif modules_ok and score_ok:
        dash_status = "eligible_for_assessment"
    else:
        dash_status = "in_progress"

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
        required_actions_total=required_actions_total,
        required_actions_completed=required_actions_completed,
        missing_required_actions=missing_required,
        module_task_progress=module_task_progress,
        critical_failure_count=critical_failure_count,
        status=dash_status,
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
        approval_status="pending_approval",
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
        prog.status = "pending_approval"
        db.add(prog)
    db.flush()
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


@router.get("/certificates/pending", response_model=list[CertificateOut])
def list_pending_certificates(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> list[Certificate]:
    r = db.execute(
        select(Certificate)
        .where(
            Certificate.company_id == company_id,
            Certificate.approval_status == "pending_approval",
        )
        .order_by(Certificate.issued_at.desc())
    )
    return list(r.scalars().all())


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


@router.get("/certificates/{certificate_id}/pdf")
def certificate_pdf_download(
    company_id: str,
    certificate_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
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
    if c.approval_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PDF is available after the certificate is approved",
        )
    holder = db.execute(select(User).where(User.id == c.user_id)).scalar_one_or_none()
    company = db.execute(select(Company).where(Company.id == c.company_id)).scalar_one_or_none()
    track = db.execute(select(CertTrack).where(CertTrack.id == c.track_id)).scalar_one_or_none()

    issued = c.issued_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    logo_path = (
        resolve_certificate_logo_path(company=company, upload_dir=Path(settings.upload_dir))
        if company
        else None
    )
    pdf_bytes = render_certificate_pdf(
        recipient_name=holder.name if holder else "Recipient",
        company_name=company.name if company else "Company",
        track_name=track.name if track else "Certification",
        level=c.level,
        score=float(c.score),
        verification_id=c.verification_id,
        issued_at_label=issued,
        logo_path=logo_path,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="certificate-{c.verification_id[:8]}.pdf"'},
    )


@router.post("/certificates/{certificate_id}/approve", response_model=CertificateOut)
def approve_certificate(
    company_id: str,
    certificate_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> Certificate:
    admin_user, _ = ctx
    cert = db.execute(
        select(Certificate).where(
            Certificate.id == certificate_id,
            Certificate.company_id == company_id,
        )
    ).scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    if cert.approval_status == "approved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Certificate already approved")
    cert.approval_status = "approved"
    prog = db.execute(
        select(CertProgress).where(
            CertProgress.track_id == cert.track_id,
            CertProgress.company_id == company_id,
            CertProgress.user_id == cert.user_id,
        )
    ).scalar_one_or_none()
    if prog:
        prog.status = "completed"
        db.add(prog)
    db.add(cert)
    write_audit(
        db,
        company_id=company_id,
        user_id=admin_user.id,
        entity_type="certificate",
        entity_id=cert.id,
        action="approve",
        changes_json={},
    )
    db.commit()
    db.refresh(cert)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="certificate.approved",
        entity_type="certificate",
        entity_id=cert.id,
        actor_user_id=admin_user.id,
        data={"user_id": cert.user_id, "track_id": cert.track_id, "verification_id": cert.verification_id},
    )
    return cert
