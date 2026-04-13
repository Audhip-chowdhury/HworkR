"""Thread-safe bridge from sync route handlers to async WebSocket broadcasts."""

from __future__ import annotations

import asyncio
import json
import queue
from typing import Any

_sync_event_queue: queue.SimpleQueue[tuple[str, dict[str, Any]]] = queue.SimpleQueue()
_hub: Any = None


def set_hub(hub: Any) -> None:
    global _hub
    _hub = hub


def enqueue_company_event(company_id: str, message: dict[str, Any]) -> None:
    """Called from sync FastAPI routes (threadpool)."""
    _sync_event_queue.put((company_id, message))


async def drain_sync_events_to_websockets() -> None:
    """Run as a background task from app lifespan."""
    while True:
        await asyncio.sleep(0.05)
        if _hub is None:
            continue
        while True:
            try:
                company_id, msg = _sync_event_queue.get_nowait()
            except queue.Empty:
                break
            await _hub.broadcast_json(company_id, msg)


class WebSocketHub:
    def __init__(self) -> None:
        self._connections: dict[str, list[Any]] = {}

    async def connect(self, company_id: str, websocket: Any) -> None:
        self._connections.setdefault(company_id, []).append(websocket)

    def disconnect(self, company_id: str, websocket: Any) -> None:
        conns = self._connections.get(company_id)
        if not conns:
            return
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            del self._connections[company_id]

    async def broadcast_json(self, company_id: str, payload: dict[str, Any]) -> None:
        conns = list(self._connections.get(company_id, []))
        dead: list[Any] = []
        text = json.dumps(payload, default=str)
        for ws in conns:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(company_id, ws)
