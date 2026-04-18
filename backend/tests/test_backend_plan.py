"""Smoke tests for remaining backend plan features."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _hdr(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_company(client: TestClient) -> tuple[str, str]:
    """Return (user_token, company_id) for a fresh company admin."""
    suffix = uuid.uuid4().hex[:8]
    email = f"u{suffix}@example.com"
    password = "secret12"
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password, "name": "Tester"})
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]

    r = client.post(
        "/api/v1/company-registration-requests",
        data={"company_name": f"Co {suffix}", "industry": "it", "location": "remote"},
        headers=_hdr(tok),
    )
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]

    r = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    admin_tok = r.json()["access_token"]

    r = client.post(
        f"/api/v1/platform/company-registration-requests/{req_id}/approve",
        headers=_hdr(admin_tok),
    )
    assert r.status_code == 201, r.text
    company_id = r.json()["id"]

    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return tok, company_id


def test_health_and_sso_providers():
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/health").json().get("status") == "ok"
        r = client.get("/api/v1/auth/sso/providers")
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        assert "google_oidc" in ids and "saml2" in ids


def test_saml_acs_stub_501():
    from app.main import app

    with TestClient(app) as client:
        r = client.post("/api/v1/auth/sso/saml/acs", json={"SAMLResponse": "stub"})
        assert r.status_code == 501
        body = r.json()
        assert body.get("status") == "not_implemented"


def test_requisition_workflow_approve():
    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        r = client.post(
            f"/api/v1/companies/{cid}/recruitment/requisitions",
            json={"headcount": 1},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        rid = body["id"]
        assert body.get("req_code") and len(body["req_code"]) == 6

        r = client.patch(
            f"/api/v1/companies/{cid}/recruitment/requisitions/{rid}",
            json={"status": "submitted"},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text

        r = client.get(
            f"/api/v1/companies/{cid}/workflow-instances",
            params={"entity_type": "requisition", "entity_id": rid},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        insts = r.json()
        assert len(insts) == 1
        iid = insts[0]["id"]
        assert insts[0]["status"] == "active"

        r = client.post(
            f"/api/v1/companies/{cid}/workflow-instances/{iid}/actions",
            json={"action": "approve"},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        r = client.get(f"/api/v1/companies/{cid}/recruitment/requisitions", headers=_hdr(tok))
        assert r.status_code == 200
        row = next(x for x in r.json() if x["id"] == rid)
        assert row["status"] == "approved"


def test_public_apply_by_req_code_creates_user_and_application():
    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        r = client.post(
            f"/api/v1/companies/{cid}/recruitment/requisitions",
            json={"headcount": 1},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        req_code = r.json()["req_code"]
        rid = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/recruitment/postings",
            json={"requisition_id": rid, "title": "Public apply test role"},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text

        suf = __import__("uuid").uuid4().hex[:8]
        email = f"publicapply{suf}@example.com"
        r = client.post(
            f"/api/v1/recruitment/public-apply/{req_code}",
            json={
                "email": email,
                "password": "publicapply1",
                "name": "Public Apply Tester",
                "resume_url": None,
            },
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data.get("access_token")
        assert data["application"]["stage"] == "applied"
        assert data["application"]["candidate_user_id"]

        r = client.post(
            f"/api/v1/recruitment/public-apply/{req_code}",
            json={
                "email": email,
                "password": "publicapply1",
                "name": "Public Apply Tester",
            },
        )
        assert r.status_code == 409, r.text


def test_cert_issue_blocked_for_employee_when_min_actions():
    from app.main import app

    with TestClient(app) as client:
        admin_tok, cid = _register_and_company(client)

        r = client.post(
            f"/api/v1/companies/{cid}/certification/tracks",
            json={
                "role_type": "hr",
                "level": "L1",
                "name": "Strict track",
                "min_score": 0,
                "requirements_json": {"min_actions_count": 5},
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        track_id = r.json()["id"]

        esuf = uuid.uuid4().hex[:8]
        r = client.post(
            f"/api/v1/companies/{cid}/members/invite",
            json={
                "email": f"emp{esuf}@example.com",
                "role": "employee",
                "password": "secret12",
                "name": "Emp",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text

        r = client.post(
            "/api/v1/auth/login",
            json={"email": f"emp{esuf}@example.com", "password": "secret12"},
        )
        assert r.status_code == 200, r.text
        emp_tok = r.json()["access_token"]

        r = client.post(
            f"/api/v1/companies/{cid}/certification/certificates/issue",
            json={"track_id": track_id, "level": "L1", "score": 80.0},
            headers=_hdr(emp_tok),
        )
        assert r.status_code == 400
        assert "actions" in r.json().get("detail", "").lower()


def test_scenario_generate_inbox_task():
    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        r = client.post(
            f"/api/v1/companies/{cid}/scenarios/generate",
            json={
                "create_leave_request": False,
                "create_job_application": False,
                "create_inbox_task_for_hr": True,
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        res = r.json()
        assert res["status"] == "completed"
        assert res.get("result_json", {}).get("created", {}).get("inbox_task_id")


def test_webhook_subscription_crud():
    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        r = client.post(
            f"/api/v1/companies/{cid}/webhooks/subscriptions",
            json={
                "url": "https://example.com/hooks",
                "secret": "supersecret123",
                "events": ["ping"],
                "is_active": True,
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        sid = r.json()["id"]

        r = client.patch(
            f"/api/v1/companies/{cid}/webhooks/subscriptions/{sid}",
            json={"events": ["ping", "certificate.issued"]},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        assert set(r.json().get("events_json") or []) >= {"ping", "certificate.issued"}

        r = client.get(f"/api/v1/companies/{cid}/webhooks/subscriptions", headers=_hdr(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1


def test_tracking_recent_activity_and_sla_log():
    from datetime import datetime, timedelta, timezone

    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        client.post(
            f"/api/v1/companies/{cid}/tracking/scoring-rules",
            json={
                "module": "manual",
                "action_type": "demo",
                "sla_seconds": 60,
            },
            headers=_hdr(tok),
        )
        started = datetime.now(timezone.utc) - timedelta(seconds=120)
        r = client.post(
            f"/api/v1/companies/{cid}/tracking/activity-logs",
            json={
                "module": "manual",
                "action_type": "demo",
                "reference_started_at": started.isoformat(),
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        factors = r.json().get("quality_factors_json") or {}
        assert factors.get("timeliness", 100) < 100

        r = client.get(
            f"/api/v1/companies/{cid}/tracking/dashboard/recent-activity",
            headers=_hdr(tok),
        )
        assert r.status_code == 200
        assert len(r.json()) >= 1


def test_works_with_peers_same_manager_same_grade():
    """Peers = same manager_id + same position grade (via employees.position_id)."""
    from app.main import app

    with TestClient(app) as client:
        admin_tok, cid = _register_and_company(client)
        r = client.get("/api/v1/me/companies", headers=_hdr(admin_tok))
        assert r.status_code == 200, r.text
        admin_uid = r.json()[0]["membership"]["user_id"]

        r = client.post(
            f"/api/v1/companies/{cid}/positions",
            json={"name": "Peer test A", "department_id": None, "bucket": "temporary", "grade": 77},
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        pos_a = r.json()["id"]
        r = client.post(
            f"/api/v1/companies/{cid}/positions",
            json={"name": "Peer test B", "department_id": None, "bucket": "temporary", "grade": 77},
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        pos_b = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={
                "user_id": admin_uid,
                "employee_code": "MGR-ROOT",
                "status": "active",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        mgr_emp_id = r.json()["id"]

        esuf = uuid.uuid4().hex[:8]
        r = client.post(
            f"/api/v1/companies/{cid}/members/invite",
            json={
                "email": f"peer1{esuf}@example.com",
                "role": "employee",
                "password": "secret12",
                "name": "Peer One",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        uid1 = r.json()["user_id"]
        r = client.post(
            f"/api/v1/companies/{cid}/members/invite",
            json={
                "email": f"peer2{esuf}@example.com",
                "role": "employee",
                "password": "secret12",
                "name": "Peer Two",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        uid2 = r.json()["user_id"]

        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={
                "user_id": uid1,
                "employee_code": "P1",
                "manager_id": mgr_emp_id,
                "position_id": pos_a,
                "status": "active",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text
        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={
                "user_id": uid2,
                "employee_code": "P2",
                "manager_id": mgr_emp_id,
                "position_id": pos_b,
                "status": "active",
            },
            headers=_hdr(admin_tok),
        )
        assert r.status_code == 201, r.text

        r = client.post("/api/v1/auth/login", json={"email": f"peer1{esuf}@example.com", "password": "secret12"})
        assert r.status_code == 200, r.text
        t1 = r.json()["access_token"]

        r = client.get(f"/api/v1/companies/{cid}/employees/me/works-with-peers", headers=_hdr(t1))
        assert r.status_code == 200, r.text
        peers = r.json()
        assert len(peers) == 1
        assert peers[0]["employee_code"] == "P2"
        assert peers[0]["grade"] == 77
