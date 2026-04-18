"""
SimCash payroll calculation engine (Indian-style CTC breakdown, §3.1–3.2 design doc).

Currency is ₹S (SimCash). All public monetary outputs are monthly unless suffixed _annual.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

# --- Constants (annual where noted) ---
BASIC_PCT_OF_CTC = 0.45
HRA_PCT_OF_BASIC = 0.50

CONVEYANCE_ANNUAL = 1600.0
MEDICAL_ANNUAL = 1250.0
LTA_ANNUAL = 2500.0
FIXED_ALLOWANCES_ANNUAL = CONVEYANCE_ANNUAL + MEDICAL_ANNUAL + LTA_ANNUAL

PF_RATE = 0.12
GRATUITY_RATE = 0.0481
EMPLOYER_PF_GRATUITY_ANNUAL_MULT = PF_RATE + GRATUITY_RATE  # on basic annual

ESI_GROSS_THRESHOLD_MONTHLY = 1750.0
ESI_EMPLOYER_RATE = 0.0325
ESI_EMPLOYEE_RATE = 0.0075

PROFESSIONAL_TAX_ANNUAL = 200.0
STANDARD_DEDUCTION_ANNUAL = 4167.0
TDS_RATE = 0.30

# HR-submitted values may round differently; validation tolerance (₹S)
DEFAULT_TOLERANCE = 0.5

# Keys aligned with validate-calculation API and frontend
FIELD_KEYS = (
    "basic",
    "hra",
    "conveyance",
    "medical",
    "lta",
    "special_allowance",
    "performance_bonus",
    "gross",
    "pf_employee",
    "esi_employee",
    "professional_tax",
    "tds",
    "loan_recovery",
    "leave_deduction",
    "other_deductions",
    "total_deductions",
    "net",
)


@dataclass(frozen=True)
class SimCashMonthly:
    basic: float
    hra: float
    conveyance: float
    medical: float
    lta: float
    special_allowance: float
    performance_bonus: float
    gross: float
    pf_employer: float
    esi_employer: float
    gratuity_employer: float
    pf_employee: float
    esi_employee: float
    professional_tax: float
    tds: float
    loan_recovery: float
    leave_deduction: float
    other_deductions: float
    total_deductions: float
    net: float


def _r2(x: float) -> float:
    return round(x + 1e-12, 2)


def parse_salary_components(components_json: Any) -> tuple[float, float]:
    """Return (ctc_annual, bonus_pct_of_ctc). Raises ValueError if CTC missing or shape is invalid.

    Accepts a dict, or a JSON string (some DB/driver combinations return a serialized object).
    Non-dict JSON (e.g. arrays) raises ValueError instead of AttributeError so APIs return 400, not 500.
    """
    data: Any = components_json
    if isinstance(data, str):
        s = data.strip()
        if not s:
            raise ValueError("salary structure components_json is required")
        try:
            data = json.loads(s)
        except json.JSONDecodeError as e:
            raise ValueError("components_json must be valid JSON") from e
    if not isinstance(data, dict):
        raise ValueError("components_json must be a JSON object with ctc_annual")
    if not data:
        raise ValueError("salary structure components_json is required")
    raw = data.get("ctc_annual")
    if raw is None:
        raise ValueError("components_json must include ctc_annual")
    try:
        ctc = float(raw)
    except (TypeError, ValueError) as e:
        raise ValueError("ctc_annual must be a number") from e
    if ctc <= 0:
        raise ValueError("ctc_annual must be positive")
    try:
        bonus_pct = float(data.get("bonus_pct_of_ctc", 0.0625))
    except (TypeError, ValueError) as e:
        raise ValueError("bonus_pct_of_ctc must be a number") from e
    if bonus_pct < 0 or bonus_pct > 1:
        raise ValueError("bonus_pct_of_ctc must be between 0 and 1")
    return ctc, bonus_pct


def compute_monthly_breakdown(
    ctc_annual: float,
    bonus_pct_of_ctc: float = 0.0625,
    *,
    loan_recovery_monthly: float = 0.0,
    leave_deduction_monthly: float = 0.0,
    other_deductions_monthly: float = 0.0,
) -> SimCashMonthly:
    """
    Derive expected monthly payslip figures from annual CTC.

    Special allowance is the balancing figure so that
    CTC ≈ Gross + Employer PF + Employer Gratuity (+ Employer ESI when applicable).
    Uses §3.1 component definitions without DA.
    """
    ctc_annual = float(ctc_annual)
    bonus_pct_of_ctc = float(bonus_pct_of_ctc)

    basic_annual = ctc_annual * BASIC_PCT_OF_CTC
    hra_annual = basic_annual * HRA_PCT_OF_BASIC
    bonus_annual = ctc_annual * bonus_pct_of_ctc
    fixed_annual = FIXED_ALLOWANCES_ANNUAL

    employer_pf_gratuity_annual = basic_annual * EMPLOYER_PF_GRATUITY_ANNUAL_MULT

    def gross_and_special(apply_esi_on_gross: bool) -> tuple[float, float]:
        """Return (gross_annual, special_annual)."""
        if not apply_esi_on_gross:
            # CTC = G + employer_pf_gratuity; employer ESI = 0
            gross_annual = ctc_annual - employer_pf_gratuity_annual
        else:
            # CTC = G + employer_pf_gratuity + 0.0325 * G
            gross_annual = (ctc_annual - employer_pf_gratuity_annual) / (1.0 + ESI_EMPLOYER_RATE)
        known = basic_annual + hra_annual + fixed_annual + bonus_annual
        special_annual = gross_annual - known
        return gross_annual, special_annual

    # Assume no ESI first (typical); ESI only if implied monthly gross ≤ threshold
    g_annual, s_annual = gross_and_special(False)
    gross_monthly = g_annual / 12.0
    esi_applies = gross_monthly <= ESI_GROSS_THRESHOLD_MONTHLY + 1e-9
    if esi_applies:
        g_esi, s_esi = gross_and_special(True)
        if g_esi / 12.0 <= ESI_GROSS_THRESHOLD_MONTHLY + 1e-9:
            g_annual, s_annual = g_esi, s_esi
            esi_applies = True
        else:
            esi_applies = False

    basic_m = basic_annual / 12.0
    hra_m = hra_annual / 12.0
    conv_m = CONVEYANCE_ANNUAL / 12.0
    med_m = MEDICAL_ANNUAL / 12.0
    lta_m = LTA_ANNUAL / 12.0
    bonus_m = bonus_annual / 12.0
    special_m = s_annual / 12.0

    pf_emp_m = (PF_RATE * basic_annual) / 12.0
    pf_empr_m = (PF_RATE * basic_annual) / 12.0
    grat_m = (GRATUITY_RATE * basic_annual) / 12.0

    esi_empr_m = ESI_EMPLOYER_RATE * g_annual / 12.0 if esi_applies else 0.0
    esi_emp_m = ESI_EMPLOYEE_RATE * g_annual / 12.0 if esi_applies else 0.0

    pt_m = PROFESSIONAL_TAX_ANNUAL / 12.0

    taxable_annual = (
        g_annual
        - (PF_RATE * basic_annual)
        - PROFESSIONAL_TAX_ANNUAL
        - STANDARD_DEDUCTION_ANNUAL
    )
    taxable_annual = max(0.0, taxable_annual)
    tds_annual = TDS_RATE * taxable_annual
    tds_m = tds_annual / 12.0

    loan_m = max(0.0, float(loan_recovery_monthly))
    leave_m = max(0.0, float(leave_deduction_monthly))
    other_m = max(0.0, float(other_deductions_monthly))

    total_ded_m = _r2(pf_emp_m + esi_emp_m + pt_m + tds_m + loan_m + leave_m + other_m)
    gross_m = g_annual / 12.0
    net_m = _r2(gross_m - total_ded_m)

    return SimCashMonthly(
        basic=_r2(basic_m),
        hra=_r2(hra_m),
        conveyance=_r2(conv_m),
        medical=_r2(med_m),
        lta=_r2(lta_m),
        special_allowance=_r2(special_m),
        performance_bonus=_r2(bonus_m),
        gross=_r2(gross_m),
        pf_employer=_r2(pf_empr_m),
        esi_employer=_r2(esi_empr_m),
        gratuity_employer=_r2(grat_m),
        pf_employee=_r2(pf_emp_m),
        esi_employee=_r2(esi_emp_m),
        professional_tax=_r2(pt_m),
        tds=_r2(tds_m),
        loan_recovery=_r2(loan_m),
        leave_deduction=_r2(leave_m),
        other_deductions=_r2(other_m),
        total_deductions=total_ded_m,
        net=net_m,
    )


def breakdown_to_submitted_map(b: SimCashMonthly) -> dict[str, float]:
    """Map engine output to validate-calculation field names."""
    return {
        "basic": b.basic,
        "hra": b.hra,
        "conveyance": b.conveyance,
        "medical": b.medical,
        "lta": b.lta,
        "special_allowance": b.special_allowance,
        "performance_bonus": b.performance_bonus,
        "gross": b.gross,
        "pf_employee": b.pf_employee,
        "esi_employee": b.esi_employee,
        "professional_tax": b.professional_tax,
        "tds": b.tds,
        "loan_recovery": b.loan_recovery,
        "leave_deduction": b.leave_deduction,
        "other_deductions": b.other_deductions,
        "total_deductions": b.total_deductions,
        "net": b.net,
    }


RECONCILIATION_FIELD_KEYS = ("headcount", "total_gross", "total_deductions", "total_net")


def payslip_deductions_total(deductions_json: Any) -> float:
    """Sum employee deductions from a payslip's deductions_json (prefer total_deductions when present)."""
    if not deductions_json or not isinstance(deductions_json, dict):
        return 0.0
    d = deductions_json
    td = d.get("total_deductions")
    if isinstance(td, (int, float)):
        return float(td)
    if isinstance(td, str) and td.strip():
        try:
            return float(td)
        except ValueError:
            pass
    s = 0.0
    for k, v in d.items():
        if k in ("total_deductions", "net"):
            continue
        if isinstance(v, (int, float)):
            s += float(v)
        elif isinstance(v, str) and v.strip():
            try:
                s += float(v)
            except ValueError:
                pass
    return round(s + 1e-12, 2)


def compare_reconciliation_submitted(
    expected: dict[str, float],
    submitted: dict[str, Any],
    *,
    tolerance: float = DEFAULT_TOLERANCE,
) -> dict[str, bool]:
    """Validate payroll reconciliation totals (practice exercise). headcount is exact integer match."""
    out: dict[str, bool] = {}
    for key in RECONCILIATION_FIELD_KEYS:
        exp = expected.get(key)
        if exp is None:
            out[key] = False
            continue
        raw = submitted.get(key)
        if key == "headcount":
            try:
                si = int(round(float(raw))) if raw is not None and raw != "" else None
                ei = int(round(float(exp)))
                out[key] = si == ei if si is not None else False
            except (TypeError, ValueError):
                out[key] = False
            continue
        try:
            sf = float(raw) if raw is not None and raw != "" else None
            ef = float(exp)
        except (TypeError, ValueError):
            out[key] = False
            continue
        if sf is None:
            out[key] = False
            continue
        out[key] = abs(sf - ef) <= tolerance
    return out


def compare_submitted(
    expected: dict[str, float],
    submitted: dict[str, float | None],
    *,
    tolerance: float = DEFAULT_TOLERANCE,
) -> dict[str, bool]:
    """Per-field match; missing submitted keys treated as mismatch."""
    out: dict[str, bool] = {}
    for key in FIELD_KEYS:
        exp = expected.get(key)
        sub = submitted.get(key)
        if exp is None or sub is None:
            out[key] = False
            continue
        try:
            sf = float(sub)
            ef = float(exp)
        except (TypeError, ValueError):
            out[key] = False
            continue
        out[key] = abs(sf - ef) <= tolerance
    return out


def normalize_submitted_numbers(submitted: dict[str, Any]) -> dict[str, float | None]:
    """Coerce form payload to floats for comparison."""
    optional_zero = frozenset({"loan_recovery", "leave_deduction", "other_deductions"})
    out: dict[str, float | None] = {}
    for key in FIELD_KEYS:
        raw = submitted.get(key)
        if raw is None or raw == "":
            out[key] = 0.0 if key in optional_zero else None
            continue
        try:
            out[key] = float(raw)
        except (TypeError, ValueError):
            out[key] = None
    return out
