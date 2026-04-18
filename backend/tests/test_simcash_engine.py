"""Unit tests for SimCash payroll engine."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.services.simcash_engine import (
    breakdown_to_submitted_map,
    compare_reconciliation_submitted,
    compare_submitted,
    compute_monthly_breakdown,
    normalize_submitted_numbers,
    parse_salary_components,
    payslip_deductions_total,
)


def _hdr(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_parse_salary_components():
    ctc, pct = parse_salary_components({"ctc_annual": 80000.0, "bonus_pct_of_ctc": 0.0625})
    assert ctc == 80000.0
    assert pct == 0.0625


def test_parse_salary_components_json_string():
    ctc, pct = parse_salary_components('{"ctc_annual": 80000, "bonus_pct_of_ctc": 0.0625}')
    assert ctc == 80000.0
    assert pct == 0.0625


def test_parse_salary_components_rejects_non_object_json():
    import pytest

    with pytest.raises(ValueError, match="JSON object"):
        parse_salary_components("[1, 2, 3]")


def test_compute_monthly_80000_ctc_close_to_doc_example():
    b = compute_monthly_breakdown(80000.0, 0.0625)
    # §3.3: basic monthly ₹S 3,000; HRA ₹S 1,500 (no DA in engine)
    assert abs(b.basic - 3000.0) < 1.0
    assert abs(b.hra - 1500.0) < 1.0
    assert b.gross > 0
    assert b.net > 0
    assert b.pf_employee > 0
    assert b.tds > 0
    exp = breakdown_to_submitted_map(b)
    same = {k: exp[k] for k in exp}
    cmp = compare_submitted(exp, same)
    assert all(cmp.values())


def test_compare_submitted_tolerance():
    b = compute_monthly_breakdown(50000.0, 0.05)
    exp = breakdown_to_submitted_map(b)
    off = {k: exp[k] + (1.0 if k == "basic" else 0.0) for k in exp}
    cmp = compare_submitted(exp, off)
    assert cmp["basic"] is False
    assert all(cmp[k] for k in cmp if k != "basic")


def test_normalize_optional_deductions_blank_as_zero():
    b = compute_monthly_breakdown(60000.0, 0.06)
    exp = breakdown_to_submitted_map(b)
    sub = normalize_submitted_numbers({**{k: exp[k] for k in exp}, "loan_recovery": "", "other_deductions": ""})
    cmp = compare_submitted(exp, sub)
    assert all(cmp.values())


def test_validate_payroll_api_with_structure():
    """Integration: create employee + salary structure, validate exact engine values."""
    from tests.test_backend_plan import _register_and_company

    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        suf = uuid.uuid4().hex[:8]
        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={"employee_code": f"E{suf}", "status": "active"},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        eid = r.json()["id"]

        r = client.post(
            f"/api/v1/companies/{cid}/payroll/salary-structures",
            json={"employee_id": eid, "components_json": {"ctc_annual": 80000, "bonus_pct_of_ctc": 0.0625}},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text

        b = compute_monthly_breakdown(80000.0, 0.0625)
        submitted = breakdown_to_submitted_map(b)
        r = client.post(
            f"/api/v1/companies/{cid}/payroll/validate-calculation",
            json={"employee_id": eid, "submitted": submitted},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["all_match"] is True
        assert body.get("expected") is None

        r = client.get(
            f"/api/v1/companies/{cid}/payroll/engine-expected",
            params={"employee_id": eid},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        prev = r.json()
        assert "expected" in prev and "employer_expected" in prev
        assert abs(prev["expected"]["basic"] - submitted["basic"]) < 0.01
        assert "pf_employer" in prev["employer_expected"]


def test_engine_expected_multiple_structures_no_multiple_results_error():
    """Regression: two salary_structure rows for same employee must not raise MultipleResultsFound."""
    from tests.test_backend_plan import _register_and_company

    from app.main import app

    with TestClient(app) as client:
        tok, cid = _register_and_company(client)
        suf = uuid.uuid4().hex[:8]
        r = client.post(
            f"/api/v1/companies/{cid}/employees",
            json={"employee_code": f"M{suf}", "status": "active"},
            headers=_hdr(tok),
        )
        assert r.status_code == 201, r.text
        eid = r.json()["id"]

        for _ in range(2):
            r = client.post(
                f"/api/v1/companies/{cid}/payroll/salary-structures",
                json={"employee_id": eid, "components_json": {"ctc_annual": 80000, "bonus_pct_of_ctc": 0.0625}},
                headers=_hdr(tok),
            )
            assert r.status_code == 201, r.text

        r = client.get(
            f"/api/v1/companies/{cid}/payroll/engine-expected",
            params={"employee_id": eid},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        prev = r.json()
        assert len(prev["expected"]) >= 1
        assert prev["expected"]["basic"] > 0

        b = compute_monthly_breakdown(80000.0, 0.0625)
        sub = breakdown_to_submitted_map(b)
        r = client.post(
            f"/api/v1/companies/{cid}/payroll/validate-calculation",
            json={"employee_id": eid, "submitted": sub},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text


def test_payslip_deductions_total_prefers_total_deductions():
    assert payslip_deductions_total({"pf_employee": 100, "total_deductions": 500.5}) == 500.5


def test_compare_reconciliation_submitted():
    exp = {"headcount": 3.0, "total_gross": 1000.0, "total_deductions": 200.0, "total_net": 800.0}
    sub = {"headcount": 3, "total_gross": 1000.2, "total_deductions": 199.7, "total_net": 800.1}
    cmp = compare_reconciliation_submitted(exp, sub)
    assert cmp["headcount"] is True
    assert cmp["total_gross"] is True
    assert cmp["total_deductions"] is True
    assert cmp["total_net"] is True
    assert all(cmp.values())

    bad = compare_reconciliation_submitted(exp, {**sub, "headcount": 2})
    assert bad["headcount"] is False
