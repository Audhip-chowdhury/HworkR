import csv
import io
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.hr_ops import LeaveRequest
from app.models.membership import CompanyMembership
from app.models.performance_learning import TrainingAssignment, TrainingCompletion
from app.models.recruitment import Application, Offer, Requisition
from app.models.user import User

router = APIRouter(prefix="/companies/{company_id}/exports", tags=["exports"])

_EXPORT_ROLES = frozenset(
    {"company_admin", "talent_acquisition", "hr_ops", "ld_performance", "compensation_analytics"}
)


def _csv_response(filename: str, rows: list[list[Any]], header: list[str]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for row in rows:
        w.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/recruitment/applications.csv")
def export_applications(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    apps = db.execute(
        select(Application).where(Application.company_id == company_id).order_by(Application.applied_at.desc())
    ).scalars().all()
    rows = [
        [a.id, a.posting_id, a.candidate_user_id, a.stage, a.status, str(a.applied_at)] for a in apps
    ]
    return _csv_response(
        "applications.csv",
        rows,
        ["id", "posting_id", "candidate_user_id", "stage", "status", "applied_at"],
    )


@router.get("/recruitment/requisitions.csv")
def export_requisitions(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    reqs = db.execute(
        select(Requisition).where(Requisition.company_id == company_id).order_by(Requisition.created_at.desc())
    ).scalars().all()
    rows = [[r.id, r.status, str(r.headcount), r.created_by, str(r.created_at)] for r in reqs]
    return _csv_response("requisitions.csv", rows, ["id", "status", "headcount", "created_by", "created_at"])


@router.get("/recruitment/offers.csv")
def export_offers(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    offers = db.execute(select(Offer).where(Offer.company_id == company_id).order_by(Offer.sent_at.desc())).scalars().all()
    rows = [
        [o.id, o.application_id, o.status, str(o.sent_at), str(o.responded_at or "")] for o in offers
    ]
    return _csv_response("offers.csv", rows, ["id", "application_id", "status", "sent_at", "responded_at"])


@router.get("/leave/requests.csv")
def export_leave_requests(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    rows_db = db.execute(
        select(LeaveRequest).where(LeaveRequest.company_id == company_id).order_by(LeaveRequest.created_at.desc())
    ).scalars().all()
    rows = [
        [x.id, x.employee_id, x.type, x.start_date, x.end_date, x.status, str(x.created_at)] for x in rows_db
    ]
    return _csv_response(
        "leave_requests.csv",
        rows,
        ["id", "employee_id", "type", "start_date", "end_date", "status", "created_at"],
    )


@router.get("/learning/training-assignments.csv")
def export_training_assignments(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    tas = db.execute(
        select(TrainingAssignment)
        .where(TrainingAssignment.company_id == company_id)
        .order_by(TrainingAssignment.created_at.desc())
    ).scalars().all()
    rows = [[t.id, t.employee_id, t.course_id, t.status, str(t.created_at)] for t in tas]
    return _csv_response(
        "training_assignments.csv",
        rows,
        ["id", "employee_id", "course_id", "status", "created_at"],
    )


@router.get("/learning/training-completions.csv")
def export_training_completions(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    tc = db.execute(
        select(TrainingCompletion)
        .where(TrainingCompletion.company_id == company_id)
        .order_by(TrainingCompletion.completed_at.desc())
    ).scalars().all()
    rows = [[c.id, c.assignment_id, str(c.score or ""), str(c.completed_at)] for c in tc]
    return _csv_response(
        "training_completions.csv",
        rows,
        ["id", "assignment_id", "score", "completed_at"],
    )
