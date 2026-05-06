"""Shared helpers for four-dimension quality factors (0–100 each)."""

from __future__ import annotations

from typing import Any

_DIMS: tuple[str, str, str, str] = ("completeness", "accuracy", "timeliness", "process_adherence")


def factors_at(
    *,
    completeness: float = 100.0,
    accuracy: float = 100.0,
    timeliness: float = 100.0,
    process_adherence: float = 100.0,
) -> dict[str, float]:
    return {
        "completeness": max(0.0, min(100.0, float(completeness))),
        "accuracy": max(0.0, min(100.0, float(accuracy))),
        "timeliness": max(0.0, min(100.0, float(timeliness))),
        "process_adherence": max(0.0, min(100.0, float(process_adherence))),
    }


def min_dim(
    f: dict[str, float] | None,
    *,
    completeness: float | None = None,
    accuracy: float | None = None,
    timeliness: float | None = None,
    process_adherence: float | None = None,
) -> dict[str, float]:
    base = f if f is not None else factors_at()
    out = {k: base.get(k, 100.0) for k in _DIMS}
    for name, val in (
        ("completeness", completeness),
        ("accuracy", accuracy),
        ("timeliness", timeliness),
        ("process_adherence", process_adherence),
    ):
        if val is not None:
            v = max(0.0, min(100.0, float(val)))
            if name in out:
                out[name] = min(out[name], v)  # worst of penalties wins
    return factors_at(
        completeness=out.get("completeness", 100.0),
        accuracy=out.get("accuracy", 100.0),
        timeliness=out.get("timeliness", 100.0),
        process_adherence=out.get("process_adherence", 100.0),
    )


def merge_worst(*dicts: dict[str, Any] | None) -> dict[str, float]:
    """Take the minimum (worst) per dimension across multiple factor dicts."""
    acc: dict[str, float] = {k: 100.0 for k in _DIMS}
    for d in dicts:
        if not d:
            continue
        for k in _DIMS:
            v = d.get(k)
            if v is not None and isinstance(v, (int, float)):
                acc[k] = min(acc[k], float(v))
    return factors_at(
        completeness=acc["completeness"],
        accuracy=acc["accuracy"],
        timeliness=acc["timeliness"],
        process_adherence=acc["process_adherence"],
    )


def as_float_dict(f: dict[str, Any] | None) -> dict[str, float]:
    if not f:
        return factors_at()
    return factors_at(
        completeness=float(f.get("completeness", 100.0)),
        accuracy=float(f.get("accuracy", 100.0)),
        timeliness=float(f.get("timeliness", 100.0)),
        process_adherence=float(f.get("process_adherence", 100.0)),
    )
