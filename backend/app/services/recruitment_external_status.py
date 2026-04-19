"""Notify external recruitment service when an applicant pipeline stage/status changes."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.recruitment import Application, JobPosting, Requisition

logger = logging.getLogger(__name__)


def job_posting_req_code_for_posting(db: Session, posting_id: str) -> str | None:
    """Six-character alphanumeric requisition code (`req_code`) for the job posting's hiring slot."""
    posting = db.get(JobPosting, posting_id)
    if posting is None:
        return None
    req = db.get(Requisition, posting.requisition_id)
    return req.req_code if req is not None else None


def external_status_notify_value(app: Application, *, prev_stage: str | None, prev_status: str | None) -> str:
    """Pick the best single string for external `status` after an application row update."""
    if prev_stage is not None and app.stage != prev_stage:
        return app.stage
    if prev_status is not None and app.status != prev_status:
        return app.status
    return app.stage


def post_application_pipeline_status(
    *, candidate_user_id: str, status: str, job_posting_code: str | None = None
) -> None:
    """
    Best-effort POST to configured URL with body:
    {
      "recruitment_external_applicant_id": "<uuid>",
      "status": "<pipeline stage / row status>",
      "job_posting_code": "<6-char req_code or null>"
    }

    Failures are logged; the API request that triggered this still succeeds.
    """
    url = (settings.recruitment_status_webhook_url or "").strip()
    if not url:
        return
    payload: dict[str, Any] = {
        "recruitment_external_applicant_id": candidate_user_id,
        "status": status,
        "job_posting_code": job_posting_code,
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.post(url, json=payload)
            if r.status_code >= 400:
                logger.warning(
                    "Recruitment status webhook returned %s: %s",
                    r.status_code,
                    (r.text or "")[:500],
                )
    except Exception:
        logger.exception("Recruitment status webhook failed for user %s", candidate_user_id)
