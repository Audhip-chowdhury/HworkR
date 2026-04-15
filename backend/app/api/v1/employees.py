from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.config import settings
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.lifecycle import EmployeeLifecycleEvent
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.user import User
from app.models.employee_document import EmployeeDocument
from app.schemas.employees import (
    EmployeeCreate,
    EmployeeDetailOut,
    EmployeeDocumentOut,
    EmployeeDocumentPatch,
    EmployeeOut,
    EmployeeSelfUpdate,
    EmployeeSummaryOut,
    EmployeeUpdate,
    LifecycleEventCreate,
    LifecycleEventOut,
    OnboardingChecklistUpdate,
)
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.employee_detail import display_name_and_email, load_employee_documents, resolve_org_labels
from app.services.employee_document_files import save_employee_document_file
from app.services.employee_document_sync import (
    OPTIONAL_DOC_TYPES,
    PRIMARY_DOCUMENT_TASK_TYPES,
    ensure_default_document_rows,
    ensure_optional_document_row,
    mark_document_missing,
    mark_document_submitted,
    sync_document_inbox_tasks,
)
from app.services.profile_inbox_sync import (
    _needs_address,
    _needs_emergency,
    _needs_phone,
    sync_profile_inbox_tasks,
)
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.integration_hooks import publish_domain_event_post_commit

router = APIRouter(prefix="/companies/{company_id}/employees", tags=["employees"])

_HR_ROLES = frozenset({"company_admin", "hr_ops"})
_HR_OR_BROADER = frozenset(
    {"company_admin", "hr_ops", "talent_acquisition", "ld_performance", "compensation_analytics"}
)
_DOC_TYPES = frozenset({"photo", "gov_id", "gov_id_2", "offer_letter"})

# Primary docs: employees may upload until submitted; then HR must replace.
_PRIMARY_SELF_SERVICE = frozenset({"photo", "gov_id", "offer_letter"})


def _profile_quality_factors(personal_info_json: dict | None) -> dict[str, float]:
    info = personal_info_json or {}
    phone = str(info.get("phone") or "").strip()
    address = str(info.get("address") or "").strip()
    emergency = info.get("emergencyContacts")
    has_emergency = isinstance(emergency, list) and len(emergency) > 0
    completeness = 60.0
    if phone:
        completeness += 15.0
    if address:
        completeness += 15.0
    if has_emergency:
        completeness += 10.0
    return {
        "completeness": min(100.0, completeness),
        "accuracy": 90.0 if phone else 82.0,
        "process_adherence": 92.0 if has_emergency else 85.0,
    }


def _checklist_completion_rate(checklist: dict | None) -> float:
    if not isinstance(checklist, dict):
        return 0.0
    vals = [v for v in checklist.values() if isinstance(v, bool)]
    if not vals:
        return 0.0
    completed = sum(1 for v in vals if v)
    return (completed / len(vals)) * 100.0


def _log_profile_reminder_completed(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    role: str | None,
    employee_id: str,
    field: str,
) -> None:
    write_audit(
        db,
        company_id=company_id,
        user_id=user_id,
        entity_type="employee",
        entity_id=employee_id,
        action=f"profile_{field}_completed",
        changes_json={"field": field},
    )
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user_id,
        role=role,
        module="employees",
        action_type="profile_reminder_resolved",
        action_detail=field,
        entity_type="employee",
        entity_id=employee_id,
        extra_context={"field": field},
        quality_factors={
            "completeness": 98.0,
            "accuracy": 95.0,
            "process_adherence": 94.0,
        },
    )


def _to_detail_out(db: Session, company_id: str, emp: Employee) -> EmployeeDetailOut:
    u = db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none() if emp.user_id else None
    dn, de = display_name_and_email(emp, u)
    dept_name, job_title, job_grade, mgr_name, loc_name = resolve_org_labels(db, company_id, emp)
    base = EmployeeOut.model_validate(emp)
    docs = load_employee_documents(db, emp.id)
    return EmployeeDetailOut(
        **base.model_dump(),
        display_name=dn,
        display_email=de,
        department_name=dept_name,
        job_title=job_title,
        job_grade=job_grade,
        manager_name=mgr_name,
        location_name=loc_name,
        documents=[EmployeeDocumentOut.model_validate(d) for d in docs],
    )


def _patch_employee_document(
    db: Session,
    company_id: str,
    employee_id: str,
    doc_type: str,
    body: EmployeeDocumentPatch,
    actor_user_id: str,
) -> EmployeeDocument:
    if doc_type not in _DOC_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid doc_type")
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    docs_before = load_employee_documents(db, employee_id)
    prim_before = [d for d in docs_before if d.doc_type in PRIMARY_DOCUMENT_TASK_TYPES]
    all_primary_complete_before = (
        len(prim_before) >= 3 and all(d.status == "submitted" for d in prim_before)
    )
    ensure_default_document_rows(db, company_id, employee_id)
    doc = db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.employee_id == employee_id,
            EmployeeDocument.doc_type == doc_type,
        )
    ).scalar_one_or_none()
    if doc is None and doc_type in OPTIONAL_DOC_TYPES:
        doc = ensure_optional_document_row(db, company_id, employee_id, doc_type)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("status") == "submitted":
        mark_document_submitted(
            db,
            doc,
            file_url=data.get("file_url"),
            notes=data.get("notes"),
            meta_json=data.get("meta_json"),
        )
    elif data.get("status") == "missing":
        mark_document_missing(db, doc)
        if "file_url" in data:
            doc.file_url = data["file_url"]
        if "notes" in data:
            doc.notes = data["notes"]
    else:
        if "file_url" in data:
            doc.file_url = data["file_url"]
        if "notes" in data:
            doc.notes = data["notes"]
        if "meta_json" in data:
            doc.meta_json = data["meta_json"]
    sync_document_inbox_tasks(db, emp)
    mem = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == actor_user_id,
            CompanyMembership.company_id == company_id,
        )
    ).scalar_one_or_none()
    actor_role = mem.role if mem else None
    docs_after = load_employee_documents(db, employee_id)
    prim_after = [d for d in docs_after if d.doc_type in PRIMARY_DOCUMENT_TASK_TYPES]
    all_primary_complete_after = len(prim_after) >= 3 and all(d.status == "submitted" for d in prim_after)
    if not all_primary_complete_before and all_primary_complete_after:
        write_audit(
            db,
            company_id=company_id,
            user_id=actor_user_id,
            entity_type="employee",
            entity_id=employee_id,
            action="primary_documents_complete",
            changes_json={"primary": ["photo", "gov_id", "offer_letter"]},
        )
        log_tracked_hr_action(
            db,
            company_id=company_id,
            user_id=actor_user_id,
            role=actor_role,
            module="employees",
            action_type="profile_reminder_resolved",
            action_detail="documents",
            entity_type="employee",
            entity_id=employee_id,
            extra_context={"milestone": "primary_documents"},
            quality_factors={
                "completeness": 100.0,
                "accuracy": 96.0,
                "process_adherence": 95.0,
            },
        )
    if data.get("status") == "submitted":
        log_tracked_hr_action(
            db,
            company_id=company_id,
            user_id=actor_user_id,
            role=actor_role,
            module="employees",
            action_type="document_upload",
            action_detail=doc_type,
            entity_type="employee_document",
            entity_id=doc.id,
            reference_started_at=doc.created_at,
            quality_factors={
                "completeness": 96.0 if doc.file_url else 80.0,
                "accuracy": 92.0,
                "process_adherence": 90.0,
            },
        )
    write_audit(
        db,
        company_id=company_id,
        user_id=actor_user_id,
        entity_type="employee_document",
        entity_id=doc.id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(doc)
    return doc


def _validate_employee_refs(
    db: Session, company_id: str, body: EmployeeCreate | EmployeeUpdate, *, is_create: bool
) -> None:
    data = body.model_dump(exclude_unset=not is_create)
    if data.get("department_id"):
        d = db.execute(
            select(Department).where(
                Department.id == data["department_id"], Department.company_id == company_id
            )
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    if data.get("job_id"):
        j = db.execute(
            select(JobCatalogEntry).where(
                JobCatalogEntry.id == data["job_id"], JobCatalogEntry.company_id == company_id
            )
        ).scalar_one_or_none()
        if j is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job catalog entry not found")
    if data.get("location_id"):
        loc = db.execute(
            select(Location).where(Location.id == data["location_id"], Location.company_id == company_id)
        ).scalar_one_or_none()
        if loc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    if data.get("manager_id"):
        mgr = get_employee_by_id(db, company_id, data["manager_id"])
        if mgr is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager employee not found")


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Employee]:
    r = db.execute(select(Employee).where(Employee.company_id == company_id).order_by(Employee.employee_code))
    return list(r.scalars().all())


@router.get("/summary", response_model=list[EmployeeSummaryOut])
def list_employee_summaries(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EmployeeSummaryOut]:
    r = db.execute(select(Employee).where(Employee.company_id == company_id).order_by(Employee.employee_code))
    out: list[EmployeeSummaryOut] = []
    for emp in r.scalars().all():
        u = db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none() if emp.user_id else None
        dn, de = display_name_and_email(emp, u)
        out.append(
            EmployeeSummaryOut(
                id=emp.id,
                employee_code=emp.employee_code,
                display_name=dn,
                display_email=de,
                status=emp.status,
            )
        )
    return out


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    company_id: str,
    body: EmployeeCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, membership = ctx
    _validate_employee_refs(db, company_id, body, is_create=True)
    dup = db.execute(
        select(Employee).where(Employee.company_id == company_id, Employee.employee_code == body.employee_code)
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee code already in use")

    emp = Employee(
        id=uuid_str(),
        company_id=company_id,
        user_id=body.user_id,
        employee_code=body.employee_code.strip(),
        department_id=body.department_id,
        job_id=body.job_id,
        manager_id=body.manager_id,
        location_id=body.location_id,
        status=body.status,
        hire_date=body.hire_date,
        personal_info_json=body.personal_info_json,
        documents_json=body.documents_json,
        onboarding_checklist_json=body.onboarding_checklist_json,
    )
    db.add(emp)
    ensure_default_document_rows(db, company_id, emp.id)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=emp.id,
        action="create",
        changes_json={"employee_code": body.employee_code},
    )
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="employees",
        action_type="create",
        action_detail="create_employee",
        entity_type="employee",
        entity_id=emp.id,
        reference_started_at=None,
    )
    db.commit()
    db.refresh(emp)
    sync_document_inbox_tasks(db, emp)
    db.commit()
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="employee.created",
        entity_type="employee",
        entity_id=emp.id,
        actor_user_id=user.id,
        data={"employee_code": emp.employee_code},
    )
    return emp


@router.get("/me", response_model=EmployeeOut)
def get_my_employee_record(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, _ = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    sync_profile_inbox_tasks(db, emp)
    sync_document_inbox_tasks(db, emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.patch("/me", response_model=EmployeeOut)
def update_my_employee_record(
    company_id: str,
    body: EmployeeSelfUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, membership = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    old_pi = dict(emp.personal_info_json or {})
    audit_keys = list(body.model_dump(exclude_unset=True).keys())
    data = body.model_dump(exclude_unset=True)
    if "personal_info_json" in data:
        incoming = dict(data["personal_info_json"] or {})
        incoming.pop("fullName", None)
        merged = {**(emp.personal_info_json or {}), **incoming}
        fn = (emp.personal_info_json or {}).get("fullName")
        if fn is not None:
            merged["fullName"] = fn
        emp.personal_info_json = merged
        del data["personal_info_json"]
    for k, v in data.items():
        setattr(emp, k, v)
    if "personal_info_json" in audit_keys:
        new_pi = emp.personal_info_json or {}
        role = membership.role
        if _needs_phone(old_pi) and not _needs_phone(new_pi):
            _log_profile_reminder_completed(
                db,
                company_id=company_id,
                user_id=user.id,
                role=role,
                employee_id=emp.id,
                field="phone",
            )
        if _needs_address(old_pi) and not _needs_address(new_pi):
            _log_profile_reminder_completed(
                db,
                company_id=company_id,
                user_id=user.id,
                role=role,
                employee_id=emp.id,
                field="address",
            )
        if _needs_emergency(old_pi) and not _needs_emergency(new_pi):
            _log_profile_reminder_completed(
                db,
                company_id=company_id,
                user_id=user.id,
                role=role,
                employee_id=emp.id,
                field="emergency",
            )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=emp.id,
        action="self_update",
        changes_json=audit_keys,
    )
    sync_profile_inbox_tasks(db, emp)
    sync_document_inbox_tasks(db, emp)
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="employees",
        action_type="update_profile",
        action_detail="employee_self_update",
        entity_type="employee",
        entity_id=emp.id,
        reference_started_at=emp.updated_at,
        quality_factors=_profile_quality_factors(emp.personal_info_json),
    )
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/me/documents", response_model=list[EmployeeDocumentOut])
def list_my_employee_documents(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EmployeeDocument]:
    user, _ = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    ensure_default_document_rows(db, company_id, emp.id)
    db.commit()
    return load_employee_documents(db, emp.id)


@router.post("/me/documents/{doc_type}/upload", response_model=EmployeeDocumentOut)
async def upload_my_employee_document(
    company_id: str,
    doc_type: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> EmployeeDocument:
    user, _ = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    if doc_type not in _DOC_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid doc_type")
    ensure_default_document_rows(db, company_id, emp.id)
    doc = db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.employee_id == emp.id,
            EmployeeDocument.doc_type == doc_type,
        )
    ).scalar_one_or_none()
    if doc is None and doc_type in OPTIONAL_DOC_TYPES:
        doc = ensure_optional_document_row(db, company_id, emp.id, doc_type)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc_type in _PRIMARY_SELF_SERVICE and doc.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This document is already submitted. Contact HR if you need to replace it.",
        )
    upload_root = Path(settings.upload_dir).resolve()
    public_url, meta = await save_employee_document_file(
        file,
        doc_type,
        upload_root=upload_root,
        company_id=company_id,
        employee_id=emp.id,
        max_bytes=settings.max_employee_document_bytes,
    )
    mark_document_submitted(db, doc, file_url=public_url, meta_json=meta)
    sync_document_inbox_tasks(db, emp)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee_document",
        entity_id=doc.id,
        action="upload",
        changes_json={"doc_type": doc_type},
    )
    db.commit()
    db.refresh(doc)
    return doc


@router.patch("/me/documents/{doc_type}", response_model=EmployeeDocumentOut)
def patch_my_employee_document(
    company_id: str,
    doc_type: str,
    body: EmployeeDocumentPatch,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> EmployeeDocument:
    user, _ = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    return _patch_employee_document(db, company_id, emp.id, doc_type, body, user.id)


@router.get(
    "/{employee_id}/detail",
    response_model=EmployeeDetailOut,
)
def get_employee_detail(
    company_id: str,
    employee_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> EmployeeDetailOut:
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    ensure_default_document_rows(db, company_id, employee_id)
    db.commit()
    return _to_detail_out(db, company_id, emp)


@router.get(
    "/{employee_id}/documents",
    response_model=list[EmployeeDocumentOut],
)
def list_employee_documents(
    company_id: str,
    employee_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EmployeeDocument]:
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    ensure_default_document_rows(db, company_id, employee_id)
    db.commit()
    return load_employee_documents(db, employee_id)


@router.patch(
    "/{employee_id}/documents/{doc_type}",
    response_model=EmployeeDocumentOut,
)
def patch_employee_document_hr(
    company_id: str,
    employee_id: str,
    doc_type: str,
    body: EmployeeDocumentPatch,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_OR_BROADER))],
    db: Annotated[Session, Depends(get_db)],
) -> EmployeeDocument:
    user, _ = ctx
    return _patch_employee_document(db, company_id, employee_id, doc_type, body, user.id)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    company_id: str,
    employee_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return emp


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    company_id: str,
    employee_id: str,
    body: EmployeeUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, membership = ctx
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    _validate_employee_refs(db, company_id, body, is_create=False)
    data = body.model_dump(exclude_unset=True)
    if "employee_code" in data and data["employee_code"] is not None:
        data["employee_code"] = str(data["employee_code"]).strip()
        dup = db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                Employee.employee_code == data["employee_code"],
                Employee.id != employee_id,
            )
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee code already in use")
    for k, v in data.items():
        setattr(emp, k, v)

    ensure_default_document_rows(db, company_id, employee_id)
    sync_document_inbox_tasks(db, emp)

    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=employee_id,
        action="update",
        changes_json=data,
    )
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="employees",
        action_type="update",
        action_detail="employee_hr_update",
        entity_type="employee",
        entity_id=employee_id,
        reference_started_at=emp.updated_at,
        quality_factors={
            "completeness": min(100.0, 75.0 + float(len(data) * 4)),
            "accuracy": 90.0,
            "process_adherence": 91.0,
        },
    )
    db.commit()
    db.refresh(emp)
    return emp


@router.patch("/{employee_id}/onboarding", response_model=EmployeeOut)
def update_onboarding_checklist(
    company_id: str,
    employee_id: str,
    body: OnboardingChecklistUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, membership = ctx
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    emp.onboarding_checklist_json = body.onboarding_checklist_json
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=employee_id,
        action="onboarding_update",
        changes_json={},
    )
    completion_rate = _checklist_completion_rate(body.onboarding_checklist_json)
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="employees",
        action_type="onboarding_update",
        action_detail="onboarding_checklist",
        entity_type="employee",
        entity_id=employee_id,
        reference_started_at=emp.updated_at,
        quality_factors={
            "completeness": max(65.0, completion_rate),
            "accuracy": 90.0,
            "process_adherence": 94.0,
        },
    )
    db.commit()
    db.refresh(emp)
    return emp


@router.post(
    "/{employee_id}/lifecycle-events",
    response_model=LifecycleEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_lifecycle_event(
    company_id: str,
    employee_id: str,
    body: LifecycleEventCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> EmployeeLifecycleEvent:
    user, membership = ctx
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    ev = EmployeeLifecycleEvent(
        id=uuid_str(),
        company_id=company_id,
        employee_id=employee_id,
        event_type=body.event_type,
        effective_date=body.effective_date,
        payload_json=body.payload_json,
        status=body.status,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(ev)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="lifecycle_event",
        entity_id=ev.id,
        action="create",
        changes_json={"type": body.event_type},
    )
    normalized_type = body.event_type.strip().lower()
    if normalized_type in {"transfer", "promotion", "termination", "rehire"}:
        action_type = f"lifecycle_{normalized_type}"
    else:
        action_type = "lifecycle_event"
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="employees",
        action_type=action_type,
        action_detail=body.event_type[:120],
        entity_type="lifecycle_event",
        entity_id=ev.id,
        reference_started_at=emp.updated_at,
        quality_factors={
            "completeness": 94.0 if body.payload_json else 80.0,
            "accuracy": 91.0,
            "process_adherence": 92.0 if (body.status or "").lower() == "completed" else 85.0,
        },
    )
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/{employee_id}/lifecycle-events", response_model=list[LifecycleEventOut])
def list_lifecycle_events(
    company_id: str,
    employee_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EmployeeLifecycleEvent]:
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    r = db.execute(
        select(EmployeeLifecycleEvent)
        .where(
            EmployeeLifecycleEvent.company_id == company_id,
            EmployeeLifecycleEvent.employee_id == employee_id,
        )
        .order_by(EmployeeLifecycleEvent.created_at.desc())
    )
    return list(r.scalars().all())
