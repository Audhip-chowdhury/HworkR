from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditTrailEntry
from app.models.base import uuid_str


def write_audit(
    db: Session,
    *,
    company_id: str | None,
    user_id: str | None,
    entity_type: str,
    entity_id: str,
    action: str,
    changes_json: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    entry = AuditTrailEntry(
        id=uuid_str(),
        company_id=company_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changes_json=changes_json,
        ip_address=ip_address,
    )
    db.add(entry)
