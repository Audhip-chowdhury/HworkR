"""Composite HR action score per design doc section 6.2."""

from __future__ import annotations

from typing import Any

from app.scoring_rules import SCORING_WEIGHTS


def composite_score(factors: dict[str, Any]) -> float:
    """Weighted average driven by app.scoring_rules.SCORING_WEIGHTS."""
    total = 0.0
    for dim, weight in SCORING_WEIGHTS.items():
        total += float(factors.get(dim, 0) or 0) * float(weight)
    return round(total, 2)
