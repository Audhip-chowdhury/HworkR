"""Normalize annual comp and salary-band bounds from JSON (offers, job catalog, payroll)."""

from __future__ import annotations

from typing import Any

_COMP_ANNUAL_KEYS: tuple[str, ...] = (
    "ctc_annual_simcash",
    "ctc_annual",
    "annual_ctc",
    "base_salary_annual",
    "total_comp_annual",
)


def annual_from_comp_dict(comp: dict[str, Any] | None) -> float | None:
    if not comp:
        return None
    for k in _COMP_ANNUAL_KEYS:
        v = comp.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return None


def min_max_from_salary_band_json(band: dict[str, Any] | None) -> tuple[float | None, float | None]:
    if not band or not isinstance(band, dict):
        return (None, None)
    for lo_k, hi_k in (
        ("min_annual", "max_annual"),
        ("min", "max"),
    ):
        lo, hi = band.get(lo_k), band.get(hi_k)
        if isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and float(hi) >= float(lo):
            return (float(lo), float(hi))
    return (None, None)


def comp_accuracy_vs_band(*, amount: float | None, min_annual: float | None, max_annual: float | None) -> float:
    """
    C-PAY-BAND-01: 100 in band, softer outside band, strong penalty when far out.
    """
    if amount is None or min_annual is None or max_annual is None or max_annual < min_annual:
        return 90.0  # cannot judge — mild neutral
    if min_annual <= amount <= max_annual:
        return 100.0
    span = max_annual - min_annual
    if span <= 0:
        return 50.0
    if amount < min_annual:
        gap = (min_annual - amount) / max(span, 1.0)
    else:
        gap = (amount - max_annual) / max(span, 1.0)
    if gap <= 0.10:
        return 72.0
    if gap <= 0.30:
        return 48.0
    return 28.0  # S3: far out
