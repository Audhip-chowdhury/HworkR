"""Write tiny sample image/PDF files and mark employee_documents as submitted (dev/demo)."""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.base import uuid_str
from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.services.employee_document_sync import (
    ensure_default_document_rows,
    mark_document_submitted,
    sync_document_inbox_tasks,
)

# 1×1 PNG (transparent)
_PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

# Minimal valid single-page PDF (empty page)
_MINI_PDF = base64.b64decode(
    "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iagoyIDAgb2JqCjw8L1R5cGUvUGFnZXMvS2lkc1szIDAgUl0vQ291bnQgMT4+ZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAzIDNdL1BhcmVudCAyIDAgUj4+ZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAxMTAgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjE5MAolJUVPRgo="
)

# Do not auto-fill sample files for demo employees used for inbox testing (missing docs).
SKIP_SAMPLE_DOC_EMPLOYEE_CODES: frozenset[str] = frozenset({"KO-FASH-DEMO-001"})

_DOC_SPECS: tuple[tuple[str, str, bytes, str, str, str], ...] = (
    ("photo", ".png", _PNG_1X1, "image", "image/png", "seed-photo.png"),
    ("gov_id", ".png", _PNG_1X1, "image", "image/png", "seed-government-id.png"),
    ("offer_letter", ".pdf", _MINI_PDF, "pdf", "application/pdf", "seed-offer-letter.pdf"),
)


def seed_sample_employee_documents(
    session: Session,
    *,
    company_id: str | None = None,
    force: bool = False,
) -> tuple[int, int]:
    """
    For each employee (optionally limited to ``company_id``), ensure document rows exist,
    write sample files under ``settings.upload_dir``, and mark photo / gov_id / offer_letter submitted.

    Skips documents that are already ``submitted`` with a ``file_url`` unless ``force`` is True.

    Returns (employees_touched, files_written).
    """
    q = select(Employee)
    if company_id is not None:
        q = q.where(Employee.company_id == company_id)
    employees = list(session.execute(q).scalars().all())

    upload_root = Path(settings.upload_dir).resolve()
    employees_touched = 0
    files_written = 0

    for emp in employees:
        ensure_default_document_rows(session, emp.company_id, emp.id)
        if emp.employee_code in SKIP_SAMPLE_DOC_EMPLOYEE_CODES:
            continue
        touched = False

        for doc_type, ext, raw, kind, mime, orig in _DOC_SPECS:
            doc = session.execute(
                select(EmployeeDocument).where(
                    EmployeeDocument.employee_id == emp.id,
                    EmployeeDocument.doc_type == doc_type,
                )
            ).scalar_one_or_none()
            if doc is None:
                continue
            if doc.status == "submitted" and doc.file_url and not force:
                continue

            dest_dir = upload_root / "employee_documents" / emp.company_id / emp.id
            dest_dir.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid_str()}{ext}"
            path = dest_dir / filename
            path.write_bytes(raw)
            files_written += 1

            public_url = f"/uploads/employee_documents/{emp.company_id}/{emp.id}/{filename}"
            meta = {
                "kind": kind,
                "mime_type": mime,
                "original_filename": orig,
                "seed_sample": True,
            }
            mark_document_submitted(
                session,
                doc,
                file_url=public_url,
                meta_json=meta,
                notes="Seeded sample document (dev/demo).",
            )
            touched = True

        if touched:
            sync_document_inbox_tasks(session, emp)
            employees_touched += 1

    return employees_touched, files_written
