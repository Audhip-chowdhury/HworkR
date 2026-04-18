"""Granular inbox tasks for profile fields (phone, address, emergency) — one task each."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.inbox import InboxTask

ENTITY_TYPE = "employee"

# Legacy single task — closed on sync so new granular tasks take over.
LEGACY_PROFILE_TASK_TYPE = "profile_incomplete"

# One open task per reminder (titles match product copy).
PROFILE_REMINDERS: tuple[tuple[str, str, str], ...] = (
    ("profile_add_phone", "Add primary contact", "phone"),
    ("profile_add_address", "Add address", "address"),
    ("profile_add_emergency", "Add emergency contact", "emergency"),
)


def _needs_phone(pi: dict[str, Any] | None) -> bool:
    if not pi:
        return True
    return not str(pi.get("phone") or "").strip()


def _needs_address(pi: dict[str, Any] | None) -> bool:
    if not pi:
        return True
    return not str(pi.get("address") or "").strip()


def _needs_emergency(pi: dict[str, Any] | None) -> bool:
    if not pi:
        return True
    ec = pi.get("emergencyContacts")
    if isinstance(ec, list):
        for e in ec:
            if isinstance(e, dict) and str(e.get("name") or "").strip():
                return False
    if str(pi.get("emergencyContact") or "").strip():
        return False
    return True


def _close_legacy_profile_task(db: Session, employee: Employee) -> None:
    if not employee.user_id:
        return
    r = db.execute(
        select(InboxTask).where(
            InboxTask.company_id == employee.company_id,
            InboxTask.user_id == employee.user_id,
            InboxTask.type == LEGACY_PROFILE_TASK_TYPE,
            InboxTask.entity_id == employee.id,
            InboxTask.status == "open",
        )
    ).scalars().all()
    for t in r:
        t.status = "done"


def _open_reminder_task(
    db: Session, company_id: str, user_id: str, employee_id: str, task_type: str
) -> InboxTask | None:
    """Return one open reminder; if duplicates exist (legacy double-inserts), keep one and close the rest."""
    rows = list(
        db.execute(
            select(InboxTask).where(
                InboxTask.company_id == company_id,
                InboxTask.user_id == user_id,
                InboxTask.type == task_type,
                InboxTask.entity_type == ENTITY_TYPE,
                InboxTask.entity_id == employee_id,
                InboxTask.status == "open",
            )
        ).scalars().all()
    )
    if not rows:
        return None
    if len(rows) > 1:
        for extra in rows[1:]:
            extra.status = "done"
    return rows[0]


def sync_profile_inbox_tasks(db: Session, employee: Employee) -> None:
    """Open/close one inbox task per missing field; retire legacy profile_incomplete."""
    if not employee.user_id:
        return

    _close_legacy_profile_task(db, employee)

    pi = employee.personal_info_json or {}
    checks: list[tuple[str, str, str, bool]] = [
        (PROFILE_REMINDERS[0][0], PROFILE_REMINDERS[0][1], PROFILE_REMINDERS[0][2], _needs_phone(pi)),
        (PROFILE_REMINDERS[1][0], PROFILE_REMINDERS[1][1], PROFILE_REMINDERS[1][2], _needs_address(pi)),
        (PROFILE_REMINDERS[2][0], PROFILE_REMINDERS[2][1], PROFILE_REMINDERS[2][2], _needs_emergency(pi)),
    ]

    for task_type, title, focus, needs in checks:
        t = _open_reminder_task(db, employee.company_id, employee.user_id, employee.id, task_type)
        if needs:
            if t is None:
                db.add(
                    InboxTask(
                        id=uuid_str(),
                        company_id=employee.company_id,
                        user_id=employee.user_id,
                        type=task_type,
                        title=title,
                        entity_type=ENTITY_TYPE,
                        entity_id=employee.id,
                        priority="normal",
                        status="open",
                        context_json={
                            "employee_id": employee.id,
                            "focus": focus,
                        },
                    )
                )
        elif t is not None:
            t.status = "done"

    db.flush()
