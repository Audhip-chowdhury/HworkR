"""Role-based randomized cohort task definitions (module + action_type + UI deeplink)."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Final

from app.scoring_rules import CERT_MIN_TASKS_PER_MODULE_BY_ROLE


@dataclass(frozen=True)
class CohortTaskTemplate:
    module: str
    action_type: str
    title: str
    deeplink_suffix: str  # appended after /company/{company_id}/


# Pools of (module, action_type, title, deeplink_suffix) — action_type must match log_tracked_hr_action.
_EMPLOYEES_HR: Final[list[tuple[str, str, str, str]]] = [
    ("employees", "create", "Create a new employee record", "employees/profile"),
    ("employees", "update", "Update an employee profile (HR)", "employees/profile"),
    ("employees", "onboarding_update", "Update onboarding checklist for an employee", "employees/profile"),
    ("employees", "lifecycle_transfer", "Record a transfer lifecycle event", "employees/lifecycle"),
    ("employees", "lifecycle_promotion", "Record a promotion lifecycle event", "employees/lifecycle"),
    ("employees", "lifecycle_event", "Record a lifecycle event for an employee", "employees/lifecycle"),
]

_EMPLOYEES_SELF: Final[list[tuple[str, str, str, str]]] = [
    ("employees", "update_profile", "Update your employee profile", "my-profile"),
    ("employees", "document_upload", "Upload a required document on your profile", "my-profile"),
]

_COMPLIANCE: Final[list[tuple[str, str, str, str]]] = [
    ("compliance", "policy_acknowledged", "Acknowledge a policy from the library", "audits/policies?tab=library"),
    ("compliance", "policy_downloaded", "Download a policy document", "audits/policies?tab=library"),
    ("compliance", "policy_created", "Publish a new company policy", "audits/policies?tab=publish"),
]

_LEAVE: Final[list[tuple[str, str, str, str]]] = [
    ("leave", "approved", "Approve a pending leave request", "leave/approvals"),
    ("leave", "rejected", "Reject a leave request with a clear reason", "leave/approvals"),
    ("leave", "balance_upsert", "Set or adjust a leave balance", "leave/balances"),
    ("leave", "policy_create", "Create or update a leave policy", "leave/policies"),
    ("leave", "holiday_create", "Add a holiday to the calendar", "leave/holidays"),
    ("leave", "create", "Submit a leave request", "leave/request"),
    ("leave", "attendance_recorded", "Record attendance for yourself or a team member", "leave/policies"),
]

_RECRUITMENT: Final[list[tuple[str, str, str, str]]] = [
    ("recruitment", "requisition_create", "Create a hiring requisition", "recruitment"),
    ("recruitment", "posting_create", "Create a job posting from a requisition", "recruitment/postings"),
    ("recruitment", "application_stage", "Move a candidate to the next pipeline stage", "recruitment/pipeline"),
    ("recruitment", "interview_create", "Schedule a candidate interview", "recruitment/interviews"),
    ("recruitment", "offer_create", "Create an offer for a candidate", "recruitment/offers"),
]

_TRAINING: Final[list[tuple[str, str, str, str]]] = [
    ("training", "complete", "Complete a training assignment", "learning/assignments"),
]

_COMPENSATION: Final[list[tuple[str, str, str, str]]] = [
    ("compensation", "grade_band_create", "Create a pay grade band", "payroll"),
    ("compensation", "salary_structure_create", "Create a salary structure", "payroll"),
    ("compensation", "review_cycle_create", "Create a compensation review cycle", "payroll"),
    ("compensation", "proposal_create", "Submit a merit proposal in a review cycle", "payroll"),
    ("compensation", "benefits_plan_create", "Create a benefits plan", "benefits"),
    ("compensation", "guideline_create", "Add guidelines to a review cycle", "payroll"),
]


def _templates_from_pool(
    pool: list[tuple[str, str, str, str]],
    rng: random.Random,
    count: int,
) -> list[CohortTaskTemplate]:
    if count <= 0:
        return []
    if len(pool) >= count:
        picked = rng.sample(pool, k=count)
    else:
        picked = [pool[rng.randrange(0, len(pool))] for _ in range(count)]
    return [
        CohortTaskTemplate(module=m, action_type=a, title=t, deeplink_suffix=d) for m, a, t, d in picked
    ]


def build_week_tasks_for_role(
    *,
    company_id: str,
    user_id: str,
    role: str,
) -> list[tuple[CohortTaskTemplate, int]]:
    """
    Return list of (template, cohort_day) for Mon–Fri spread (days 1–5).
    """
    rng = random.Random(abs(hash(f"{company_id}:{user_id}:cohort")) % (2**31))
    counts = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role)
    if not counts:
        counts = CERT_MIN_TASKS_PER_MODULE_BY_ROLE["employee"]

    items: list[tuple[CohortTaskTemplate, int]] = []
    for mod, n in counts.items():
        if mod == "employees":
            if role in ("hr_ops", "company_admin", "compensation_analytics"):
                pool = list(_EMPLOYEES_HR)
            else:
                pool = list(_EMPLOYEES_SELF)
            tpls = _templates_from_pool(pool, rng, n)
        elif mod == "compliance":
            tpls = _templates_from_pool(list(_COMPLIANCE), rng, n)
        elif mod == "leave":
            tpls = _templates_from_pool(list(_LEAVE), rng, n)
        elif mod == "recruitment":
            tpls = _templates_from_pool(list(_RECRUITMENT), rng, n)
        elif mod == "training":
            tpls = _templates_from_pool(list(_TRAINING), rng, n)
        elif mod == "compensation":
            tpls = _templates_from_pool(list(_COMPENSATION), rng, n)
        else:
            continue
        for t in tpls:
            items.append((t, 1))

    if not items:
        return []
    n_days = 5
    rng.shuffle(items)
    return [(tpl, 1 + (i % n_days)) for i, (tpl, _) in enumerate(items)]
