"""Create/close inbox tasks when employee document status changes."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.models.inbox import InboxTask

DOC_TYPES_DEFAULT = ("photo", "gov_id", "offer_letter")

# Only primary types get inbox tasks; optional second ID (gov_id_2) does not.
PRIMARY_DOCUMENT_TASK_TYPES = frozenset({"photo", "gov_id", "offer_letter"})

# Legacy per-document inbox rows (context_json.doc_type); closed on sync.
TASK_TYPE = "document_required"
ENTITY_TYPE = "employee"

# Single aggregate reminder when any primary document is missing.
AGGREGATE_DOC_TASK_TYPE = "profile_add_documents"


OPTIONAL_DOC_TYPES: frozenset[str] = frozenset({"gov_id_2"})


def ensure_optional_document_row(
    db: Session, company_id: str, employee_id: str, doc_type: str
) -> EmployeeDocument | None:
    """Create missing row for gov_id_2 on first upload."""
    if doc_type not in OPTIONAL_DOC_TYPES:
        return None
    exists = db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.employee_id == employee_id,
            EmployeeDocument.doc_type == doc_type,
        )
    ).scalar_one_or_none()
    if exists is not None:
        return exists
    row = EmployeeDocument(
        id=uuid_str(),
        company_id=company_id,
        employee_id=employee_id,
        doc_type=doc_type,
        status="missing",
    )
    db.add(row)
    db.flush()
    return row


def ensure_default_document_rows(db: Session, company_id: str, employee_id: str) -> None:
    """Insert photo, gov_id, offer_letter rows if absent."""
    for doc_type in DOC_TYPES_DEFAULT:
        exists = db.execute(
            select(EmployeeDocument).where(
                EmployeeDocument.employee_id == employee_id,
                EmployeeDocument.doc_type == doc_type,
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(
                EmployeeDocument(
                    id=uuid_str(),
                    company_id=company_id,
                    employee_id=employee_id,
                    doc_type=doc_type,
                    status="missing",
                )
            )


def _close_legacy_per_document_tasks(db: Session, employee: Employee) -> None:
    """Retire old document_required rows that used context_json.doc_type."""
    if not employee.user_id:
        return
    r = db.execute(
        select(InboxTask).where(
            InboxTask.company_id == employee.company_id,
            InboxTask.user_id == employee.user_id,
            InboxTask.type == TASK_TYPE,
            InboxTask.entity_id == employee.id,
            InboxTask.status == "open",
        )
    ).scalars().all()
    for t in r:
        ctx = t.context_json or {}
        if ctx.get("doc_type"):
            t.status = "done"


def _open_aggregate_document_task(
    db: Session, company_id: str, user_id: str, employee_id: str
) -> InboxTask | None:
    rows = list(
        db.execute(
            select(InboxTask).where(
                InboxTask.company_id == company_id,
                InboxTask.user_id == user_id,
                InboxTask.type == AGGREGATE_DOC_TASK_TYPE,
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


def sync_document_inbox_tasks(db: Session, employee: Employee) -> None:
    """One inbox task 'Add documents' if any primary doc is missing; close when all submitted."""
    if not employee.user_id:
        return

    _close_legacy_per_document_tasks(db, employee)

    docs = db.execute(
        select(EmployeeDocument).where(EmployeeDocument.employee_id == employee.id)
    ).scalars().all()

    primary = [d for d in docs if d.doc_type in PRIMARY_DOCUMENT_TASK_TYPES]
    any_missing = any(d.status == "missing" for d in primary)

    t = _open_aggregate_document_task(db, employee.company_id, employee.user_id, employee.id)
    if any_missing:
        if t is None:
            db.add(
                InboxTask(
                    id=uuid_str(),
                    company_id=employee.company_id,
                    user_id=employee.user_id,
                    type=AGGREGATE_DOC_TASK_TYPE,
                    title="Add documents",
                    entity_type=ENTITY_TYPE,
                    entity_id=employee.id,
                    priority="normal",
                    status="open",
                    context_json={"employee_id": employee.id, "focus": "documents"},
                )
            )
    elif t is not None:
        t.status = "done"

    db.flush()


def close_all_document_tasks_for_employee(db: Session, employee: Employee) -> None:
    """Mark open document reminder tasks done (e.g. when unlinking user)."""
    if not employee.user_id:
        return
    r = db.execute(
        select(InboxTask).where(
            InboxTask.company_id == employee.company_id,
            InboxTask.user_id == employee.user_id,
            InboxTask.type.in_((TASK_TYPE, AGGREGATE_DOC_TASK_TYPE)),
            InboxTask.entity_id == employee.id,
            InboxTask.status == "open",
        )
    ).scalars().all()
    for t in r:
        t.status = "done"


def mark_document_submitted(
    db: Session,
    doc: EmployeeDocument,
    *,
    file_url: str | None = None,
    notes: str | None = None,
    meta_json: dict[str, Any] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    doc.status = "submitted"
    doc.submitted_at = now
    if file_url is not None:
        doc.file_url = file_url
    if notes is not None:
        doc.notes = notes
    if meta_json is not None:
        doc.meta_json = meta_json


def mark_document_missing(db: Session, doc: EmployeeDocument) -> None:
    doc.status = "missing"
    doc.submitted_at = None
    doc.file_url = None
    doc.meta_json = None
