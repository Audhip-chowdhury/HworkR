from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.membership import CompanyMembership
from app.models.user import User
from app.models.webhook import WebhookSubscription
from app.schemas.webhook import (
    WebhookSubscriptionCreate,
    WebhookSubscriptionOut,
    WebhookSubscriptionUpdate,
    WebhookTestRequest,
)
from app.services.webhooks import build_envelope, deliver_to_subscription

router = APIRouter(prefix="/companies/{company_id}/webhooks", tags=["webhooks"])


@router.get("/subscriptions", response_model=list[WebhookSubscriptionOut])
def list_subscriptions(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> list[WebhookSubscription]:
    r = db.execute(
        select(WebhookSubscription)
        .where(WebhookSubscription.company_id == company_id)
        .order_by(WebhookSubscription.created_at.desc())
    )
    return list(r.scalars().all())


@router.post("/subscriptions", response_model=WebhookSubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    company_id: str,
    body: WebhookSubscriptionCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> WebhookSubscription:
    _, _m = ctx
    events = body.events if body.events else None
    row = WebhookSubscription(
        id=uuid_str(),
        company_id=company_id,
        url=body.url.strip(),
        secret=body.secret,
        events_json=events,
        is_active=body.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/subscriptions/{subscription_id}", response_model=WebhookSubscriptionOut)
def update_subscription(
    company_id: str,
    subscription_id: str,
    body: WebhookSubscriptionUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> WebhookSubscription:
    _, _m = ctx
    r = db.execute(
        select(WebhookSubscription).where(
            WebhookSubscription.id == subscription_id,
            WebhookSubscription.company_id == company_id,
        )
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    data = body.model_dump(exclude_unset=True, by_alias=True)
    if "events" in data:
        row.events_json = data.pop("events")
    elif "events_json" in data:
        row.events_json = data.pop("events_json")
    if "url" in data and data["url"]:
        row.url = str(data["url"]).strip()
        del data["url"]
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.post("/subscriptions/{subscription_id}/test", status_code=status.HTTP_204_NO_CONTENT)
def test_subscription(
    company_id: str,
    subscription_id: str,
    body: WebhookTestRequest,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user, _m = ctx
    r = db.execute(
        select(WebhookSubscription).where(
            WebhookSubscription.id == subscription_id,
            WebhookSubscription.company_id == company_id,
            WebhookSubscription.is_active.is_(True),
        )
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    env = build_envelope(
        event_type=body.event_type,
        company_id=company_id,
        entity_type="webhook_test",
        entity_id=subscription_id,
        actor_user_id=user.id,
        data=body.data,
    )
    db.commit()
    deliver_to_subscription(subscription_id, body.event_type, env)
    return None
