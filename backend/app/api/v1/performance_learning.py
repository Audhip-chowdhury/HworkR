from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.performance_learning import (
    Assessment,
    Course,
    Goal,
    Pip,
    ReviewCycle,
    SkillProfile,
    TrainingAssignment,
    TrainingCompletion,
)
from app.models.user import User
from app.schemas.performance_learning import (
    AssessmentCreate,
    AssessmentOut,
    CourseCreate,
    CourseEmployeeScoreRow,
    CourseOut,
    GoalCreate,
    GoalOut,
    GoalUpdate,
    LearningEmployeeSuggestion,
    PipCreate,
    PipOut,
    ReviewCycleCreate,
    ReviewCycleOut,
    SkillProfileOut,
    SkillProfileUpsert,
    TrainingAssignmentCreate,
    TrainingAssignmentEnrichedOut,
    TrainingAssignmentOut,
    TrainingCompletionCreate,
    TrainingCompletionOut,
)
from app.services.audit import write_audit
from app.services.activity_tracking import log_tracked_hr_action
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.employee_detail import display_name_and_email
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user

router = APIRouter(prefix="/companies/{company_id}", tags=["performance-learning"])

_LD = frozenset({"company_admin", "ld_performance"})
_HR_LD = frozenset(
    {"company_admin", "hr_ops", "ld_performance", "talent_acquisition", "compensation_analytics"}
)


def _today_iso() -> str:
    return date.today().isoformat()


def _is_before_or_on_due(due: str | None, today: str) -> bool:
    if not due:
        return True
    ds = due[:10]
    try:
        return date.fromisoformat(ds) >= date.fromisoformat(today)
    except ValueError:
        return True


def _enrich_assignment(
    db: Session,
    ta: TrainingAssignment,
    course: Course,
    completion: TrainingCompletion | None,
    today: str,
) -> TrainingAssignmentEnrichedOut:
    eff_due = ta.due_date or course.due_date
    # Score 0 = closed early; no credit until they finish the video for full points.
    credited = completion is not None and (
        completion.score is None or float(completion.score) > 0
    )
    overdue = not credited and eff_due is not None and not _is_before_or_on_due(eff_due, today)
    disp = "completed" if credited else "pending"
    return TrainingAssignmentEnrichedOut(
        id=ta.id,
        company_id=ta.company_id,
        employee_id=ta.employee_id,
        course_id=ta.course_id,
        assigned_by=ta.assigned_by,
        due_date=eff_due,
        status=ta.status,
        created_at=ta.created_at,
        course_title=course.title,
        course_points=float(course.points or 0),
        youtube_url=course.content_url,
        completion_score=float(completion.score) if completion and completion.score is not None else None,
        completed_at=completion.completed_at if completion else None,
        display_status=disp,
        overdue_before_due=overdue,
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
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ReviewCycle]:
    r = db.execute(select(ReviewCycle).where(ReviewCycle.company_id == company_id).order_by(ReviewCycle.created_at.desc()))
    return list(r.scalars().all())


@router.post("/performance/review-cycles", response_model=ReviewCycleOut, status_code=status.HTTP_201_CREATED)
def create_review_cycle(
    company_id: str,
    body: ReviewCycleCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
    db: Annotated[Session, Depends(get_db)],
) -> ReviewCycle:
    user, _ = ctx
    row = ReviewCycle(
        id=uuid_str(),
        company_id=company_id,
        name=body.name.strip(),
        type=body.type,
        start_date=body.start_date,
        end_date=body.end_date,
        status=body.status,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="review_cycle", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


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
        q = q.where(Goal.employee_id == emp.id)
    elif employee_id:
        q = q.where(Goal.employee_id == employee_id)
    return list(db.execute(q.order_by(Goal.created_at.desc())).scalars().all())


@router.post("/performance/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    company_id: str,
    body: GoalCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
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
        title=body.title.strip(),
        description=body.description,
        target=body.target,
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
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or row.employee_id != emp.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your goal")
        raw = body.model_dump(exclude_unset=True)
        data = {k: v for k, v in raw.items() if k in {"progress", "description", "target"}}
        for k, v in data.items():
            setattr(row, k, v)
    else:
        if membership.role not in _LD:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="L&D or admin required")
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
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
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
    elif employee_id:
        q = q.where(Assessment.employee_id == employee_id)
    return list(db.execute(q.order_by(Assessment.created_at.desc())).scalars().all())


@router.post("/performance/pips", response_model=PipOut, status_code=status.HTTP_201_CREATED)
def create_pip(
    company_id: str,
    body: PipCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_LD))],
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
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[Pip]:
    q = select(Pip).where(Pip.company_id == company_id)
    if employee_id:
        q = q.where(Pip.employee_id == employee_id)
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
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_LD))],
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
        points=float(body.points),
        due_date=body.due_date,
    )
    db.add(row)
    db.flush()
    emp_ids = list(
        db.execute(select(Employee.id).where(Employee.company_id == company_id)).scalars().all()
    )
    for eid in emp_ids:
        dup = db.execute(
            select(TrainingAssignment).where(
                TrainingAssignment.company_id == company_id,
                TrainingAssignment.employee_id == eid,
                TrainingAssignment.course_id == row.id,
            )
        ).scalar_one_or_none()
        if dup is not None:
            continue
        db.add(
            TrainingAssignment(
                id=uuid_str(),
                company_id=company_id,
                employee_id=eid,
                course_id=row.id,
                assigned_by=user.id,
                due_date=body.due_date,
                status="assigned",
            )
        )
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="course", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/learning/training-assignments", response_model=list[TrainingAssignmentEnrichedOut])
def list_training_assignments(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TrainingAssignmentEnrichedOut]:
    user, _membership = ctx
    emp_self = get_employee_for_user(db, company_id, user.id)
    if emp_self is None:
        return []
    q = select(TrainingAssignment).where(
        TrainingAssignment.company_id == company_id,
        TrainingAssignment.employee_id == emp_self.id,
    )

    rows = list(db.execute(q.order_by(TrainingAssignment.created_at.desc())).scalars().all())
    today = _today_iso()
    out: list[TrainingAssignmentEnrichedOut] = []
    for ta in rows:
        c = db.execute(select(Course).where(Course.id == ta.course_id, Course.company_id == company_id)).scalar_one_or_none()
        if c is None:
            continue
        tc = db.execute(
            select(TrainingCompletion)
            .where(TrainingCompletion.assignment_id == ta.id)
            .order_by(TrainingCompletion.completed_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        out.append(_enrich_assignment(db, ta, c, tc, today))
    return out


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
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None or ta.employee_id != emp.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")

    course = db.execute(select(Course).where(Course.id == ta.course_id, Course.company_id == company_id)).scalar_one_or_none()
    score_val: float | None
    if body.score is not None:
        score_val = float(body.score)
    elif course is not None:
        score_val = float(course.points or 0)
    else:
        score_val = None

    dup = db.execute(
        select(TrainingCompletion).where(TrainingCompletion.assignment_id == body.assignment_id)
    ).scalar_one_or_none()
    if dup is not None:
        if (
            dup.score is not None
            and float(dup.score) == 0
            and score_val is not None
            and float(score_val) > 0
        ):
            dup.score = score_val
            dup.completed_at = datetime.now(timezone.utc)
            ta.status = "completed"
            log_tracked_hr_action(
                db,
                company_id=company_id,
                user_id=user.id,
                role=membership.role,
                module="training",
                action_type="complete",
                action_detail="training_completion",
                entity_type="training_completion",
                entity_id=dup.id,
                reference_started_at=ta.created_at,
            )
            write_audit(
                db,
                company_id=company_id,
                user_id=user.id,
                entity_type="training_completion",
                entity_id=dup.id,
                action="update",
                changes_json={"score": score_val},
            )
            db.commit()
            db.refresh(dup)
            publish_domain_event_post_commit(
                company_id=company_id,
                event_type="training.completed",
                entity_type="training_completion",
                entity_id=dup.id,
                actor_user_id=user.id,
                data={"assignment_id": body.assignment_id, "score": score_val},
            )
            return dup
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Training already marked complete")

    row = TrainingCompletion(
        id=uuid_str(),
        assignment_id=body.assignment_id,
        company_id=company_id,
        score=score_val,
        certificate_url=body.certificate_url,
    )
    db.add(row)
    abandon = body.score is not None and float(body.score) == 0.0
    ta.status = "assigned" if abandon else "completed"
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="training_completion", entity_id=row.id, action="create", changes_json={})
    log_tracked_hr_action(
        db,
        company_id=company_id,
        user_id=user.id,
        role=membership.role,
        module="training",
        action_type="complete",
        action_detail="training_completion_abandon" if abandon else "training_completion",
        entity_type="training_completion",
        entity_id=row.id,
        reference_started_at=ta.created_at,
    )
    db.commit()
    db.refresh(row)
    if not abandon:
        publish_domain_event_post_commit(
            company_id=company_id,
            event_type="training.completed",
            entity_type="training_completion",
            entity_id=row.id,
            actor_user_id=user.id,
            data={"assignment_id": body.assignment_id, "score": score_val},
        )
    return row


@router.get("/learning/courses/{course_id}/employee-scores", response_model=list[CourseEmployeeScoreRow])
def list_course_employee_scores(
    company_id: str,
    course_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_LD))],
    db: Annotated[Session, Depends(get_db)],
    employee_q: str | None = Query(None, description="Filter when length >= 4"),
    employee_id: str | None = Query(None, description="Exact employee match"),
) -> list[CourseEmployeeScoreRow]:
    course = db.execute(
        select(Course).where(Course.id == course_id, Course.company_id == company_id)
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    assignments = list(
        db.execute(
            select(TrainingAssignment).where(
                TrainingAssignment.company_id == company_id,
                TrainingAssignment.course_id == course_id,
            )
        )
        .scalars()
        .all()
    )
    today = date.today()
    out: list[CourseEmployeeScoreRow] = []
    qlow = (employee_q or "").strip().lower()
    for ta in assignments:
        if employee_id and ta.employee_id != employee_id:
            continue
        emp = get_employee_by_id(db, company_id, ta.employee_id)
        if emp is None:
            continue
        u = (
            db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none()
            if emp.user_id
            else None
        )
        dn, _ = display_name_and_email(emp, u)
        code = (emp.employee_code or "").lower()
        if len(qlow) >= 4 and qlow not in dn.lower() and qlow not in code:
            continue

        tc = db.execute(
            select(TrainingCompletion)
            .where(TrainingCompletion.assignment_id == ta.id)
            .order_by(TrainingCompletion.completed_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        eff_due_str = ta.due_date or course.due_date
        credited = tc is not None and (tc.score is None or float(tc.score) > 0)
        overdue = False
        if eff_due_str:
            try:
                eff_d = date.fromisoformat(eff_due_str[:10])
                overdue = not credited and tc is None and eff_d < today
            except ValueError:
                overdue = False

        if tc is not None:
            sc = float(tc.score) if tc.score is not None else float(course.points or 0)
            status_label = "Completed" if credited else "Closed early (score 0)"
            out.append(
                CourseEmployeeScoreRow(
                    employee_id=emp.id,
                    employee_code=emp.employee_code,
                    display_name=dn,
                    score=sc,
                    status_label=status_label,
                    overdue_before_due=False,
                    didnt_attend=False,
                )
            )
        elif overdue:
            out.append(
                CourseEmployeeScoreRow(
                    employee_id=emp.id,
                    employee_code=emp.employee_code,
                    display_name=dn,
                    score=0.0,
                    status_label="Didn't attend",
                    overdue_before_due=True,
                    didnt_attend=True,
                )
            )
        else:
            out.append(
                CourseEmployeeScoreRow(
                    employee_id=emp.id,
                    employee_code=emp.employee_code,
                    display_name=dn,
                    score=0.0,
                    status_label="Pending",
                    overdue_before_due=False,
                    didnt_attend=False,
                )
            )
    return out


@router.get("/learning/employee-suggestions", response_model=list[LearningEmployeeSuggestion])
def learning_employee_suggestions(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_LD))],
    db: Annotated[Session, Depends(get_db)],
    q: str = Query(..., min_length=4, max_length=64),
) -> list[LearningEmployeeSuggestion]:
    qstrip = q.strip()
    emps = list(
        db.execute(select(Employee).where(Employee.company_id == company_id).limit(500)).scalars().all()
    )
    out: list[LearningEmployeeSuggestion] = []
    qlow = qstrip.lower()
    for emp in emps:
        u = (
            db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none()
            if emp.user_id
            else None
        )
        dn, _ = display_name_and_email(emp, u)
        hay = f"{dn} {emp.employee_code or ''}".lower()
        if qlow not in hay:
            continue
        out.append(LearningEmployeeSuggestion(employee_id=emp.id, label=f"{dn} ({emp.employee_code})"))
        if len(out) >= 20:
            break
    return out


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
