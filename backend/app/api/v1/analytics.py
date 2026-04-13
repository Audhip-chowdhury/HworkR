import csv
import io
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.employee import Employee
from app.models.hr_ops import LeaveRequest
from app.models.membership import CompanyMembership
from app.models.org import Department
from app.models.performance_learning import TrainingCompletion, TrainingAssignment
from app.models.recruitment import Application, JobPosting, Offer
from app.models.user import User

router = APIRouter(prefix="/companies/{company_id}/analytics", tags=["analytics"])

_ANALYTICS_ROLES = frozenset(
    {"company_admin", "talent_acquisition", "hr_ops", "ld_performance", "compensation_analytics"}
)


@router.get("/dashboard")
def analytics_dashboard(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_ANALYTICS_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    total_employees = db.execute(
        select(sa_func.count()).select_from(Employee).where(Employee.company_id == company_id)
    ).scalar_one()
    active_employees = db.execute(
        select(sa_func.count())
        .select_from(Employee)
        .where(Employee.company_id == company_id, Employee.status == "active")
    ).scalar_one()

    dept_names = {
        d.id: d.name
        for d in db.execute(select(Department).where(Department.company_id == company_id)).scalars().all()
    }
    dept_counts = db.execute(
        select(Employee.department_id, sa_func.count(Employee.id))
        .where(Employee.company_id == company_id)
        .group_by(Employee.department_id)
    ).all()
    headcount_by_department = [
        {
            "department_id": did or "",
            "department": dept_names.get(did, "Unassigned") if did else "Unassigned",
            "count": int(cnt or 0),
        }
        for did, cnt in dept_counts
    ]

    open_postings = db.execute(
        select(sa_func.count()).select_from(JobPosting).where(JobPosting.company_id == company_id, JobPosting.status == "open")
    ).scalar_one()
    applications = db.execute(
        select(sa_func.count()).select_from(Application).where(Application.company_id == company_id)
    ).scalar_one()
    offers = db.execute(select(sa_func.count()).select_from(Offer).where(Offer.company_id == company_id)).scalar_one()

    pending_leave = db.execute(
        select(sa_func.count())
        .select_from(LeaveRequest)
        .where(LeaveRequest.company_id == company_id, LeaveRequest.status == "pending")
    ).scalar_one()

    assignments = db.execute(
        select(sa_func.count()).select_from(TrainingAssignment).where(TrainingAssignment.company_id == company_id)
    ).scalar_one()
    completions = db.execute(
        select(sa_func.count()).select_from(TrainingCompletion).where(TrainingCompletion.company_id == company_id)
    ).scalar_one()
    training_rate = round((completions / assignments) * 100, 2) if assignments else None

    return {
        "headcount": {
            "total": total_employees,
            "active": active_employees,
            "by_department": headcount_by_department,
        },
        "recruitment": {
            "open_postings": open_postings,
            "applications": applications,
            "offers": offers,
        },
        "leave": {"pending_requests": pending_leave},
        "learning": {
            "training_assignments": assignments,
            "training_completions": completions,
            "completion_rate_percent": training_rate,
        },
    }


@router.get("/export/employees.csv")
def export_employees_csv(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_ANALYTICS_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    rows = db.execute(select(Employee).where(Employee.company_id == company_id).order_by(Employee.employee_code)).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "employee_code",
            "user_id",
            "department_id",
            "job_id",
            "status",
            "hire_date",
        ]
    )
    for e in rows:
        w.writerow([e.id, e.employee_code, e.user_id or "", e.department_id or "", e.job_id or "", e.status, e.hire_date or ""])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="employees.csv"'},
    )
