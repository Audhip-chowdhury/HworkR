"""E-PROF-COMP-01 — employee profile completeness nudge."""

from __future__ import annotations

from app.services.scoring_engine.core import factors_at


def profile_completeness_factors(personal_info_json: dict | None) -> dict[str, float]:
    info = personal_info_json or {}
    phone = str(info.get("phone") or "").strip()
    address = str(info.get("address") or "").strip()
    emergency = info.get("emergencyContacts")
    has_emergency = isinstance(emergency, list) and len(emergency) > 0
    completeness = 60.0
    if phone:
        completeness += 15.0
    if address:
        completeness += 15.0
    if has_emergency:
        completeness += 10.0
    c = min(100.0, completeness)
    acc = 90.0 if phone else 82.0
    proc = 92.0 if has_emergency else 85.0
    # Do not set timeliness here; `log_tracked_hr_action` applies leave/SLA timeliness for `update_profile`.
    return {"completeness": c, "accuracy": acc, "process_adherence": proc}
