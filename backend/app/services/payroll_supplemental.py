"""Payslip earnings_json supplemental lines (reimbursements, adjustments) + ledger sync."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.compensation_engagement import PayrollLedgerEntry, Payslip

ALLOWED_LINE_TYPES = frozenset({"reimbursement", "adjustment", "arrears", "other"})


def parse_supplemental_lines(earnings_json: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not earnings_json or not isinstance(earnings_json, dict):
        return []
    raw = earnings_json.get("lines")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        t = str(item.get("type") or "").strip().lower()
        if t not in ALLOWED_LINE_TYPES:
            continue
        code = str(item.get("code") or "").strip() or "line"
        try:
            amt = float(item.get("amount"))
        except (TypeError, ValueError):
            continue
        if amt < 0 or amt > 1e15:
            continue
        taxable = bool(item.get("taxable")) if "taxable" in item else False
        out.append({"type": t, "code": code, "amount": amt, "taxable": taxable})
    return out


def supplemental_lines_total(lines: list[dict[str, Any]]) -> float:
    return float(sum(float(x["amount"]) for x in lines))


def validate_payslip_supplemental_vs_gross(*, gross: float, earnings_json: dict[str, Any] | None) -> None:
    lines = parse_supplemental_lines(earnings_json)
    if not lines:
        return
    s = supplemental_lines_total(lines)
    if s > gross + 1e-6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sum of supplemental earnings lines cannot exceed payslip gross",
        )


def sync_ledger_entries_for_payslip(db: Session, payslip: Payslip) -> None:
    """Replace ledger rows for this payslip from earnings_json.lines + residual salary bucket."""
    db.execute(delete(PayrollLedgerEntry).where(PayrollLedgerEntry.payslip_id == payslip.id))
    lines = parse_supplemental_lines(payslip.earnings_json if isinstance(payslip.earnings_json, dict) else None)
    sup_total = supplemental_lines_total(lines)
    residual = float(payslip.gross) - sup_total
    if residual < -1e-6:
        return
    if residual > 1e-6:
        db.add(
            PayrollLedgerEntry(
                id=uuid_str(),
                company_id=payslip.company_id,
                employee_id=payslip.employee_id,
                pay_run_id=payslip.pay_run_id,
                payslip_id=payslip.id,
                entry_kind="salary_regular",
                direction="credit",
                amount=round(residual, 2),
                currency_code="INR",
                metadata_json={"source": "payslip_gross_minus_supplemental"},
            )
        )
    for ln in lines:
        kind = str(ln["type"])
        if kind == "reimbursement":
            ek = "reimbursement"
        elif kind == "arrears":
            ek = "arrears"
        elif kind == "adjustment":
            ek = "off_cycle_adjustment"
        else:
            ek = "other"
        db.add(
            PayrollLedgerEntry(
                id=uuid_str(),
                company_id=payslip.company_id,
                employee_id=payslip.employee_id,
                pay_run_id=payslip.pay_run_id,
                payslip_id=payslip.id,
                entry_kind=ek,
                direction="credit",
                amount=round(float(ln["amount"]), 2),
                currency_code="INR",
                metadata_json={"code": ln["code"], "taxable": ln.get("taxable", False)},
            )
        )


def list_ledger_entries_for_payslip(db: Session, company_id: str, payslip_id: str) -> list[PayrollLedgerEntry]:
    r = db.execute(
        select(PayrollLedgerEntry).where(
            PayrollLedgerEntry.company_id == company_id,
            PayrollLedgerEntry.payslip_id == payslip_id,
        ).order_by(PayrollLedgerEntry.created_at)
    )
    return list(r.scalars().all())
