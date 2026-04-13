from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.hr_ops import (
    AttendanceRecord,
    HolidayCalendar,
    LeaveBalance,
    LeavePolicy,
    LeaveRequest,
)
from app.models.membership import CompanyMembership
from app.models.org import Location
from app.models.user import User
from app.schemas.hr_ops import (
    AttendanceRecordCreate,
    AttendanceRecordOut,
    HolidayCreate,
    HolidayOut,
    LeaveBalanceCreate,
    LeaveBalanceOut,
    LeavePolicyCreate,
    LeavePolicyOut,
    LeaveRequestApprove,
    LeaveRequestCreate,
    LeaveRequestOut,
)
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.integration_hooks import publish_domain_event_post_commit

router = APIRouter(prefix="/companies/{company_id}", tags=["hr-ops"])

_HR = frozenset({"company_admin", "hr_ops"})


@router.get("/leave/policies", response_model=list[LeavePolicyOut])
def list_leave_policies(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[LeavePolicy]:
    r = db.execute(select(LeavePolicy).where(LeavePolicy.company_id == company_id).order_by(LeavePolicy.type))
    return list(r.scalars().all())


@router.post("/leave/policies", response_model=LeavePolicyOut, status_code=status.HTTP_201_CREATED)
def create_leave_policy(
    company_id: str,
    body: LeavePolicyCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
) -> LeavePolicy:
    user, _ = ctx
    row = LeavePolicy(
        id=uuid_str(),
        company_id=company_id,
        type=body.type.strip(),
        accrual_rules_json=body.accrual_rules_json,
        carry_forward_limit=body.carry_forward_limit,
        applicable_to_json=body.applicable_to_json,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="leave_policy", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/leave/requests", response_model=list[LeaveRequestOut])
def list_leave_requests(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[LeaveRequest]:
    user, membership = ctx
    q = select(LeaveRequest).where(LeaveRequest.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(LeaveRequest.employee_id == emp.id)
    elif employee_id:
        if membership.role not in _HR:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required to filter by employee")
        q = q.where(LeaveRequest.employee_id == employee_id)
    r = db.execute(q.order_by(LeaveRequest.created_at.desc()))
    return list(r.scalars().all())


@router.post("/leave/requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
def create_leave_request(
    company_id: str,
    body: LeaveRequestCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> LeaveRequest:
    user, membership = ctx
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No employee record for this user")
        target_employee_id = emp.id
    else:
        if membership.role not in _HR:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required to create requests for others")
        if not body.employee_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="employee_id is required for HR-created requests")
        target_employee_id = body.employee_id
        if get_employee_by_id(db, company_id, target_employee_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    row = LeaveRequest(
        id=uuid_str(),
        company_id=company_id,
        employee_id=target_employee_id,
        type=body.type.strip(),
        start_date=body.start_date,
        end_date=body.end_date,
        reason=body.reason,
        status="pending",
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="leave_request", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.patch("/leave/requests/{request_id}/decision", response_model=LeaveRequestOut)
def decide_leave_request(
    company_id: str,
    request_id: str,
    body: LeaveRequestApprove,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
) -> LeaveRequest:
    user, membership = ctx
    r = db.execute(
        select(LeaveRequest).where(LeaveRequest.id == request_id, LeaveRequest.company_id == company_id)
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    if row.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already decided")
    row.status = body.status
    row.approved_by = user.id
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="leave_request",
        entity_id=request_id,
        action=body.status,
        changes_json={},
    )
    ref = row.created_at
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type=body.status,
        action_detail="leave_decision",
        entity_type="leave_request",
        entity_id=request_id,
        reference_started_at=ref,
    )
    db.commit()
    db.refresh(row)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type=f"leave.{body.status}",
        entity_type="leave_request",
        entity_id=request_id,
        actor_user_id=user.id,
        data={"employee_id": row.employee_id},
    )
    return row


@router.get("/leave/balances", response_model=list[LeaveBalanceOut])
def list_leave_balances(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
    year: int | None = None,
) -> list[LeaveBalance]:
    user, membership = ctx
    q = select(LeaveBalance).where(LeaveBalance.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(LeaveBalance.employee_id == emp.id)
    elif employee_id:
        if membership.role not in _HR:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required")
        q = q.where(LeaveBalance.employee_id == employee_id)
    if year is not None:
        q = q.where(LeaveBalance.year == year)
    return list(db.execute(q).scalars().all())


@router.post("/leave/balances", response_model=LeaveBalanceOut, status_code=status.HTTP_201_CREATED)
def upsert_leave_balance(
    company_id: str,
    body: LeaveBalanceCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
) -> LeaveBalance:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    r = db.execute(
        select(LeaveBalance).where(
            LeaveBalance.company_id == company_id,
            LeaveBalance.employee_id == body.employee_id,
            LeaveBalance.type == body.type,
            LeaveBalance.year == body.year,
        )
    )
    existing = r.scalar_one_or_none()
    if existing:
        existing.balance = body.balance
        db.commit()
        db.refresh(existing)
        return existing
    row = LeaveBalance(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        type=body.type,
        balance=body.balance,
        year=body.year,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="leave_balance", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/attendance", response_model=list[AttendanceRecordOut])
def list_attendance(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
    date: str | None = None,
) -> list[AttendanceRecord]:
    user, membership = ctx
    q = select(AttendanceRecord).where(AttendanceRecord.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(AttendanceRecord.employee_id == emp.id)
    elif employee_id:
        if membership.role not in _HR:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required")
        q = q.where(AttendanceRecord.employee_id == employee_id)
    if date:
        q = q.where(AttendanceRecord.date == date)
    return list(db.execute(q.order_by(AttendanceRecord.date.desc())).scalars().all())


@router.post("/attendance", response_model=AttendanceRecordOut, status_code=status.HTTP_201_CREATED)
def create_attendance(
    company_id: str,
    body: AttendanceRecordCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> AttendanceRecord:
    user, membership = ctx
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or emp.id != body.employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only record your own attendance")
    elif membership.role not in _HR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR role required to record for others")
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = AttendanceRecord(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        date=body.date,
        clock_in=body.clock_in,
        clock_out=body.clock_out,
        status=body.status,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="attendance", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/holiday-calendars", response_model=list[HolidayOut])
def list_holidays(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    location_id: str | None = None,
) -> list[HolidayCalendar]:
    q = select(HolidayCalendar).where(HolidayCalendar.company_id == company_id)
    if location_id:
        q = q.where(HolidayCalendar.location_id == location_id)
    return list(db.execute(q.order_by(HolidayCalendar.date)).scalars().all())


@router.post("/holiday-calendars", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def create_holiday(
    company_id: str,
    body: HolidayCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
) -> HolidayCalendar:
    user, _ = ctx
    if body.location_id:
        loc = db.execute(
            select(Location).where(Location.id == body.location_id, Location.company_id == company_id)
        ).scalar_one_or_none()
        if loc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    row = HolidayCalendar(
        id=uuid_str(),
        company_id=company_id,
        location_id=body.location_id,
        date=body.date,
        name=body.name.strip(),
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="holiday", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row
