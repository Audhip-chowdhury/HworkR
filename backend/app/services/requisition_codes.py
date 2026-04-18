"""Allocate short alphanumeric codes for requisitions (display in UI)."""

from __future__ import annotations

import re
import secrets
import string
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recruitment import Requisition

_ALPHANUM = string.ascii_uppercase + string.digits

_REQ_CODE_PATH_RE = re.compile(r"^[A-Za-z0-9]{6}$")


def normalize_req_code_path(raw: str) -> str:
    """Validate and normalize a req_code from a URL segment (6 alphanumeric chars)."""
    if not _REQ_CODE_PATH_RE.match(raw.strip()):
        raise ValueError("req_code must be exactly 6 alphanumeric characters")
    return raw.strip().upper()


def new_req_code() -> str:
    return "".join(secrets.choice(_ALPHANUM) for _ in range(6))


def allocate_req_code(db: Session) -> str:
    """Return a req_code unique across all companies."""
    for _ in range(96):
        code = new_req_code()
        clash = db.execute(select(Requisition.id).where(Requisition.req_code == code)).scalar_one_or_none()
        if clash is None:
            return code
    raise RuntimeError("Could not allocate a unique requisition code")


def backfill_req_codes_for_company(db: Session, company_id: str, rows: Iterable[Requisition]) -> None:
    """Assign codes to rows missing req_code without colliding globally."""
    used: set[str] = {
        c
        for c in db.execute(select(Requisition.req_code).where(Requisition.req_code.isnot(None))).scalars().all()
        if c
    }
    for req in rows:
        if req.req_code:
            continue
        while True:
            code = new_req_code()
            if code not in used:
                used.add(code)
                req.req_code = code
                break
