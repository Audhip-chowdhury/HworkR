"""Composite HR action score per design doc section 6.2."""

from __future__ import annotations

from typing import Any


def composite_score(factors: dict[str, Any]) -> float:
    """Weighted average: completeness 0.25, accuracy 0.30, timeliness 0.20, process 0.25."""
    c = float(factors.get("completeness", 0) or 0)
    a = float(factors.get("accuracy", 0) or 0)
    t = float(factors.get("timeliness", 0) or 0)
    p = float(factors.get("process_adherence", 0) or 0)
    return round(c * 0.25 + a * 0.30 + t * 0.20 + p * 0.25, 2)
