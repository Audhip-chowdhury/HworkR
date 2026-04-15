import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
from fastapi import APIRouter, FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api.v1 import (
    analytics,
    audits,
    auth,
    certification,
    company_registration,
    compensation_engagement,
    employees,
    exports,
    hr_ops,
    inbox,
    me,
    notifications,
    organization,
    performance_learning,
    platform,
    recruitment,
    scenarios,
    sso,
    tracking,
    webhooks,
    workflows,
)
from app.config import settings
from app.core.security import decode_token
from app.database import SessionLocal, init_db
from app.models.membership import CompanyMembership
from app.services.realtime import WebSocketHub, drain_sync_events_to_websockets, set_hub

hub = WebSocketHub()
set_hub(hub)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await anyio.to_thread.run_sync(init_db)
    drain_task = asyncio.create_task(drain_sync_events_to_websockets())
    try:
        yield
    finally:
        drain_task.cancel()
        try:
            await drain_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title=settings.app_name, lifespan=lifespan)

_upload_root = Path(settings.upload_dir).resolve()
_upload_root.mkdir(parents=True, exist_ok=True)
(_upload_root / "logos").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_upload_root)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

v1 = APIRouter(prefix="/api/v1")
v1.include_router(auth.router)
v1.include_router(me.router)
v1.include_router(company_registration.router)
v1.include_router(platform.router)
v1.include_router(organization.router)
v1.include_router(employees.router)
v1.include_router(audits.router)
v1.include_router(hr_ops.router)
v1.include_router(performance_learning.router)
v1.include_router(compensation_engagement.router)
v1.include_router(tracking.router)
v1.include_router(certification.router)
v1.include_router(analytics.router)
v1.include_router(recruitment.router)
v1.include_router(notifications.router)
v1.include_router(inbox.router)
v1.include_router(workflows.router)
v1.include_router(webhooks.router)
v1.include_router(exports.router)
v1.include_router(scenarios.router)
v1.include_router(sso.router)
app.include_router(v1)


@app.websocket("/ws/companies/{company_id}")
async def company_events_ws(
    websocket: WebSocket,
    company_id: str,
    token: str | None = Query(default=None),
) -> None:
    await websocket.accept()
    if not token:
        await websocket.close(code=4001, reason="missing token")
        return
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=4001, reason="invalid token")
        return
    uid = str(payload["sub"])
    with SessionLocal() as db:
        m = db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == uid,
                CompanyMembership.status == "active",
            )
        ).scalar_one_or_none()
    if m is None:
        await websocket.close(code=4003, reason="forbidden")
        return
    await hub.connect(company_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(company_id, websocket)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
