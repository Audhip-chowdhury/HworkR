from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.notification import Notification
from app.models.performance_learning import (
    Assessment,
    Course,
    Goal,
    Pip,
    ReviewCycle,
    ReviewCycleEmployeeGoalSubmission,
    ReviewCycleKpiDefinition,
    SkillProfile,
    TrainingAssignment,
    TrainingCompletion,
)
from app.models.user import User
from app.schemas.performance_learning import (
    AssessmentCreate,
    AssessmentOut,
    CourseCreate,
    CourseOut,
    GoalCreate,
    GoalOut,
    GoalUpdate,
    PipCreate,
    PipOut,
    EmployeeCycleGoalRowOut,
    EmployeeMyCycleGoalsGroupOut,
    ReviewCycleCreate,
    SubmitMyCycleGoalsBody,
    SubmitMyCycleGoalsResponse,
    ReviewCycleKpiDefinitionOut,
    ReviewCycleOut,
    SkillProfileOut,
    SkillProfileUpsert,
    TrainingAssignmentCreate,
    TrainingAssignmentOut,
    TrainingCompletionCreate,
    TrainingCompletionOut,
)
from app.services.audit import write_audit
from app.services.activity_tracking import log_tracked_hr_action
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user

router = APIRouter(prefix="/companies/{company_id}", tags=["performance-learning"])

_LD = frozenset({"company_admin", "ld_performance"})
# Performance workspace (review cycles, company-wide goals/PIPs/assessments): HR ops only.
_HR_PERFORMANCE_CONSOLE = frozenset({"hr_ops"})
# Membership roles that use the employee self-service paths (own goals, manager review, etc.)
_SELF_SERVICE_PERFORMANCE_ROLES = frozenset({"employee", "hr_ops"})


def _notify_employees_review_cycle_goals(
    db: Session,
    *,
    company_id: str,
    cycle_id: str,
    cycle_name: str,
    goals_deadline: str,
) -> None:
    """Create in-app notifications for active employees who report to someone (have a manager).

    Employees with no manager (e.g. CEO / org root) are excluded from review-cycle goal filling.
    """
    deadline_display = goals_deadline.strip()
    title = "Complete your performance goals"
    message = f'Please complete your goals for "{cycle_name}" by {deadline_display}.'
    r = db.execute(
        select(Employee).where(
            Employee.company_id == company_id,
            Employee.user_id.isnot(None),
            Employee.manager_id.isnot(None),
            Employee.status == "active",
        )
    )
    for emp in r.scalars().all():
        uid = emp.user_id
        if not uid:
            continue
        db.add(
            Notification(
                id=uuid_str(),
                company_id=company_id,
                user_id=uid,
                type="review_cycle_goals",
                title=title,
                message=message,
                entity_type="review_cycle",
                entity_id=cycle_id,
                context_json={
                    "review_cycle_id": cycle_id,
                    "cycle_name": cycle_name,
                    "goals_deadline": deadline_display,
                },
            )
        )


def _get_cycle(db: Session, company_id: str, cycle_id: str) -> ReviewCycle:
    r = db.execute(
        select(ReviewCycle).where(ReviewCycle.id == cycle_id, ReviewCycle.company_id == company_id)
    )
    c = r.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review cycle not found")
    return c


# --- Performance ---


@router.get("/performance/review-cycles", response_model=list[ReviewCycleOut])
def list_review_cycles(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> list[ReviewCycle]:
    r = db.execute(select(ReviewCycle).where(ReviewCycle.company_id == company_id).order_by(ReviewCycle.created_at.desc()))
    return list(r.scalars().all())


@router.post("/performance/review-cycles", response_model=ReviewCycleOut, status_code=status.HTTP_201_CREATED)
def create_review_cycle(
    company_id: str,
    body: ReviewCycleCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> ReviewCycle:
    user, _ = ctx
    kpis = body.kpi_definitions or []
    if kpis:
        keys = [k.goal_key.strip() for k in kpis]
        if len(keys) != len(set(keys)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate goal_key in kpi_definitions",
            )
    gd = body.goals_deadline.strip() if body.goals_deadline else None
    row = ReviewCycle(
        id=uuid_str(),
        company_id=company_id,
        name=body.name.strip(),
        type=body.type,
        start_date=body.start_date,
        end_date=body.end_date,
        goals_deadline=gd,
        status=body.status,
    )
    db.add(row)
    db.flush()
    for k in kpis:
        db.add(
            ReviewCycleKpiDefinition(
                id=uuid_str(),
                company_id=company_id,
                review_cycle_id=row.id,
                goal_key=k.goal_key.strip(),
                goal_description=k.goal_description.strip(),
                category=k.category.strip() if k.category else None,
                weight_percent=k.weight_percent,
            )
        )
    if kpis and gd:
        _notify_employees_review_cycle_goals(
            db,
            company_id=company_id,
            cycle_id=row.id,
            cycle_name=row.name,
            goals_deadline=gd,
        )
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="review_cycle", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/performance/review-cycles/{cycle_id}/kpi-definitions",
    response_model=list[ReviewCycleKpiDefinitionOut],
)
def list_review_cycle_kpi_definitions(
    company_id: str,
    cycle_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> list[ReviewCycleKpiDefinition]:
    _get_cycle(db, company_id, cycle_id)
    r = db.execute(
        select(ReviewCycleKpiDefinition)
        .where(
            ReviewCycleKpiDefinition.review_cycle_id == cycle_id,
            ReviewCycleKpiDefinition.company_id == company_id,
        )
        .order_by(ReviewCycleKpiDefinition.goal_key)
    )
    return list(r.scalars().all())


def _title_for_kpi_goal(kpi: ReviewCycleKpiDefinition) -> str:
    base = f"{kpi.goal_key}: {kpi.goal_description}"
    return base if len(base) <= 255 else base[:252] + "…"


def _cycle_goals_submitted(db: Session, *, employee_id: str, review_cycle_id: str) -> ReviewCycleEmployeeGoalSubmission | None:
    r = db.execute(
        select(ReviewCycleEmployeeGoalSubmission).where(
            ReviewCycleEmployeeGoalSubmission.employee_id == employee_id,
            ReviewCycleEmployeeGoalSubmission.review_cycle_id == review_cycle_id,
        )
    )
    return r.scalar_one_or_none()


@router.get(
    "/performance/my-review-cycle-goals",
    response_model=list[EmployeeMyCycleGoalsGroupOut],
)
def list_my_review_cycle_goals(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EmployeeMyCycleGoalsGroupOut]:
    """Employee-line roles (employee, hr_ops): cycles you were notified about, with KPI rows."""
    user, membership = ctx
    if membership.role not in _SELF_SERVICE_PERFORMANCE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        return []
    if emp.manager_id is None:
        return []

    n_sub = (
        select(Notification.entity_id)
        .where(
            Notification.company_id == company_id,
            Notification.user_id == user.id,
            Notification.type == "review_cycle_goals",
            Notification.entity_type == "review_cycle",
            Notification.entity_id.isnot(None),
        )
        .distinct()
    )
    cycle_ids = [row[0] for row in db.execute(n_sub).all() if row[0]]
    if not cycle_ids:
        return []

    out: list[EmployeeMyCycleGoalsGroupOut] = []
    for cid in cycle_ids:
        try:
            cycle = _get_cycle(db, company_id, cid)
        except HTTPException:
            continue
        kpis = list(
            db.execute(
                select(ReviewCycleKpiDefinition)
                .where(
                    ReviewCycleKpiDefinition.review_cycle_id == cid,
                    ReviewCycleKpiDefinition.company_id == company_id,
                )
                .order_by(ReviewCycleKpiDefinition.goal_key)
            )
            .scalars()
            .all()
        )
        if not kpis:
            continue
        rows: list[EmployeeCycleGoalRowOut] = []
        for kpi in kpis:
            gr = db.execute(
                select(Goal).where(
                    Goal.employee_id == emp.id,
                    Goal.kpi_definition_id == kpi.id,
                    Goal.company_id == company_id,
                )
            ).scalar_one_or_none()
            if gr is None:
                gr = Goal(
                    id=uuid_str(),
                    company_id=company_id,
                    employee_id=emp.id,
                    cycle_id=cid,
                    kpi_definition_id=kpi.id,
                    title=_title_for_kpi_goal(kpi),
                    description=kpi.goal_description,
                    target=None,
                    actual_achievement=None,
                    progress=0,
                    status="active",
                )
                db.add(gr)
                db.flush()
            rows.append(
                EmployeeCycleGoalRowOut(
                    kpi_definition=ReviewCycleKpiDefinitionOut.model_validate(kpi),
                    goal=GoalOut.model_validate(gr),
                )
            )
        sub = _cycle_goals_submitted(db, employee_id=emp.id, review_cycle_id=cid)
        out.append(
            EmployeeMyCycleGoalsGroupOut(
                cycle=ReviewCycleOut.model_validate(cycle),
                rows=rows,
                submitted_at=sub.submitted_at if sub else None,
            )
        )
    db.commit()
    return out


@router.post(
    "/performance/review-cycles/{cycle_id}/submit-my-goals",
    response_model=SubmitMyCycleGoalsResponse,
    status_code=status.HTTP_200_OK,
)
def submit_my_cycle_goals(
    company_id: str,
    cycle_id: str,
    body: SubmitMyCycleGoalsBody,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SubmitMyCycleGoalsResponse:
    """Employee-line roles: save all KPI goal fields and record a single submission for the cycle."""
    user, membership = ctx
    if membership.role not in _SELF_SERVICE_PERFORMANCE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No employee record")
    if emp.manager_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Review cycle goals apply only to employees who report to a manager.",
        )

    cycle = _get_cycle(db, company_id, cycle_id)
    if _cycle_goals_submitted(db, employee_id=emp.id, review_cycle_id=cycle_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted your goals for this review cycle.",
        )

    kpis = list(
        db.execute(
            select(ReviewCycleKpiDefinition)
            .where(
                ReviewCycleKpiDefinition.review_cycle_id == cycle_id,
                ReviewCycleKpiDefinition.company_id == company_id,
            )
            .order_by(ReviewCycleKpiDefinition.goal_key)
        )
        .scalars()
        .all()
    )
    if not kpis:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No goals defined for this cycle")

    goal_rows: list[Goal] = []
    for kpi in kpis:
        gr = db.execute(
            select(Goal).where(
                Goal.employee_id == emp.id,
                Goal.kpi_definition_id == kpi.id,
                Goal.company_id == company_id,
            )
        ).scalar_one_or_none()
        if gr is None:
            gr = Goal(
                id=uuid_str(),
                company_id=company_id,
                employee_id=emp.id,
                cycle_id=cycle_id,
                kpi_definition_id=kpi.id,
                title=_title_for_kpi_goal(kpi),
                description=kpi.goal_description,
                target=None,
                actual_achievement=None,
                progress=0,
                status="active",
            )
            db.add(gr)
            db.flush()
        goal_rows.append(gr)

    expected_ids = {g.id for g in goal_rows}
    by_id = {x.goal_id: x for x in body.goals}
    if set(by_id.keys()) != expected_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submit every goal row for this cycle (goal_id mismatch).",
        )

    now = datetime.now(timezone.utc)
    for gr in goal_rows:
        item = by_id[gr.id]
        gr.description = item.description
        gr.target = item.target
        gr.actual_achievement = item.actual_achievement
        gr.updated_at = now

    sub = ReviewCycleEmployeeGoalSubmission(
        id=uuid_str(),
        company_id=company_id,
        employee_id=emp.id,
        review_cycle_id=cycle_id,
        submitted_at=now,
    )
    db.add(sub)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="review_cycle_goal_submission",
        entity_id=sub.id,
        action="submit",
        changes_json={"review_cycle_id": cycle_id},
    )

    if emp.manager_id:
        mgr = db.execute(
            select(Employee).where(Employee.id == emp.manager_id, Employee.company_id == company_id)
        ).scalar_one_or_none()
        if mgr is not None and mgr.user_id:
            db.add(
                Notification(
                    id=uuid_str(),
                    company_id=company_id,
                    user_id=mgr.user_id,
                    type="employee_goals_submitted",
                    title="Review team member's goals",
                    message=f'{user.name.strip()} submitted goals for "{cycle.name}". Review their goals.',
                    entity_type="employee_goals_submitted",
                    entity_id=emp.id,
                    context_json={
                        "review_cycle_id": cycle_id,
                        "submission_id": sub.id,
                        "employee_id": emp.id,
                        "cycle_name": cycle.name,
                    },
                )
            )

    db.commit()
    return SubmitMyCycleGoalsResponse(review_cycle_id=cycle_id, submitted_at=now)


@router.get("/performance/goals", response_model=list[GoalOut])
def list_goals(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[Goal]:
    user, membership = ctx
    q = select(Goal).where(Goal.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        if employee_id and employee_id != emp.id:
            reportee = get_employee_by_id(db, company_id, employee_id)
            if reportee is None or reportee.manager_id != emp.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view goals for yourself or your direct reports.",
                )
            q = q.where(Goal.employee_id == employee_id)
        else:
            q = q.where(Goal.employee_id == emp.id)
    elif membership.role == "hr_ops":
        if employee_id is not None:
            if get_employee_by_id(db, company_id, employee_id) is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
            q = q.where(Goal.employee_id == employee_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    return list(db.execute(q.order_by(Goal.created_at.desc())).scalars().all())


@router.post("/performance/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    company_id: str,
    body: GoalCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> Goal:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if body.cycle_id:
        _get_cycle(db, company_id, body.cycle_id)
    row = Goal(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        cycle_id=body.cycle_id,
        kpi_definition_id=None,
        title=body.title.strip(),
        description=body.description,
        target=body.target,
        actual_achievement=None,
        progress=body.progress,
        status=body.status,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="goal", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.patch("/performance/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    company_id: str,
    goal_id: str,
    body: GoalUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Goal:
    user, membership = ctx
    r = db.execute(select(Goal).where(Goal.id == goal_id, Goal.company_id == company_id))
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    data: dict
    if membership.role in _SELF_SERVICE_PERFORMANCE_ROLES:
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No employee record")
        reportee = get_employee_by_id(db, company_id, row.employee_id)
        if reportee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal employee not found")
        is_self = row.employee_id == emp.id
        is_manager_of_owner = reportee.manager_id == emp.id
        if not is_self and not is_manager_of_owner:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")
        raw = body.model_dump(exclude_unset=True)
        if is_self:
            if any(k in raw for k in ("manager_rating", "manager_comment")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only your manager can set rating and manager comment.",
                )
            if row.cycle_id and _cycle_goals_submitted(db, employee_id=row.employee_id, review_cycle_id=row.cycle_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This review cycle's goals are already submitted and cannot be changed.",
                )
            data = {
                k: v
                for k, v in raw.items()
                if k in {"progress", "description", "target", "actual_achievement", "title"}
            }
            for k, v in data.items():
                setattr(row, k, v)
        else:
            # Direct manager: only manager_rating and manager_comment
            extra = set(raw.keys()) - {"manager_rating", "manager_comment"}
            if extra:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Managers may only update manager_rating and manager_comment.",
                )
            data = {k: v for k, v in raw.items() if k in ("manager_rating", "manager_comment")}
            for k, v in data.items():
                setattr(row, k, v)
    else:
        if membership.role not in _LD and membership.role != "hr_ops":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="L&D, admin, or HR ops required")
        data = body.model_dump(exclude_unset=True)
        if data.get("cycle_id"):
            _get_cycle(db, company_id, data["cycle_id"])
        for k, v in data.items():
            setattr(row, k, v)
    row.updated_at = datetime.now(timezone.utc)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="goal", entity_id=goal_id, action="update", changes_json=data)
    db.commit()
    db.refresh(row)
    return row


@router.post("/performance/assessments", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
def create_assessment(
    company_id: str,
    body: AssessmentCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> Assessment:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if body.cycle_id:
        _get_cycle(db, company_id, body.cycle_id)
    row = Assessment(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        cycle_id=body.cycle_id,
        type=body.type,
        assessor_id=body.assessor_id or user.id,
        ratings_json=body.ratings_json,
        comments=body.comments,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="assessment", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/performance/assessments", response_model=list[AssessmentOut])
def list_assessments(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[Assessment]:
    user, membership = ctx
    q = select(Assessment).where(Assessment.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(Assessment.employee_id == emp.id)
    elif membership.role == "hr_ops":
        if employee_id is not None:
            if get_employee_by_id(db, company_id, employee_id) is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
            q = q.where(Assessment.employee_id == employee_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    return list(db.execute(q.order_by(Assessment.created_at.desc())).scalars().all())


@router.post("/performance/pips", response_model=PipOut, status_code=status.HTTP_201_CREATED)
def create_pip(
    company_id: str,
    body: PipCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> Pip:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = Pip(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        reason=body.reason,
        plan_json=body.plan_json,
        start_date=body.start_date,
        end_date=body.end_date,
        status=body.status,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="pip", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/performance/pips", response_model=list[PipOut])
def list_pips(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[Pip]:
    user, membership = ctx
    q = select(Pip).where(Pip.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(Pip.employee_id == emp.id)
    elif membership.role == "hr_ops":
        if employee_id is not None:
            if get_employee_by_id(db, company_id, employee_id) is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
            q = q.where(Pip.employee_id == employee_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    return list(db.execute(q.order_by(Pip.created_at.desc())).scalars().all())


# --- Learning ---


@router.get("/learning/courses", response_model=list[CourseOut])
def list_courses(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Course]:
    r = db.execute(select(Course).where(Course.company_id == company_id).order_by(Course.title))
    return list(r.scalars().all())


@router.post("/learning/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    company_id: str,
    body: CourseCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
    db: Annotated[Session, Depends(get_db)],
) -> Course:
    user, _ = ctx
    row = Course(
        id=uuid_str(),
        company_id=company_id,
        title=body.title.strip(),
        category=body.category,
        duration=body.duration,
        prerequisites_json=body.prerequisites_json,
        content_url=body.content_url,
        mandatory=body.mandatory,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="course", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/learning/training-assignments", response_model=list[TrainingAssignmentOut])
def list_training_assignments(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[TrainingAssignment]:
    user, membership = ctx
    q = select(TrainingAssignment).where(TrainingAssignment.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(TrainingAssignment.employee_id == emp.id)
    elif employee_id:
        q = q.where(TrainingAssignment.employee_id == employee_id)
    return list(db.execute(q.order_by(TrainingAssignment.created_at.desc())).scalars().all())


@router.post("/learning/training-assignments", response_model=TrainingAssignmentOut, status_code=status.HTTP_201_CREATED)
def create_training_assignment(
    company_id: str,
    body: TrainingAssignmentCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
    db: Annotated[Session, Depends(get_db)],
) -> TrainingAssignment:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    c = db.execute(select(Course).where(Course.id == body.course_id, Course.company_id == company_id)).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    row = TrainingAssignment(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        course_id=body.course_id,
        assigned_by=user.id,
        due_date=body.due_date,
        status=body.status,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="training_assignment", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.post("/learning/training-completions", response_model=TrainingCompletionOut, status_code=status.HTTP_201_CREATED)
def create_training_completion(
    company_id: str,
    body: TrainingCompletionCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> TrainingCompletion:
    user, membership = ctx
    ta = db.execute(
        select(TrainingAssignment).where(
            TrainingAssignment.id == body.assignment_id, TrainingAssignment.company_id == company_id
        )
    ).scalar_one_or_none()
    if ta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or ta.employee_id != emp.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")
    elif membership.role not in _LD and membership.role != "company_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="L&D, admin, or employee self required")

    row = TrainingCompletion(
        id=uuid_str(),
        assignment_id=body.assignment_id,
        company_id=company_id,
        score=body.score,
        certificate_url=body.certificate_url,
    )
    db.add(row)
    ta.status = "completed"
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="training_completion", entity_id=row.id, action="create", changes_json={})
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="training",
        action_type="complete",
        action_detail="training_completion",
        entity_type="training_completion",
        entity_id=row.id,
        reference_started_at=ta.created_at,
    )
    db.commit()
    db.refresh(row)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="training.completed",
        entity_type="training_completion",
        entity_id=row.id,
        actor_user_id=user.id,
        data={"assignment_id": body.assignment_id, "score": body.score},
    )
    return row


@router.get("/learning/skill-profiles/{employee_id}", response_model=SkillProfileOut)
def get_skill_profile(
    company_id: str,
    employee_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SkillProfile:
    user, membership = ctx
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or emp.id != employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your profile")
    if get_employee_by_id(db, company_id, employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    r = db.execute(
        select(SkillProfile).where(SkillProfile.company_id == company_id, SkillProfile.employee_id == employee_id)
    )
    row = r.scalar_one_or_none()
    if row is None:
        row = SkillProfile(id=uuid_str(), company_id=company_id, employee_id=employee_id, skills_json={})
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/learning/skill-profiles/{employee_id}", response_model=SkillProfileOut)
def upsert_skill_profile(
    company_id: str,
    employee_id: str,
    body: SkillProfileUpsert,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SkillProfile:
    user, membership = ctx
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or emp.id != employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your profile")
    elif membership.role not in _LD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="L&D or self only")
    if get_employee_by_id(db, company_id, employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    r = db.execute(
        select(SkillProfile).where(SkillProfile.company_id == company_id, SkillProfile.employee_id == employee_id)
    )
    row = r.scalar_one_or_none()
    if row is None:
        row = SkillProfile(id=uuid_str(), company_id=company_id, employee_id=employee_id, skills_json=body.skills_json)
        db.add(row)
    else:
        row.skills_json = body.skills_json
        row.updated_at = datetime.now(timezone.utc)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="skill_profile", entity_id=employee_id, action="upsert", changes_json={})
    db.commit()
    db.refresh(row)
    return row
