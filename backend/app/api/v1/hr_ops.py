from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
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
    LeaveTypeSummaryOut,
    LeaveYearSummaryOut,
)
from app.services.employee_detail import display_name_and_email
from app.services.activity_tracking import log_tracked_hr_action
from app.services.audit import write_audit
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.integration_hooks import publish_domain_event_post_commit

router = APIRouter(prefix="/companies/{company_id}", tags=["hr-ops"])

_HR = frozenset({"company_admin", "hr_ops"})

# Default annual allocations (days) when no policy row overrides
_DEFAULT_LEAVE_ALLOCATIONS: dict[str, float] = {
    "paid": 20.0,
    "sick": 10.0,
    "casual": 7.0,
    "unpaid": 0.0,
}

_DEFAULT_SEED_HOLIDAYS: tuple[tuple[str, str], ...] = (
    ("2026-01-01", "New Year's Day"),
    ("2026-01-20", "Martin Luther King Jr. Day"),
    ("2026-02-17", "Presidents' Day"),
    ("2026-04-18", "Good Friday"),
    ("2026-05-26", "Memorial Day"),
    ("2026-07-04", "Independence Day"),
    ("2026-09-07", "Labor Day"),
    ("2026-11-26", "Thanksgiving Day"),
    ("2026-12-25", "Christmas Day"),
    ("2026-12-31", "New Year's Eve"),
)


def _days_in_range_for_year(start_date: str, end_date: str, year: int) -> float:
    s = date.fromisoformat(start_date[:10])
    e = date.fromisoformat(end_date[:10])
    n = 0
    d = s
    while d <= e:
        if d.year == year:
            n += 1
        d += timedelta(days=1)
    return float(n)


def _enrich_leave_request(
    db: Session,
    company_id: str,
    row: LeaveRequest,
) -> LeaveRequestOut:
    emp = db.execute(select(Employee).where(Employee.id == row.employee_id)).scalar_one_or_none()
    dn: str | None = None
    code: str | None = None
    if emp is not None:
        code = emp.employee_code
        u = db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none() if emp.user_id else None
        dn, _ = display_name_and_email(emp, u)
    return LeaveRequestOut(
        id=row.id,
        company_id=row.company_id,
        employee_id=row.employee_id,
        type=row.type,
        start_date=row.start_date,
        end_date=row.end_date,
        reason=row.reason,
        status=row.status,
        approved_by=row.approved_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        employee_display_name=dn,
        employee_code=code,
    )


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
    user, membership = ctx
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
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type="policy_create",
        action_detail=row.type,
        entity_type="leave_policy",
        entity_id=row.id,
        quality_factors={
            "completeness": 96.0 if row.accrual_rules_json else 84.0,
            "accuracy": 90.0,
            "process_adherence": 92.0,
        },
    )
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
    rows = list(db.execute(q.order_by(LeaveRequest.created_at.desc())).scalars().all())
    return [_enrich_leave_request(db, company_id, row) for row in rows]


@router.get("/leave/summary", response_model=LeaveYearSummaryOut)
def leave_year_summary(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    year: int | None = Query(None, ge=2000, le=2100),
    for_employee_id: str | None = Query(None, description="HR: load summary for this employee"),
) -> LeaveYearSummaryOut:
    user, membership = ctx
    y = year if year is not None else datetime.now().year
    policies = list(
        db.execute(select(LeavePolicy).where(LeavePolicy.company_id == company_id)).scalars().all()
    )
    alloc_map = dict(_DEFAULT_LEAVE_ALLOCATIONS)
    for p in policies:
        if p.type in alloc_map and p.accrual_rules_json and isinstance(p.accrual_rules_json, dict):
            ad = p.accrual_rules_json.get("annual_days")
            if isinstance(ad, (int, float)):
                alloc_map[p.type] = float(ad)

    emp: Employee | None = None
    if for_employee_id:
        if membership.role == "employee":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot query other employees")
        emp = get_employee_by_id(db, company_id, for_employee_id)
        if emp is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    else:
        emp = get_employee_for_user(db, company_id, user.id)

    if emp is None:
        types_out = [
            LeaveTypeSummaryOut(type=k, allocated=v, used=0.0, pending=0.0, remaining=v)
            for k, v in sorted(alloc_map.items(), key=lambda x: x[0])
        ]
        return LeaveYearSummaryOut(year=y, types=types_out)

    req_rows = list(
        db.execute(
            select(LeaveRequest).where(
                LeaveRequest.company_id == company_id,
                LeaveRequest.employee_id == emp.id,
            )
        )
        .scalars()
        .all()
    )

    types_out = []
    for lt, allocated in sorted(alloc_map.items(), key=lambda x: x[0]):
        used = 0.0
        pending = 0.0
        for r in req_rows:
            if r.type != lt:
                continue
            d = _days_in_range_for_year(r.start_date, r.end_date, y)
            if d <= 0:
                continue
            if r.status == "approved":
                used += d
            elif r.status == "pending":
                pending += d
        remaining = max(0.0, allocated - used - pending)
        types_out.append(
            LeaveTypeSummaryOut(
                type=lt,
                allocated=allocated,
                used=used,
                pending=pending,
                remaining=remaining,
            )
        )
    return LeaveYearSummaryOut(year=y, types=types_out)


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
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type="create",
        action_detail=row.type,
        entity_type="leave_request",
        entity_id=row.id,
        quality_factors={
            "completeness": 95.0 if row.reason else 86.0,
            "accuracy": 90.0,
            "process_adherence": 90.0,
        },
    )
    db.commit()
    db.refresh(row)
    return _enrich_leave_request(db, company_id, row)


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
    return _enrich_leave_request(db, company_id, row)


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
    user, membership = ctx
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
        log_tracked_hr_action(
            db,
            company_id=company_id,
            user_id=user.id,
            role=membership.role,
            module="leave",
            action_type="balance_upsert",
            action_detail=body.type,
            entity_type="leave_balance",
            entity_id=existing.id,
            quality_factors={
                "completeness": 92.0,
                "accuracy": 90.0 if body.balance >= 0 else 75.0,
                "process_adherence": 90.0,
            },
        )
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
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type="balance_upsert",
        action_detail=body.type,
        entity_type="leave_balance",
        entity_id=row.id,
        quality_factors={
            "completeness": 94.0,
            "accuracy": 90.0 if body.balance >= 0 else 75.0,
            "process_adherence": 90.0,
        },
    )
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
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type="attendance_recorded",
        action_detail=row.status,
        entity_type="attendance",
        entity_id=row.id,
        quality_factors={
            "completeness": 96.0 if row.clock_in else 82.0,
            "accuracy": 90.0 if (row.clock_in or row.clock_out) else 78.0,
            "process_adherence": 89.0,
        },
    )
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
    rows = list(db.execute(q.order_by(HolidayCalendar.date)).scalars().all())
    if len(rows) == 0:
        for ds, name in _DEFAULT_SEED_HOLIDAYS:
            db.add(
                HolidayCalendar(
                    id=uuid_str(),
                    company_id=company_id,
                    location_id=None,
                    date=ds,
                    name=name,
                )
            )
        db.commit()
        rows = list(db.execute(q.order_by(HolidayCalendar.date)).scalars().all())
    return rows


@router.post("/holiday-calendars", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def create_holiday(
    company_id: str,
    body: HolidayCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR))],
    db: Annotated[Session, Depends(get_db)],
) -> HolidayCalendar:
    user, membership = ctx
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
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="leave",
        action_type="holiday_create",
        action_detail=row.name[:120],
        entity_type="holiday",
        entity_id=row.id,
        quality_factors={
            "completeness": 94.0 if row.location_id else 88.0,
            "accuracy": 92.0,
            "process_adherence": 90.0,
        },
    )
    db.commit()
    db.refresh(row)
    return row
