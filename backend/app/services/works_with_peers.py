"""Shared logic: employees with the same manager and same position grade as a requester."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.position import Position


def works_with_peer_employee_ids(db: Session, company_id: str, requester: Employee) -> set[str]:
    """Employee ids (excluding requester) in the same works-with cohort, or empty if not applicable."""
    if not requester.position_id or not requester.manager_id:
        return set()
    my_pos = db.get(Position, requester.position_id)
    if my_pos is None or my_pos.company_id != company_id:
        return set()
    stmt = (
        select(Employee.id)
        .join(Position, Employee.position_id == Position.id)
        .where(
            Employee.company_id == company_id,
            Employee.id != requester.id,
            Employee.manager_id == requester.manager_id,
            Employee.manager_id.isnot(None),
            Employee.position_id.isnot(None),
            Position.grade == my_pos.grade,
            Employee.status == "active",
        )
    )
    return {row[0] for row in db.execute(stmt).all()}
