from __future__ import annotations

from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import Select, false, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.config import settings
from app.database import get_db
from app.models.audit import AuditTrailEntry
from app.models.base import uuid_str
from app.models.inbox import InboxTask
from app.models.membership import CompanyMembership
from app.models.policy import PolicyAcknowledgment, PolicyDocument
from app.models.tracking import ActivityLog
from app.models.user import User
from app.schemas.audits import (
    AuditCategoryOption,
    MemberSearchHit,
    PolicyAckDetailResponse,
    PolicyAckMemberOut,
    PolicyDocumentOut,
    TrailEntryOut,
)
from app.services.activity_log import coerce_utc
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.audit_categories import (
    ALL_KNOWN_ACTIVITY_MODULES,
    ALL_KNOWN_AUDIT_ENTITY_TYPES,
    classify,
    get_category_def,
    list_category_options,
)

router = APIRouter(prefix="/companies/{company_id}/audits", tags=["audits"])

_HR = frozenset(
    {
        "company_admin",
        "talent_acquisition",
        "hr_ops",
        "ld_performance",
        "compensation_analytics",
    }
)


def _is_hr(role: str) -> bool:
    return role in _HR


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _day_end(d: date) -> datetime:
    return datetime.combine(d, time.max, tzinfo=timezone.utc)


def _target_user_id(
    membership: CompanyMembership,
    current_user_id: str,
    requested: str | None,
) -> str | None:
    """HR may pass user_id; employees are always scoped to self. Returns None if HR has not selected anyone."""
    if _is_hr(membership.role):
        return requested
    if requested and requested != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own audit trail")
    return current_user_id


@router.get("/members/search", response_model=list[MemberSearchHit])
def search_company_members(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    q: str = Query(min_length=4, max_length=200),
) -> list[MemberSearchHit]:
    _, membership = ctx
    if not _is_hr(membership.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required to search members")
    pattern = f"%{q.lower()}%"
    stmt = (
        select(User)
        .join(CompanyMembership, CompanyMembership.user_id == User.id)
        .where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
            or_(
                func.lower(User.email).like(pattern),
                func.lower(User.name).like(pattern),
                User.id.contains(q),
            ),
        )
        .order_by(User.name)
        .limit(25)
    )
    rows = db.execute(stmt).scalars().all()
    return [MemberSearchHit(user_id=u.id, name=u.name, email=u.email) for u in rows]


@router.get("/trail/categories", response_model=list[AuditCategoryOption])
def list_trail_categories() -> list[AuditCategoryOption]:
    return [AuditCategoryOption(id=i, label=lab) for i, lab in list_category_options()]


@router.get("/trail", response_model=list[TrailEntryOut])
def list_audit_trail(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    user_id: str | None = Query(default=None),
    category: str | None = Query(default=None, max_length=64),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=200, le=500),
) -> list[TrailEntryOut]:
    user, membership = ctx
    target = _target_user_id(membership, user.id, user_id)
    if target is None:
        return []

    aq: Select = select(ActivityLog).where(ActivityLog.company_id == company_id, ActivityLog.user_id == target)
    bq: Select = select(AuditTrailEntry).where(
        AuditTrailEntry.company_id == company_id,
        AuditTrailEntry.user_id == target,
    )

    if category:
        cat_def = get_category_def(category)
        if cat_def is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category")
        if category == "other":
            if ALL_KNOWN_ACTIVITY_MODULES:
                aq = aq.where(~ActivityLog.module.in_(ALL_KNOWN_ACTIVITY_MODULES))
            if ALL_KNOWN_AUDIT_ENTITY_TYPES:
                bq = aq.where(~AuditTrailEntry.entity_type.in_(ALL_KNOWN_AUDIT_ENTITY_TYPES))
        else:
            mods = cat_def.activity_modules
            ents = cat_def.audit_entity_types
            aq = aq.where(ActivityLog.module.in_(mods)) if mods else aq.where(false())
            bq = bq.where(AuditTrailEntry.entity_type.in_(ents)) if ents else bq.where(false())

    acts = list(db.execute(aq.order_by(ActivityLog.created_at.desc()).limit(500)).scalars().all())

    audits = list(db.execute(bq.order_by(AuditTrailEntry.timestamp.desc()).limit(500)).scalars().all())

    if from_date:
        fd = _day_start(from_date)
        acts = [
            a
            for a in acts
            if a.created_at is not None and coerce_utc(a.created_at) >= fd
        ]
        audits = [
            x
            for x in audits
            if x.timestamp is not None and coerce_utc(x.timestamp) >= fd
        ]
    if to_date:
        td = _day_end(to_date)
        acts = [a for a in acts if a.created_at is not None and coerce_utc(a.created_at) <= td]
        audits = [x for x in audits if x.timestamp is not None and coerce_utc(x.timestamp) <= td]

    out: list[TrailEntryOut] = []
    for a in acts:
        cid, clab = classify("activity", a.module)
        out.append(
            TrailEntryOut(
                source="activity",
                id=a.id,
                at=a.created_at,
                user_id=a.user_id,
                category=cid,
                category_label=clab,
                screen=a.module,
                action=a.action_type,
                detail=a.action_detail,
                extra=a.context_json,
            )
        )
    for x in audits:
        cid, clab = classify("audit", x.entity_type)
        out.append(
            TrailEntryOut(
                source="audit",
                id=x.id,
                at=x.timestamp,
                user_id=x.user_id or target,
                category=cid,
                category_label=clab,
                screen=x.entity_type,
                action=x.action,
                extra=x.changes_json,
            )
        )
    out.sort(key=lambda e: coerce_utc(e.at), reverse=True)
    return out[:limit]


def _upload_root() -> Path:
    return Path(settings.upload_dir).resolve()


def _member_count(db: Session, company_id: str) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(CompanyMembership)
            .where(CompanyMembership.company_id == company_id, CompanyMembership.status == "active")
        ).scalar()
        or 0
    )


@router.get("/policies", response_model=list[PolicyDocumentOut])
def list_policies(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PolicyDocumentOut]:
    user, membership = ctx
    is_hr = _is_hr(membership.role)
    rows = list(
        db.execute(
            select(PolicyDocument).where(PolicyDocument.company_id == company_id).order_by(PolicyDocument.created_at.desc())
        ).scalars().all()
    )
    mc = _member_count(db, company_id)
    out: list[PolicyDocumentOut] = []
    for p in rows:
        ack_n = int(
            db.execute(
                select(func.count()).select_from(PolicyAcknowledgment).where(PolicyAcknowledgment.policy_id == p.id)
            ).scalar()
            or 0
        )
        ack_me = (
            db.execute(
                select(PolicyAcknowledgment).where(
                    PolicyAcknowledgment.policy_id == p.id,
                    PolicyAcknowledgment.user_id == user.id,
                )
            ).scalar_one_or_none()
            is not None
        )
        out.append(
            PolicyDocumentOut(
                id=p.id,
                company_id=p.company_id,
                title=p.title,
                description=p.description,
                file_name=p.file_name,
                created_by=p.created_by,
                created_at=p.created_at,
                acknowledgment_count=ack_n if is_hr else None,
                member_count=mc if is_hr else None,
                acknowledged_by_me=ack_me,
            )
        )
    return out


@router.get("/policies/{policy_id}/acknowledgment-detail", response_model=PolicyAckDetailResponse)
def policy_acknowledgment_detail(
    company_id: str,
    policy_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = Query(default=None, max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PolicyAckDetailResponse:
    pol = db.execute(
        select(PolicyDocument).where(PolicyDocument.id == policy_id, PolicyDocument.company_id == company_id)
    ).scalar_one_or_none()
    if pol is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    qs = (q or "").strip()
    if len(qs) < 4:
        return PolicyAckDetailResponse(items=[], total=0, offset=offset, limit=limit)

    pattern = f"%{qs.lower()}%"
    user_filter = or_(
        func.lower(User.email).like(pattern),
        func.lower(User.name).like(pattern),
        User.id.contains(qs),
    )
    base_where = (
        CompanyMembership.company_id == company_id,
        CompanyMembership.status == "active",
        user_filter,
    )

    count_stmt = (
        select(func.count())
        .select_from(User)
        .join(CompanyMembership, CompanyMembership.user_id == User.id)
        .outerjoin(
            PolicyAcknowledgment,
            (PolicyAcknowledgment.user_id == User.id) & (PolicyAcknowledgment.policy_id == policy_id),
        )
        .where(*base_where)
    )
    total = int(db.execute(count_stmt).scalar() or 0)

    data_stmt = (
        select(User.id, User.name, User.email, PolicyAcknowledgment.acknowledged_at)
        .join(CompanyMembership, CompanyMembership.user_id == User.id)
        .outerjoin(
            PolicyAcknowledgment,
            (PolicyAcknowledgment.user_id == User.id) & (PolicyAcknowledgment.policy_id == policy_id),
        )
        .where(*base_where)
        .order_by(User.name)
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(data_stmt).all()

    items = [
        PolicyAckMemberOut(
            user_id=uid,
            name=name,
            email=email,
            acknowledged=ack_at is not None,
            acknowledged_at=ack_at,
        )
        for uid, name, email, ack_at in rows
    ]
    return PolicyAckDetailResponse(items=items, total=total, offset=offset, limit=limit)


@router.post("/policies", response_model=PolicyDocumentOut)
async def create_policy(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
    title: str = Form(..., min_length=1, max_length=255),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> PolicyDocument:
    user, membership = ctx
    policy_id = uuid_str()
    orig_name = file.filename or "policy.pdf"
    suffix = Path(orig_name).suffix or ".pdf"
    safe_dir = _upload_root() / "policies" / company_id
    safe_dir.mkdir(parents=True, exist_ok=True)
    rel = f"policies/{company_id}/{policy_id}{suffix}"
    dest = _upload_root() / rel
    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 25MB)")
    dest.write_bytes(contents)

    row = PolicyDocument(
        id=policy_id,
        company_id=company_id,
        title=title.strip(),
        description=description.strip() if description else None,
        file_name=orig_name,
        stored_path=rel,
        created_by=user.id,
    )
    db.add(row)
    db.flush()

    memberships = db.execute(
        select(CompanyMembership.user_id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
        )
    ).scalars().all()
    for uid in memberships:
        t = InboxTask(
            id=uuid_str(),
            company_id=company_id,
            user_id=uid,
            type="policy_ack_required",
            title=f"Acknowledge policy: {row.title}",
            entity_type="policy_document",
            entity_id=row.id,
            priority="high",
            status="open",
            context_json={
                "policy_title": row.title,
                "policy_id": row.id,
            },
        )
        db.add(t)

    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="compliance",
        action_type="policy_created",
        action_detail=row.title[:250],
        entity_type="policy_document",
        entity_id=row.id,
        reference_started_at=None,
    )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="policy_document",
        entity_id=row.id,
        action="create",
        changes_json={"title": row.title},
    )
    db.commit()
    db.refresh(row)

    mc = _member_count(db, company_id)
    return PolicyDocumentOut(
        id=row.id,
        company_id=row.company_id,
        title=row.title,
        description=row.description,
        file_name=row.file_name,
        created_by=row.created_by,
        created_at=row.created_at,
        acknowledgment_count=0,
        member_count=mc,
        acknowledged_by_me=False,
    )


@router.get("/policies/{policy_id}/download")
def download_policy(
    company_id: str,
    policy_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    row = db.execute(
        select(PolicyDocument).where(PolicyDocument.id == policy_id, PolicyDocument.company_id == company_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    path = _upload_root() / row.stored_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on server")
    return FileResponse(
        path=str(path),
        filename=row.file_name,
        media_type="application/octet-stream",
    )


@router.post("/policies/{policy_id}/acknowledge", response_model=PolicyDocumentOut)
def acknowledge_policy(
    company_id: str,
    policy_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> PolicyDocumentOut:
    user, membership = ctx
    row = db.execute(
        select(PolicyDocument).where(PolicyDocument.id == policy_id, PolicyDocument.company_id == company_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    existing = db.execute(
        select(PolicyAcknowledgment).where(
            PolicyAcknowledgment.policy_id == policy_id,
            PolicyAcknowledgment.user_id == user.id,
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            PolicyAcknowledgment(
                id=uuid_str(),
                policy_id=policy_id,
                company_id=company_id,
                user_id=user.id,
            )
        )

    inbox_rows = db.execute(
        select(InboxTask).where(
            InboxTask.company_id == company_id,
            InboxTask.user_id == user.id,
            InboxTask.entity_type == "policy_document",
            InboxTask.entity_id == policy_id,
            InboxTask.status == "open",
        )
    ).scalars().all()
    for t in inbox_rows:
        t.status = "done"

    if existing is None:
        log_tracked_hr_action(
            db,
            company_id=company_id,
            user_id=user.id,
            role=membership.role,
            module="compliance",
            action_type="policy_acknowledged",
            action_detail=row.title[:250],
            entity_type="policy_document",
            entity_id=row.id,
            reference_started_at=row.created_at,
        )
        write_audit(
            db,
            company_id=company_id,
            user_id=user.id,
            entity_type="policy_acknowledgment",
            entity_id=policy_id,
            action="acknowledge",
            changes_json={"policy_title": row.title},
        )
    db.commit()
    db.refresh(row)

    is_hr = _is_hr(membership.role)
    mc = _member_count(db, company_id)
    ack_n = int(
        db.execute(
            select(func.count()).select_from(PolicyAcknowledgment).where(PolicyAcknowledgment.policy_id == policy_id)
        ).scalar()
        or 0
    )
    return PolicyDocumentOut(
        id=row.id,
        company_id=row.company_id,
        title=row.title,
        description=row.description,
        file_name=row.file_name,
        created_by=row.created_by,
        created_at=row.created_at,
        acknowledgment_count=ack_n if is_hr else None,
        member_count=mc if is_hr else None,
        acknowledged_by_me=True,
    )
