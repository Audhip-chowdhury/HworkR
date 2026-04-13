"""Post-commit integrations: webhooks + realtime fan-out."""

from __future__ import annotations

from typing import Any

from app.services.realtime import enqueue_company_event
from app.services.webhooks import build_envelope, deliver_webhooks_for_event


def publish_domain_event_post_commit(
    *,
    company_id: str,
    event_type: str,
    entity_type: str | None,
    entity_id: str | None,
    actor_user_id: str | None,
    data: dict[str, Any] | None = None,
) -> None:
    envelope = build_envelope(
        event_type=event_type,
        company_id=company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        data=data,
    )
    deliver_webhooks_for_event(company_id, event_type, envelope)
    enqueue_company_event(company_id, {"channel": "domain", "payload": envelope})
