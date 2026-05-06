"""Best-effort POST of new offer letters to an external recruitment / HRIS URL."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.recruitment import Application, Offer
from app.services.recruitment_external_status import job_posting_req_code_for_posting

logger = logging.getLogger(__name__)


def post_offer_created_webhook(*, db: Session, offer: Offer, application: Application) -> None:
    """
    POST payload after commit. Empty RECRUITMENT_OFFER_WEBHOOK_URL disables.

    Body: ``job_id``, ``userid``, ``offer_id``, ``company_id``, and ``compensation_json``
    (structured offer letter from HR; may be null).

    External service should return HTTP 2xx to acknowledge receipt; response body is not parsed.
    """
    url = (settings.recruitment_offer_webhook_url or "").strip()
    if not url:
        return

    job_id = job_posting_req_code_for_posting(db, application.posting_id)

    payload: dict[str, Any] = {
        "job_id": job_id,
        "userid": application.candidate_user_id,
        "offer_id": offer.id,
        "company_id": offer.company_id,
        "compensation_json": offer.compensation_json,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(url, json=payload)
            if r.status_code >= 400:
                logger.warning(
                    "Offer letter webhook returned %s: %s",
                    r.status_code,
                    (r.text or "")[:500],
                )
    except Exception:
        logger.exception("Offer letter webhook failed for offer %s", offer.id)
