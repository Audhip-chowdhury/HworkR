from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.lifecycle import EmployeeLifecycleEvent
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.position import Position
from app.models.user import User
from app.schemas.employees import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeSelfUpdate,
    EmployeeUpdate,
    LifecycleEventCreate,
    LifecycleEventOut,
    OnboardingChecklistUpdate,
)
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.integration_hooks import publish_domain_event_post_commit

router = APIRouter(prefix="/companies/{company_id}/employees", tags=["employees"])

_HR_ROLES = frozenset({"company_admin", "hr_ops", "compensation_analytics"})


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
    if data.get("position_id"):
        pos = db.execute(
            select(Position).where(Position.id == data["position_id"], Position.company_id == company_id)
        ).scalar_one_or_none()
        if pos is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")
        dep_id = data.get("department_id")
        if dep_id and pos.department_id and pos.department_id != dep_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Position does not belong to the selected department",
            )


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Employee]:
    r = db.execute(select(Employee).where(Employee.company_id == company_id).order_by(Employee.employee_code))
    return list(r.scalars().all())


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
        position_id=body.position_id,
        manager_id=body.manager_id,
        location_id=body.location_id,
        status=body.status,
        hire_date=body.hire_date,
        personal_info_json=body.personal_info_json,
        documents_json=body.documents_json,
        onboarding_checklist_json=body.onboarding_checklist_json,
    )
    db.add(emp)
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
    return emp


@router.patch("/me", response_model=EmployeeOut)
def update_my_employee_record(
    company_id: str,
    body: EmployeeSelfUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    user, _ = ctx
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No employee record for this user")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(emp, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=emp.id,
        action="self_update",
        changes_json=list(data.keys()),
    )
    db.commit()
    db.refresh(emp)
    return emp


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
    user, _ = ctx
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

    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="employee",
        entity_id=employee_id,
        action="update",
        changes_json=data,
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
    user, _ = ctx
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
    user, _ = ctx
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
