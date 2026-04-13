from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee


def get_employee_for_user(db: Session, company_id: str, user_id: str) -> Employee | None:
    r = db.execute(
        select(Employee).where(Employee.company_id == company_id, Employee.user_id == user_id)
    )
    return r.scalar_one_or_none()


def get_employee_by_id(db: Session, company_id: str, employee_id: str) -> Employee | None:
    r = db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.company_id == company_id)
    )
    return r.scalar_one_or_none()
