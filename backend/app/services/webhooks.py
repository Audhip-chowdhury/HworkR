from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.base import uuid_str
from app.models.webhook import WebhookDelivery, WebhookSubscription


def build_envelope(
    *,
    event_type: str,
    company_id: str,
    entity_type: str | None,
    entity_id: str | None,
    actor_user_id: str | None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "company_id": company_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_user_id": actor_user_id,
        "data": data or {},
    }


def _sign_body(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _subscription_wants_event(events_filter: list[str] | None, event_type: str) -> bool:
    if not events_filter:
        return True
    return event_type in events_filter


def _post_subscription(sub: WebhookSubscription, event_type: str, body_obj: bytes, envelope: dict[str, Any]) -> None:
    with SessionLocal() as db:
        sig = _sign_body(sub.secret, body_obj)
        headers = {
            "Content-Type": "application/json",
            "X-HworkR-Signature": f"sha256={sig}",
            "X-HworkR-Event": event_type,
        }
        last_err: str | None = None
        status_code: int | None = None
        attempts = 0
        for attempt in range(3):
            attempts = attempt + 1
            try:
                with httpx.Client(timeout=5.0) as client:
                    resp = client.post(sub.url, content=body_obj, headers=headers)
                    status_code = resp.status_code
                    if 200 <= resp.status_code < 300:
                        last_err = None
                        break
                    last_err = f"HTTP {resp.status_code}: {resp.text[:500]}"
            except Exception as e:
                last_err = str(e)
                status_code = None
            time.sleep(0.3 * attempts)
        delivery = WebhookDelivery(
            id=uuid_str(),
            subscription_id=sub.id,
            event_type=event_type,
            payload_json=envelope,
            http_status=status_code,
            error_text=last_err,
            attempts=attempts,
        )
        db.add(delivery)
        db.commit()


def deliver_to_subscription(subscription_id: str, event_type: str, envelope: dict[str, Any]) -> None:
    """Deliver a single event to one subscription (used for admin test pings)."""
    body_obj = json.dumps(envelope, separators=(",", ":"), default=str).encode("utf-8")
    with SessionLocal() as db:
        sub = db.execute(select(WebhookSubscription).where(WebhookSubscription.id == subscription_id)).scalar_one_or_none()
        if sub is None:
            return
        _post_subscription(sub, event_type, body_obj, envelope)


def deliver_webhooks_for_event(company_id: str, event_type: str, envelope: dict[str, Any]) -> None:
    """Open a short-lived DB session; run HTTP delivery (sync). Call after main transaction commit."""
    body_obj = json.dumps(envelope, separators=(",", ":"), default=str).encode("utf-8")
    with SessionLocal() as db:
        r = db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.company_id == company_id,
                WebhookSubscription.is_active.is_(True),
            )
        )
        subs = list(r.scalars().all())
    for sub in subs:
        if not _subscription_wants_event(sub.events_json, event_type):
            continue
        _post_subscription(sub, event_type, body_obj, envelope)
