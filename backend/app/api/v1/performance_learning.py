from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Query, status
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
    ReviewCyclePeerNomination,
    PeerReviewFeedback,
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
    EmployeeCycleGoalRowOut,
    EmployeeMyCycleGoalsGroupOut,
    GoalCreate,
    GoalCycleEmployeeTrackingOut,
    GoalCycleTrackingOut,
    GoalOut,
    GoalUpdate,
    PeerReviewCycleCardOut,
    PeerReviewPendingRequestOut,
    PipAtRiskEmployeeOut,
    LearningEmployeeSuggestion,
    PipCreate,
    PipOut,
    ReviewCycleCreate,
    ReviewCycleKpiDefinitionOut,
    ReviewCycleOut,
    SkillProfileOut,
    SkillProfileUpsert,
    SubmitMyCycleGoalsBody,
    SubmitMyCycleGoalsResponse,
    SubmitPeerReviewFeedbackBody,
    SubmitPeerReviewFeedbackResponse,
    SubmitPeerReviewNominationsBody,
    SubmitPeerReviewNominationsResponse,
    TrainingAssignmentCreate,
    TrainingAssignmentEnrichedOut,
    TrainingAssignmentOut,
    TrainingCompletionCreate,
    TrainingCompletionOut,
)
from app.services.audit import write_audit
from app.services.activity_tracking import log_tracked_hr_action
from app.services.employee_detail import display_name_and_email
from app.services.employee_detail import display_name_and_email
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.works_with_peers import works_with_peer_employee_ids

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


def _notify_employees_review_cycle_peer_review(
    db: Session,
    *,
    company_id: str,
    cycle_id: str,
    cycle_name: str,
    goals_deadline: str,
) -> None:
    """Remind employees (except CEO / org root: no manager) to nominate up to 3 peer reviewers for this cycle."""
    deadline_display = goals_deadline.strip()
    title = "Request peer reviews"
    message = (
        f'For review cycle "{cycle_name}" (goals due {deadline_display}), select up to 3 colleagues from your '
        "works-with cohort (same manager and grade) to ask for a peer review."
    )
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
                type="review_cycle_peer_review",
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
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SELF_SERVICE_PERFORMANCE_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> list[ReviewCycle]:
    """List cycles for UI filters (e.g. team goals, my goals). Employee-line roles may read; create remains HR-only."""
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
        _notify_employees_review_cycle_peer_review(
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


@router.get(
    "/performance/review-cycles/{cycle_id}/goal-cycle-tracking",
    response_model=GoalCycleTrackingOut,
)
def get_goal_cycle_tracking(
    company_id: str,
    cycle_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
) -> GoalCycleTrackingOut:
    """HR: per-employee status for goals submission, manager ratings on KPI rows, and peer reviews (one cycle)."""
    cycle = _get_cycle(db, company_id, cycle_id)
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
    kpi_count = len(kpis)

    emps = list(
        db.execute(
            select(Employee)
            .where(
                Employee.company_id == company_id,
                Employee.status == "active",
                Employee.user_id.isnot(None),
                Employee.manager_id.isnot(None),
            )
            .order_by(Employee.employee_code)
        )
        .scalars()
        .all()
    )
    if not emps:
        return GoalCycleTrackingOut(review_cycle=ReviewCycleOut.model_validate(cycle), rows=[])

    emp_ids = [e.id for e in emps]
    manager_ids = list({e.manager_id for e in emps if e.manager_id})

    users: dict[str, User] = {}
    uids = [e.user_id for e in emps if e.user_id]
    if uids:
        for u in db.execute(select(User).where(User.id.in_(uids))).scalars().all():
            users[u.id] = u

    mgr_emps: dict[str, Employee] = {}
    if manager_ids:
        for m in db.execute(
            select(Employee).where(Employee.id.in_(manager_ids), Employee.company_id == company_id)
        ).scalars().all():
            mgr_emps[m.id] = m
    mgr_uids = [m.user_id for m in mgr_emps.values() if m.user_id]
    if mgr_uids:
        for u in db.execute(select(User).where(User.id.in_(mgr_uids))).scalars().all():
            users[u.id] = u

    subs = {
        s.employee_id: s
        for s in db.execute(
            select(ReviewCycleEmployeeGoalSubmission).where(
                ReviewCycleEmployeeGoalSubmission.company_id == company_id,
                ReviewCycleEmployeeGoalSubmission.review_cycle_id == cycle_id,
            )
        ).scalars().all()
    }

    goals = list(
        db.execute(
            select(Goal).where(
                Goal.company_id == company_id,
                Goal.cycle_id == cycle_id,
                Goal.kpi_definition_id.isnot(None),
                Goal.employee_id.in_(emp_ids),
            )
        )
        .scalars()
        .all()
    )
    goals_by_emp: dict[str, list[Goal]] = defaultdict(list)
    for g in goals:
        goals_by_emp[g.employee_id].append(g)

    noms = {
        n.requester_employee_id: n
        for n in db.execute(
            select(ReviewCyclePeerNomination).where(
                ReviewCyclePeerNomination.company_id == company_id,
                ReviewCyclePeerNomination.review_cycle_id == cycle_id,
            )
        ).scalars().all()
    }

    peer_rows = list(
        db.execute(
            select(PeerReviewFeedback).where(
                PeerReviewFeedback.company_id == company_id,
                PeerReviewFeedback.review_cycle_id == cycle_id,
            )
        )
        .scalars()
        .all()
    )
    peer_by_subject: dict[str, list[PeerReviewFeedback]] = defaultdict(list)
    for pr in peer_rows:
        peer_by_subject[pr.subject_employee_id].append(pr)

    extra_ids: set[str] = set()
    for n in noms.values():
        for rid in n.reviewer_employee_ids_json or []:
            s = str(rid).strip()
            if s:
                extra_ids.add(s)
    for pr in peer_rows:
        extra_ids.add(pr.reviewer_employee_id)

    extra_emps: dict[str, Employee] = {}
    remaining = extra_ids - set(emp_ids) - set(mgr_emps.keys())
    if remaining:
        for e in db.execute(
            select(Employee).where(Employee.id.in_(list(remaining)), Employee.company_id == company_id)
        ).scalars().all():
            extra_emps[e.id] = e
    ex_uids = [e.user_id for e in extra_emps.values() if e.user_id]
    if ex_uids:
        for u in db.execute(select(User).where(User.id.in_(ex_uids))).scalars().all():
            users[u.id] = u

    all_emp_by_id: dict[str, Employee] = {e.id: e for e in emps}
    all_emp_by_id.update(mgr_emps)
    all_emp_by_id.update(extra_emps)

    def _name_for_emp_id(eid: str) -> str:
        e = all_emp_by_id.get(eid)
        if e is None:
            return eid[:8] + "…"
        u = users.get(e.user_id) if e.user_id else None
        n, _ = display_name_and_email(e, u)
        return n

    rows_out: list[GoalCycleEmployeeTrackingOut] = []
    for emp in emps:
        eu = users.get(emp.user_id) if emp.user_id else None
        ename, eemail = display_name_and_email(emp, eu)
        mgr_name: str | None = None
        if emp.manager_id:
            me = mgr_emps.get(emp.manager_id)
            if me is not None:
                mu = users.get(me.user_id) if me.user_id else None
                mgr_name, _ = display_name_and_email(me, mu)

        sub = subs.get(emp.id)
        goals_submitted = sub is not None
        goals_submitted_at = sub.submitted_at if sub else None

        eg = goals_by_emp.get(emp.id, [])
        rated = [g for g in eg if g.manager_rating is not None]
        manager_rated_goal_count = len(rated)
        ratings = [g.manager_rating for g in rated if g.manager_rating is not None]
        avg_rating: float | None = None
        if ratings:
            avg_rating = round(sum(ratings) / len(ratings), 1)

        if kpi_count == 0:
            mgr_status = "no_kpis"
        elif not goals_submitted:
            mgr_status = "awaiting_goals"
        elif manager_rated_goal_count == 0:
            mgr_status = "pending_review"
        elif manager_rated_goal_count < kpi_count:
            mgr_status = "partial"
        else:
            mgr_status = "complete"

        nom = noms.get(emp.id)
        nom_ids: list[str] = []
        if nom and isinstance(nom.reviewer_employee_ids_json, list):
            nom_ids = [str(x).strip() for x in nom.reviewer_employee_ids_json if str(x).strip()]
        nom_names = [_name_for_emp_id(x) for x in nom_ids]

        pr_list = peer_by_subject.get(emp.id, [])
        pr_names = sorted({_name_for_emp_id(p.reviewer_employee_id) for p in pr_list})

        rows_out.append(
            GoalCycleEmployeeTrackingOut(
                employee_id=emp.id,
                employee_display_name=ename,
                employee_display_email=eemail,
                employee_code=emp.employee_code,
                manager_employee_id=emp.manager_id,
                manager_display_name=mgr_name,
                goals_submitted=goals_submitted,
                goals_submitted_at=goals_submitted_at,
                kpi_goal_count=kpi_count,
                manager_rated_goal_count=manager_rated_goal_count,
                manager_review_status=mgr_status,
                avg_manager_rating=avg_rating,
                nominated_peer_count=len(nom_ids),
                nominated_peer_display_names=nom_names,
                peer_reviews_received_count=len(pr_list),
                peer_reviewer_display_names=pr_names,
            )
        )

    return GoalCycleTrackingOut(review_cycle=ReviewCycleOut.model_validate(cycle), rows=rows_out)


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


def _peer_nomination_for(
    db: Session, *, company_id: str, review_cycle_id: str, requester_employee_id: str
) -> ReviewCyclePeerNomination | None:
    return db.execute(
        select(ReviewCyclePeerNomination).where(
            ReviewCyclePeerNomination.company_id == company_id,
            ReviewCyclePeerNomination.review_cycle_id == review_cycle_id,
            ReviewCyclePeerNomination.requester_employee_id == requester_employee_id,
        )
    ).scalar_one_or_none()


def _user_has_peer_review_notification(db: Session, *, company_id: str, user_id: str, cycle_id: str) -> bool:
    return (
        db.execute(
            select(Notification.id).where(
                Notification.company_id == company_id,
                Notification.user_id == user_id,
                Notification.type == "review_cycle_peer_review",
                Notification.entity_type == "review_cycle",
                Notification.entity_id == cycle_id,
            ).limit(1)
        ).scalar_one_or_none()
        is not None
    )


def _peer_feedback_row(
    db: Session,
    *,
    company_id: str,
    review_cycle_id: str,
    reviewer_employee_id: str,
    subject_employee_id: str,
) -> PeerReviewFeedback | None:
    return db.execute(
        select(PeerReviewFeedback).where(
            PeerReviewFeedback.company_id == company_id,
            PeerReviewFeedback.review_cycle_id == review_cycle_id,
            PeerReviewFeedback.reviewer_employee_id == reviewer_employee_id,
            PeerReviewFeedback.subject_employee_id == subject_employee_id,
        )
    ).scalar_one_or_none()


def _has_peer_review_request_notification(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    review_cycle_id: str,
    subject_employee_id: str,
    reviewer_employee_id: str,
) -> bool:
    notifs = db.execute(
        select(Notification).where(
            Notification.company_id == company_id,
            Notification.user_id == user_id,
            Notification.type == "peer_review_requested",
            Notification.entity_type == "peer_review_request",
            Notification.entity_id == subject_employee_id,
        )
    ).scalars().all()
    for n in notifs:
        ctx = n.context_json if isinstance(n.context_json, dict) else {}
        if ctx.get("review_cycle_id") == review_cycle_id and ctx.get("reviewer_employee_id") == reviewer_employee_id:
            return True
    return False


@router.get(
    "/performance/my-pending-peer-feedback-requests",
    response_model=list[PeerReviewPendingRequestOut],
)
def list_my_pending_peer_feedback_requests(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PeerReviewPendingRequestOut]:
    """Peer reviews you were asked to write (from notifications), excluding completed feedback."""
    user, membership = ctx
    if membership.role not in _SELF_SERVICE_PERFORMANCE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        return []

    notifs = db.execute(
        select(Notification)
        .where(
            Notification.company_id == company_id,
            Notification.user_id == user.id,
            Notification.type == "peer_review_requested",
        )
        .order_by(Notification.created_at.desc())
    ).scalars().all()

    seen: set[tuple[str, str]] = set()
    out: list[PeerReviewPendingRequestOut] = []
    for n in notifs:
        subj_id = n.entity_id
        if not subj_id:
            continue
        ctx = n.context_json if isinstance(n.context_json, dict) else {}
        cid = ctx.get("review_cycle_id")
        if not isinstance(cid, str) or not cid.strip():
            continue
        if ctx.get("reviewer_employee_id") != emp.id:
            continue
        key = (cid, subj_id)
        if key in seen:
            continue
        seen.add(key)
        if _peer_feedback_row(
            db,
            company_id=company_id,
            review_cycle_id=cid,
            reviewer_employee_id=emp.id,
            subject_employee_id=subj_id,
        ):
            continue
        subj = get_employee_by_id(db, company_id, subj_id)
        if subj is None:
            continue
        su = (
            db.execute(select(User).where(User.id == subj.user_id)).scalar_one_or_none() if subj.user_id else None
        )
        dn, de = display_name_and_email(subj, su)
        try:
            cycle = _get_cycle(db, company_id, cid)
        except HTTPException:
            continue
        out.append(
            PeerReviewPendingRequestOut(
                review_cycle_id=cid,
                cycle_name=cycle.name,
                subject_employee_id=subj_id,
                subject_display_name=dn,
                subject_display_email=de,
            )
        )
    return out


@router.get(
    "/performance/my-peer-review-cycles",
    response_model=list[PeerReviewCycleCardOut],
)
def list_my_peer_review_cycles(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PeerReviewCycleCardOut]:
    """Cycles where the user was asked to nominate peer reviewers, plus any existing nomination."""
    user, membership = ctx
    if membership.role not in _SELF_SERVICE_PERFORMANCE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None or emp.manager_id is None:
        return []

    n_sub = (
        select(Notification.entity_id)
        .where(
            Notification.company_id == company_id,
            Notification.user_id == user.id,
            Notification.type == "review_cycle_peer_review",
            Notification.entity_type == "review_cycle",
            Notification.entity_id.isnot(None),
        )
        .distinct()
    )
    cycle_ids = [row[0] for row in db.execute(n_sub).all() if row[0]]
    if not cycle_ids:
        return []

    out: list[PeerReviewCycleCardOut] = []
    for cid in cycle_ids:
        try:
            cycle = _get_cycle(db, company_id, cid)
        except HTTPException:
            continue
        nom = _peer_nomination_for(db, company_id=company_id, review_cycle_id=cid, requester_employee_id=emp.id)
        raw_ids = nom.reviewer_employee_ids_json if nom and isinstance(nom.reviewer_employee_ids_json, list) else []
        reviewer_ids = [str(x) for x in raw_ids]
        out.append(
            PeerReviewCycleCardOut(
                cycle=ReviewCycleOut.model_validate(cycle),
                peer_nominations_submitted_at=nom.submitted_at if nom else None,
                selected_reviewer_employee_ids=reviewer_ids,
            )
        )
    return out


@router.post(
    "/performance/review-cycles/{cycle_id}/submit-peer-review-nominations",
    response_model=SubmitPeerReviewNominationsResponse,
    status_code=status.HTTP_200_OK,
)
def submit_peer_review_nominations(
    company_id: str,
    cycle_id: str,
    body: SubmitPeerReviewNominationsBody,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SubmitPeerReviewNominationsResponse:
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
            detail="Peer review nominations apply only to employees who report to a manager.",
        )

    cycle = _get_cycle(db, company_id, cycle_id)
    if not _user_has_peer_review_notification(db, company_id=company_id, user_id=user.id, cycle_id=cycle_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You were not notified for this review cycle's peer-review step.",
        )

    if _peer_nomination_for(db, company_id=company_id, review_cycle_id=cycle_id, requester_employee_id=emp.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted your peer reviewer choices for this cycle.",
        )

    allowed = works_with_peer_employee_ids(db, company_id, emp)
    reviewer_ids = list(body.reviewer_employee_ids)
    if not set(reviewer_ids).issubset(allowed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Each reviewer must be in your works-with cohort for this cycle.",
        )

    rev_emps: list[Employee] = []
    for rid in reviewer_ids:
        rev_emp = get_employee_by_id(db, company_id, rid)
        if rev_emp is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown reviewer employee id")
        if not rev_emp.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Reviewer {rev_emp.employee_code} has no linked user account; cannot send a notification.",
            )
        rev_emps.append(rev_emp)

    req_name, _ = display_name_and_email(emp, user)

    nom = ReviewCyclePeerNomination(
        id=uuid_str(),
        company_id=company_id,
        review_cycle_id=cycle_id,
        requester_employee_id=emp.id,
        reviewer_employee_ids_json=reviewer_ids,
    )
    db.add(nom)
    db.flush()

    reviewers_notified = 0
    for rev_emp in rev_emps:
        title = "Peer review requested"
        message = f'{req_name} asked you to add your peer review for them in "{cycle.name}".'
        db.add(
            Notification(
                id=uuid_str(),
                company_id=company_id,
                user_id=rev_emp.user_id,
                type="peer_review_requested",
                title=title,
                message=message,
                entity_type="peer_review_request",
                entity_id=emp.id,
                context_json={
                    "review_cycle_id": cycle_id,
                    "cycle_name": cycle.name,
                    "requester_employee_id": emp.id,
                    "reviewer_employee_id": rev_emp.id,
                },
            )
        )
        reviewers_notified += 1

    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="review_cycle_peer_nomination",
        entity_id=nom.id,
        action="submit",
        changes_json={"review_cycle_id": cycle_id, "reviewer_employee_ids": reviewer_ids},
    )
    db.commit()
    db.refresh(nom)
    return SubmitPeerReviewNominationsResponse(
        review_cycle_id=cycle_id,
        submitted_at=nom.submitted_at,
        reviewers_notified=reviewers_notified,
    )


@router.post(
    "/performance/review-cycles/{cycle_id}/submit-peer-feedback",
    response_model=SubmitPeerReviewFeedbackResponse,
    status_code=status.HTTP_200_OK,
)
def submit_peer_feedback(
    company_id: str,
    cycle_id: str,
    body: SubmitPeerReviewFeedbackBody,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SubmitPeerReviewFeedbackResponse:
    """Save structured peer feedback for a colleague who nominated you (per review cycle)."""
    user, membership = ctx
    if membership.role not in _SELF_SERVICE_PERFORMANCE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires employee or HR ops membership.",
        )
    emp = get_employee_for_user(db, company_id, user.id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No employee record")

    cycle = _get_cycle(db, company_id, cycle_id)
    subject_id = body.subject_employee_id.strip()
    if subject_id == emp.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot submit peer feedback about yourself")

    subj = get_employee_by_id(db, company_id, subject_id)
    if subj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject employee not found")

    if not _has_peer_review_request_notification(
        db,
        company_id=company_id,
        user_id=user.id,
        review_cycle_id=cycle_id,
        subject_employee_id=subject_id,
        reviewer_employee_id=emp.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No peer review request found for this cycle and colleague.",
        )

    if _peer_feedback_row(
        db,
        company_id=company_id,
        review_cycle_id=cycle_id,
        reviewer_employee_id=emp.id,
        subject_employee_id=subject_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted peer feedback for this person in this cycle.",
        )

    fb = PeerReviewFeedback(
        id=uuid_str(),
        company_id=company_id,
        review_cycle_id=cycle_id,
        reviewer_employee_id=emp.id,
        subject_employee_id=subject_id,
        strengths=body.strengths.strip(),
        improvements=body.improvements.strip(),
        additional_feedback=body.additional_feedback,
    )
    db.add(fb)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="peer_review_feedback",
        entity_id=fb.id,
        action="submit",
        changes_json={"review_cycle_id": cycle_id, "subject_employee_id": subject_id},
    )
    reviewer_name, _ = display_name_and_email(emp, user)
    if subj.user_id:
        db.add(
            Notification(
                id=uuid_str(),
                company_id=company_id,
                user_id=subj.user_id,
                type="peer_review_submitted",
                title="Peer review submitted",
                message=f'{reviewer_name} submitted their peer review for you for "{cycle.name}".',
                entity_type="peer_review_feedback",
                entity_id=fb.id,
                context_json={
                    "review_cycle_id": cycle_id,
                    "cycle_name": cycle.name,
                    "reviewer_employee_id": emp.id,
                    "subject_employee_id": subject_id,
                    "peer_review_feedback_id": fb.id,
                },
            )
        )
    db.commit()
    return SubmitPeerReviewFeedbackResponse(review_cycle_id=cycle_id, subject_employee_id=subject_id)


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


@router.get("/performance/pips/at-risk-employees", response_model=list[PipAtRiskEmployeeOut])
def list_pip_at_risk_employees(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_HR_PERFORMANCE_CONSOLE))],
    db: Annotated[Session, Depends(get_db)],
    review_cycle_id: str | None = None,
    rating_below: float = Query(3.0, ge=0.01, description="Include employees with avg manager KPI rating strictly below this value."),
) -> list[PipAtRiskEmployeeOut]:
    """Employees with manager-rated KPI goals averaging below `rating_below`, excluding those already in an active PIP."""
    if review_cycle_id:
        _get_cycle(db, company_id, review_cycle_id.strip())
        cid = review_cycle_id.strip()
    else:
        cid = None

    q = select(Goal).where(
        Goal.company_id == company_id,
        Goal.kpi_definition_id.isnot(None),
        Goal.manager_rating.isnot(None),
    )
    if cid:
        q = q.where(Goal.cycle_id == cid)
    goals = list(db.execute(q).scalars().all())

    by_emp: dict[str, list[int]] = defaultdict(list)
    for g in goals:
        by_emp[g.employee_id].append(int(g.manager_rating))

    active_pip_emps = set(
        db.execute(
            select(Pip.employee_id).where(Pip.company_id == company_id, Pip.status == "active")
        ).scalars().all()
    )

    candidates: list[tuple[str, float, int]] = []
    for emp_id, ratings in by_emp.items():
        if emp_id in active_pip_emps or not ratings:
            continue
        avg = sum(ratings) / len(ratings)
        if avg < float(rating_below):
            candidates.append((emp_id, avg, len(ratings)))

    candidates.sort(key=lambda x: (x[1], x[0]))

    out: list[PipAtRiskEmployeeOut] = []
    for emp_id, avg, n_rated in candidates:
        emp = get_employee_by_id(db, company_id, emp_id)
        if emp is None or emp.status != "active":
            continue
        u = db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none() if emp.user_id else None
        dn, de = display_name_and_email(emp, u)
        out.append(
            PipAtRiskEmployeeOut(
                employee_id=emp_id,
                employee_display_name=dn,
                employee_display_email=de,
                employee_code=emp.employee_code,
                avg_manager_rating=round(avg, 2),
                manager_rated_goal_count=n_rated,
                review_cycle_id=cid,
            )
        )
    return out


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

    active_pip = db.execute(
        select(Pip.id).where(
            Pip.company_id == company_id,
            Pip.employee_id == body.employee_id,
            Pip.status == "active",
        ).limit(1)
    ).scalar_one_or_none()
    if active_pip is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This employee already has an active PIP.",
        )

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
    db.flush()
    if body.notify_employee:
        emp = get_employee_by_id(db, company_id, body.employee_id)
        if emp is not None and emp.user_id:
            db.add(
                Notification(
                    id=uuid_str(),
                    company_id=company_id,
                    user_id=emp.user_id,
                    type="pip_placed",
                    title="Performance improvement plan",
                    message="You have been placed in PIP.",
                    entity_type="pip",
                    entity_id=row.id,
                    context_json={"employee_id": body.employee_id},
                )
            )
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
