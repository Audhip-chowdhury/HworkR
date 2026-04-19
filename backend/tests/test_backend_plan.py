"""Smoke tests for remaining backend plan features."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _hdr(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _set_membership_role(company_id: str, user_id: str, role: str) -> None:
    """For tests: change role (e.g. company admin → hr_ops) so payroll payslip APIs allow the token."""
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models.membership import CompanyMembership

    with SessionLocal() as db:
        m = db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user_id,
            )
        ).scalar_one_or_none()
        assert m is not None
        m.role = role
        db.commit()


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


def test_pay_run_department_scopes_payslip_employees():
    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)

        r = client.post(
            f"/api/v1/companies/{cid}/departments",
            json={"name": "Engineering"},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        dept_a = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/departments",
            json={"name": "Sales"},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        dept_b = r.json()["id"]

        suf = uuid.uuid4().hex[:8]
        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={
                "employee_code": f"E-{suf}-a",
                "department_id": dept_a,
                "status": "active",
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        emp_a = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={
                "employee_code": f"E-{suf}-b",
                "department_id": dept_b,
                "status": "active",
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        emp_b = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/payroll/pay-runs",
            json={"month": 6, "year": 2026, "status": "draft", "department_id": dept_a},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        pr_id = r.json()["id"]
        assert r.json().get("department_id") == dept_a

        r = client.get(
            f"/api/v1/companies/{cid}/payroll/pay-runs/period-overview?month=6&year=2026",
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        overview0 = r.json()
        row0 = next(x for x in overview0 if x["department_id"] == dept_a)
        assert row0["pay_run_id"] == pr_id
        assert len(row0["employees"]) == 1
        assert row0["employees"][0]["payroll_status"] == "to_be_processed"

        r = client.get("/api/v1/auth/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        _set_membership_role(cid, r.json()["id"], "hr_ops")

        r = client.post(
            f"/api/v1/companies/{cid}/payroll/payslips",
            json={
                "pay_run_id": pr_id,
                "employee_id": emp_a,
                "gross": 50000.0,
                "net": 40000.0,
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text

        r = client.get(
            f"/api/v1/companies/{cid}/payroll/pay-runs/period-overview?month=6&year=2026",
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        overview = r.json()
        eng_row = next(x for x in overview if x["department_id"] == dept_a)
        assert eng_row["pay_run_id"] == pr_id
        assert len(eng_row["employees"]) == 1
        assert eng_row["employees"][0]["employee_id"] == emp_a
        assert eng_row["employees"][0]["payroll_status"] == "payslip_generated"

        r = client.post(
            f"/api/v1/companies/{cid}/payroll/payslips",
            json={
                "pay_run_id": pr_id,
                "employee_id": emp_b,
                "gross": 50000.0,
                "net": 40000.0,
            },
            headers=_hdr(tok),
        )
        assert r.status_code == 400
        assert "department" in str(r.json().get("detail", "")).lower()


def test_compensation_grade_bands_crud_audit_and_validation():
    from app.main import app

    with TestClient(app) as client:
        tok, company_id = _register_and_company(client)
        base = f"/api/v1/companies/{company_id}/payroll/grade-bands"

        r = client.post(
            base,
            headers=_hdr(tok),
            json={
                "band_code": "L6",
                "display_name": "Level 6",
                "min_annual": 1_000_000,
                "mid_annual": 1_200_000,
                "max_annual": 1_500_000,
                "effective_from": "2025-01-01",
                "org_position_grade_min": 10,
                "org_position_grade_max": 30,
            },
        )
        assert r.status_code == 201, r.text
        bid = r.json()["id"]

        r = client.get(base, headers=_hdr(tok))
        assert r.status_code == 200
        assert len(r.json()) == 1

        r = client.post(
            base,
            headers=_hdr(tok),
            json={
                "band_code": "L6",
                "min_annual": 2,
                "mid_annual": 1,
                "max_annual": 3,
                "effective_from": "2026-01-01",
            },
        )
        assert r.status_code == 400

        r = client.post(
            base,
            headers=_hdr(tok),
            json={
                "band_code": "L6",
                "min_annual": 1,
                "mid_annual": 2,
                "max_annual": 3,
                "effective_from": "2025-01-01",
            },
        )
        assert r.status_code == 409

        r = client.patch(
            f"{base}/{bid}",
            headers=_hdr(tok),
            json={"mid_annual": 1_250_000},
        )
        assert r.status_code == 200
        assert r.json()["mid_annual"] == 1_250_000

        r = client.get(f"{base}/audit", headers=_hdr(tok))
        assert r.status_code == 200
        entries = r.json()
        assert len(entries) >= 2
        assert any(e["action"] == "create" for e in entries)
        assert any(e["action"] == "update" for e in entries)


def test_review_cycle_proposals_apply_and_off_cycle_payrun():
    from app.main import app

    with TestClient(app) as client:
        tok, company_id = _register_and_company(client)
        base = f"/api/v1/companies/{company_id}/compensation/review-cycles"

        r = client.post(
            base,
            headers=_hdr(tok),
            json={
                "label": "FY26 merit",
                "fiscal_year": "2026",
                "state": "draft",
                "budget_amount": 5_000_000,
                "effective_from_default": "2026-04-01",
            },
        )
        assert r.status_code == 201, r.text
        cid = r.json()["id"]

        r = client.patch(f"{base}/{cid}", headers=_hdr(tok), json={"state": "open"})
        assert r.status_code == 200

        r = client.post(
            f"{base}/{cid}/guidelines",
            headers=_hdr(tok),
            json={"band_code": "L6", "min_increase_pct": 2, "max_increase_pct": 10},
        )
        assert r.status_code == 201

        r = client.post(
            f"/api/v1/companies/{company_id}/employees",
            headers=_hdr(tok),
            json={"employee_code": "E-INC", "personal_info_json": {"full_name": "Inc Test"}},
        )
        assert r.status_code == 201, r.text
        emp_id = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{company_id}/payroll/salary-structures",
            headers=_hdr(tok),
            json={"employee_id": emp_id, "components_json": {"ctc_annual": 1_200_000, "bonus_pct_of_ctc": 0.0625}},
        )
        assert r.status_code == 201

        r = client.post(
            f"{base}/{cid}/proposals",
            headers=_hdr(tok),
            json={"employee_id": emp_id, "proposed_ctc_annual": 1_260_000, "band_code": "L6"},
        )
        assert r.status_code == 201, r.text
        pid = r.json()["id"]

        r = client.post(f"{base}/{cid}/proposals/{pid}/submit", headers=_hdr(tok))
        assert r.status_code == 200

        r = client.post(f"{base}/{cid}/proposals/{pid}/approve", headers=_hdr(tok))
        assert r.status_code == 200

        r = client.post(f"{base}/{cid}/apply-approved", headers=_hdr(tok))
        assert r.status_code == 200
        assert r.json()["count"] == 1

        r = client.post(
            f"/api/v1/companies/{company_id}/payroll/pay-runs",
            headers=_hdr(tok),
            json={
                "month": 6,
                "year": 2026,
                "department_id": None,
                "run_kind": "off_cycle",
                "pay_date": "2026-06-15",
                "run_label": "Bonus run",
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["run_kind"] == "off_cycle"
        pr_id = r.json()["id"]

        r = client.get("/api/v1/auth/me", headers=_hdr(tok))
        assert r.status_code == 200
        admin_uid = r.json()["id"]
        _set_membership_role(company_id, admin_uid, "hr_ops")

        r = client.post(
            f"/api/v1/companies/{company_id}/payroll/payslips",
            headers=_hdr(tok),
            json={
                "pay_run_id": pr_id,
                "employee_id": emp_id,
                "gross": 50_000.0,
                "net": 40_000.0,
                "earnings_json": {
                    "basic": 30_000,
                    "gross": 45_000,
                    "lines": [{"type": "reimbursement", "code": "TRAVEL", "amount": 5000, "taxable": False}],
                },
                "deductions_json": {},
            },
        )
        assert r.status_code == 201, r.text
        slip_id = r.json()["id"]

        r = client.get(
            f"/api/v1/companies/{company_id}/payroll/payslips/{slip_id}/ledger-entries",
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 2


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
