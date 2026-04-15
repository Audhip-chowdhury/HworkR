"""Resolved labels for employee summary/detail APIs."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.models.org import Department, JobCatalogEntry, Location
from app.models.user import User


def display_name_and_email(employee: Employee, user: User | None) -> tuple[str, str]:
    pi: dict[str, Any] = employee.personal_info_json or {}
    name = (user.name if user else None) or str(pi.get("fullName") or "").strip() or employee.employee_code
    email = (user.email if user else None) or str(pi.get("personalEmail") or "").strip() or "—"
    return name, email


_DOC_ORDER = ("photo", "gov_id", "gov_id_2", "offer_letter")


def load_employee_documents(db: Session, employee_id: str) -> list[EmployeeDocument]:
    r = db.execute(
        select(EmployeeDocument)
        .where(EmployeeDocument.employee_id == employee_id)
        .order_by(EmployeeDocument.doc_type)
    )
    rows = list(r.scalars().all())
    order = {t: i for i, t in enumerate(_DOC_ORDER)}
    return sorted(rows, key=lambda d: (order.get(d.doc_type, 99), d.doc_type))


def resolve_org_labels(
    db: Session,
    company_id: str,
    employee: Employee,
) -> tuple[str | None, str | None, str | None, str | None, str | None]:
    dept_name = None
    if employee.department_id:
        d = db.execute(
            select(Department).where(
                Department.id == employee.department_id, Department.company_id == company_id
            )
        ).scalar_one_or_none()
        dept_name = d.name if d else None

    job_title = None
    job_grade = None
    if employee.job_id:
        j = db.execute(
            select(JobCatalogEntry).where(
                JobCatalogEntry.id == employee.job_id, JobCatalogEntry.company_id == company_id
            )
        ).scalar_one_or_none()
        if j:
            job_title = j.title
            job_grade = j.grade

    loc_name = None
    if employee.location_id:
        loc = db.execute(
            select(Location).where(
                Location.id == employee.location_id, Location.company_id == company_id
            )
        ).scalar_one_or_none()
        loc_name = loc.name if loc else None

    mgr_name = None
    if employee.manager_id:
        mgr = db.execute(
            select(Employee).where(
                Employee.id == employee.manager_id, Employee.company_id == company_id
            )
        ).scalar_one_or_none()
        if mgr:
            u = db.execute(select(User).where(User.id == mgr.user_id)).scalar_one_or_none() if mgr.user_id else None
            mgr_name, _ = display_name_and_email(mgr, u)

    return dept_name, job_title, job_grade, mgr_name, loc_name
