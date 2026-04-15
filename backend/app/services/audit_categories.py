"""Map activity modules and audit entity types to user-facing categories (Leave, Profile, etc.)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Source = Literal["activity", "audit"]


@dataclass(frozen=True, slots=True)
class AuditCategoryDef:
    id: str
    label: str
    activity_modules: frozenset[str]
    audit_entity_types: frozenset[str]


# Order = display order in filters. "other" must be last for fallback resolution.
_AUDIT_CATEGORIES: tuple[AuditCategoryDef, ...] = (
    AuditCategoryDef(
        "leave",
        "Leave",
        frozenset({"leave"}),
        frozenset({"leave_policy", "leave_request", "leave_balance", "holiday", "attendance"}),
    ),
    AuditCategoryDef(
        "profile",
        "Profile & employee records",
        frozenset({"employees"}),
        frozenset({"employee", "employee_document", "lifecycle_event"}),
    ),
    AuditCategoryDef(
        "compliance",
        "Compliance & policies",
        frozenset({"compliance"}),
        frozenset({"policy_document", "policy_acknowledgment"}),
    ),
    AuditCategoryDef(
        "recruitment",
        "Recruitment",
        frozenset({"recruitment"}),
        frozenset({"requisition", "job_posting", "application", "interview", "offer"}),
    ),
    AuditCategoryDef(
        "performance",
        "Performance & learning",
        frozenset({"training"}),
        frozenset(
            {
                "review_cycle",
                "goal",
                "assessment",
                "pip",
                "course",
                "training_assignment",
                "training_completion",
                "skill_profile",
            }
        ),
    ),
    AuditCategoryDef(
        "certification",
        "Certification",
        frozenset({"certification"}),
        frozenset({"cert_track", "cert_progress", "certificate"}),
    ),
    AuditCategoryDef(
        "organization",
        "Organization & directory",
        frozenset(),
        frozenset(
            {
                "department",
                "location",
                "job_catalog",
                "org_role",
                "company",
                "company_membership",
            }
        ),
    ),
    AuditCategoryDef(
        "workflows",
        "Workflows & approvals",
        frozenset(),
        frozenset({"workflow_instance"}),
    ),
    AuditCategoryDef(
        "payroll_engagement",
        "Payroll, benefits & surveys",
        frozenset(),
        frozenset(
            {
                "salary_structure",
                "pay_run",
                "payslip",
                "benefits_plan",
                "benefits_enrollment",
                "survey",
                "survey_response",
            }
        ),
    ),
    AuditCategoryDef(
        "other",
        "Other",
        frozenset(),
        frozenset(),
    ),
)

_NON_OTHER = tuple(c for c in _AUDIT_CATEGORIES if c.id != "other")
_OTHER = next(c for c in _AUDIT_CATEGORIES if c.id == "other")

ALL_KNOWN_ACTIVITY_MODULES: frozenset[str] = frozenset().union(*(c.activity_modules for c in _NON_OTHER))
ALL_KNOWN_AUDIT_ENTITY_TYPES: frozenset[str] = frozenset().union(*(c.audit_entity_types for c in _NON_OTHER))


def list_category_options() -> list[tuple[str, str]]:
    """(id, label) for API and UI, excluding the empty 'other' from the main list — 'other' appended at end."""
    ordered = [c for c in _AUDIT_CATEGORIES if c.id != "other"]
    return [(c.id, c.label) for c in ordered] + [(_OTHER.id, _OTHER.label)]


def get_category_def(category_id: str) -> AuditCategoryDef | None:
    for c in _AUDIT_CATEGORIES:
        if c.id == category_id:
            return c
    return None


def classify(source: Source, screen: str) -> tuple[str, str]:
    """
    Return (category_id, category_label) for one trail row.
    `screen` is ActivityLog.module or AuditTrailEntry.entity_type.
    """
    s = (screen or "").strip()
    for c in _NON_OTHER:
        if source == "activity" and s in c.activity_modules:
            return (c.id, c.label)
        if source == "audit" and s in c.audit_entity_types:
            return (c.id, c.label)
    return (_OTHER.id, _OTHER.label)
