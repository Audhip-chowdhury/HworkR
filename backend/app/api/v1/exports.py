import csv
import io
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.hr_ops import LeaveRequest
from app.models.membership import CompanyMembership
from app.models.performance_learning import TrainingAssignment, TrainingCompletion
from app.models.recruitment import Application, Offer, Requisition
from app.models.user import User
from app.services.audit import write_audit

router = APIRouter(prefix="/companies/{company_id}/exports", tags=["exports"])

_EXPORT_ROLES = frozenset(
    {"company_admin", "talent_acquisition", "hr_ops", "ld_performance", "compensation_analytics"}
)


def _audit_data_export(db: Session, company_id: str, user_id: str, export_key: str) -> None:
    write_audit(
        db,
        company_id=company_id,
        user_id=user_id,
        entity_type="data_export",
        entity_id=uuid_str(),
        action="download",
        changes_json={"export": export_key},
    )
    db.commit()


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
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    apps = db.execute(
        select(Application).where(Application.company_id == company_id).order_by(Application.applied_at.desc())
    ).scalars().all()
    rows = [
        [a.id, a.posting_id, a.candidate_user_id, a.stage, a.status, str(a.applied_at)] for a in apps
    ]
    resp = _csv_response(
        "applications.csv",
        rows,
        ["id", "posting_id", "candidate_user_id", "stage", "status", "applied_at"],
    )
    _audit_data_export(db, company_id, user.id, "recruitment/applications.csv")
    return resp


@router.get("/recruitment/requisitions.csv")
def export_requisitions(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    reqs = db.execute(
        select(Requisition).where(Requisition.company_id == company_id).order_by(Requisition.created_at.desc())
    ).scalars().all()
    rows = [
        [r.id, r.req_code or "", r.status, str(r.headcount), r.created_by, str(r.created_at)] for r in reqs
    ]
    resp = _csv_response(
        "requisitions.csv", rows, ["id", "req_code", "status", "headcount", "created_by", "created_at"]
    )
    _audit_data_export(db, company_id, user.id, "recruitment/requisitions.csv")
    return resp


@router.get("/recruitment/offers.csv")
def export_offers(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    offers = db.execute(select(Offer).where(Offer.company_id == company_id).order_by(Offer.sent_at.desc())).scalars().all()
    rows = [
        [o.id, o.application_id, o.status, str(o.sent_at), str(o.responded_at or "")] for o in offers
    ]
    resp = _csv_response("offers.csv", rows, ["id", "application_id", "status", "sent_at", "responded_at"])
    _audit_data_export(db, company_id, user.id, "recruitment/offers.csv")
    return resp


@router.get("/leave/requests.csv")
def export_leave_requests(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    rows_db = db.execute(
        select(LeaveRequest).where(LeaveRequest.company_id == company_id).order_by(LeaveRequest.created_at.desc())
    ).scalars().all()
    rows = [
        [x.id, x.employee_id, x.type, x.start_date, x.end_date, x.status, str(x.created_at)] for x in rows_db
    ]
    resp = _csv_response(
        "leave_requests.csv",
        rows,
        ["id", "employee_id", "type", "start_date", "end_date", "status", "created_at"],
    )
    _audit_data_export(db, company_id, user.id, "leave/requests.csv")
    return resp


@router.get("/learning/training-assignments.csv")
def export_training_assignments(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    tas = db.execute(
        select(TrainingAssignment)
        .where(TrainingAssignment.company_id == company_id)
        .order_by(TrainingAssignment.created_at.desc())
    ).scalars().all()
    rows = [[t.id, t.employee_id, t.course_id, t.status, str(t.created_at)] for t in tas]
    resp = _csv_response(
        "training_assignments.csv",
        rows,
        ["id", "employee_id", "course_id", "status", "created_at"],
    )
    _audit_data_export(db, company_id, user.id, "learning/training-assignments.csv")
    return resp


@router.get("/learning/training-completions.csv")
def export_training_completions(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_EXPORT_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    tc = db.execute(
        select(TrainingCompletion)
        .where(TrainingCompletion.company_id == company_id)
        .order_by(TrainingCompletion.completed_at.desc())
    ).scalars().all()
    rows = [[c.id, c.assignment_id, str(c.score or ""), str(c.completed_at)] for c in tc]
    resp = _csv_response(
        "training_completions.csv",
        rows,
        ["id", "assignment_id", "score", "completed_at"],
    )
    _audit_data_export(db, company_id, user.id, "learning/training-completions.csv")
    return resp
