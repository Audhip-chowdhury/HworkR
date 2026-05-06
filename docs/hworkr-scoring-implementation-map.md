# HworkR — Scoring engine: module-by-module implementation map

This document maps [hworkr-scoring-engine-spec.md](./hworkr-scoring-engine-spec.md) **rule IDs** to **real code**: SQLAlchemy models, API handlers, and where to compute or log scores. It reflects the repository as of the date below.

**Version:** 0.2  
**Date:** 2026-04-27

**Engine code:** `backend/app/services/scoring_engine/` — rule helpers (`requisition_completeness_factors`, `job_posting_completeness_factors`, `offer_compensation_factors`, `application_process_nudge_factors`, `profile_completeness_factors`, `training_completion_factors`, etc.) are called from `api/v1/recruitment.py`, `api/v1/employees.py`, and `api/v1/performance_learning.py` where noted below.

---

## Shared infrastructure (all modules)

| Piece | Location | Use |
|--------|----------|-----|
| `ActivityLog` + `quality_factors_json` + `quality_score` | `backend/app/models/tracking.py` | Persist per-action four-dimension + composite. |
| `ScoringRule` (SLA seconds, `criteria_json`) | `backend/app/models/tracking.py` | Per-company overrides. |
| `log_tracked_hr_action` / `log_activity` | `backend/app/services/activity_tracking.py`, `activity_log.py` | Standard entry point; sets **timeliness** from `SLA_SECONDS_BY_ACTION` + `reference_started_at` when configured. |
| Default weights + SLA table | `backend/app/scoring_rules.py` | Global defaults; extend for `recruitment` and `compliance` policy **deadline** style rules. |
| `write_audit` | `backend/app/services/audit.py` + `app/models/audit.py` | Immutable trail (`AuditTrailEntry`) for “who did what” — useful for **R-PROC-HOLE-01** (audit joins). |

**Cross-cutting:** New rule implementations should call `log_tracked_hr_action` (or a thin `scoring` helper that writes the same row shape) with explicit `quality_factors: { completeness, accuracy, timeliness, process_adherence }` and `module` / `action_type` strings that line up with `scoring_rules.SLA_SECONDS_BY_ACTION` (add keys as needed).

---

## 1. Recruitment

### 1.1 `R-REQ-COMP-01` — Completeness (S2+): requisition + posting have key information

| Item | Map |
|------|-----|
| **Models** | `Requisition` (`backend/app/models/recruitment.py`): `hiring_criteria_json`, `department_id`, `job_id`, `headcount`, `status`, `approval_chain_json`. `JobPosting`: `title`, `description`, `requirements`, `deadline`, `status`, `posted`, `requisition_id`. `JobCatalogEntry` (`app/models/org.py`): `title`, `salary_band_json`, `grade` — for “what we need” if criteria tie to job. |
| **When to score** | On create/update of requisition: `POST/PATCH /companies/{id}/requisitions` → `recruitment.create_requisition`, `update_requisition` (`api/v1/recruitment.py`). On create/update of posting: `POST/PATCH .../postings` → `create_job_posting`, `update_job_posting`. |
| **Completeness check (example config)** | Treat as incomplete if, e.g.: `description` is null/blank, `deadline` missing for external posting intent, `requirements` blank, requisition has no `job_id` or no structured `hiring_criteria_json` when company policy says they are required. **Exact** required fields → `ScoringRule.criteria_json` per `company_id`. |
| **Activity log today** | **Not** emitted on recruitment routes (no `log_tracked_hr_action` in `recruitment.py` grep). **Add** after `db.commit()` on the paths above, `module="recruitment"`, `action_type` e.g. `requisition_update` / `posting_update`. |
| **Actor** | `user` from `ctx` (TA / company admin). |

### 1.2 `R-PROC-HOLE-01` — Process / light completeness (S1): holes without a true “skip”

| Item | Map |
|------|-----|
| **Idea** | The product allows moving pipeline via `update_application_stage` and `create_offer` (offer sets `Application.stage` to `offer` — see `create_offer`). “Holes” = e.g. no interview row, empty `feedback_json`, resume missing — not necessarily blocked by API. |
| **Data** | `Application` (`stage`, `notes`, `resume_url`); `Interview` (`application_id`, `feedback_json`, `status`, `scheduled_at`); audit `AuditTrailEntry` on `entity_type == "application"`, `action` in `create` / `update_stage` (see `list_application_activity`). |
| **When to score** | **Option A (event):** on `update_application_stage` / `create_interview` / `create_offer`, run a small checker and merge S1 into factors. **Option B (async):** nightly job scanning applications in late stages. |
| **Heuristic example** | If `stage` is `interview` or `offer` but `COUNT(interviews) == 0` or all interviews have empty `feedback_json` → nudge `process_adherence` / `completeness` (S1). Tuned to match product (“very little” penalty). |
| **API** | `PATCH /applications/{id}/stage`, `POST /applications/{id}/interviews`, `POST /offers` (`api/v1/recruitment.py`). |

### 1.3 `C-PAY-BAND-01` (recruitment slice) — Offer comp vs job band (S3)

| Item | Map |
|------|-----|
| **Model** | `Offer.compensation_json` (`recruitment.py`); resolve job via `Application` → `JobPosting` → `Requisition` → `JobCatalogEntry` (`job_id`); compare numeric annual comp to `JobCatalogEntry.salary_band_json` (min/max/structure as you define). **Same** logic already referenced for analytics: `_offer_comp_amount` pattern in `api/v1/analytics.py`. |
| **When to score** | `POST /offers` → `create_offer` (and any future PATCH on offer). |
| **Activity log today** | **None** on offer create. **Add** `log_tracked_hr_action` with `critical_failure: True` in `context_json` when outside band; map to low `accuracy`. |

---

## 2. Employee records

### 2.1 `E-PROF-COMP-01` — Profile completeness (S1)

| Item | Map |
|------|-----|
| **Model** | `Employee.personal_info_json` — phone, address, `emergencyContacts` list; see `_profile_quality_factors` in `api/v1/employees.py` (already a rubric, can align with S1 numerically). |
| **When to score (already partial)** | `PATCH /companies/{id}/employees/me` / HR `PATCH .../employees/{id}` — `log_tracked_hr_action` with `action_type` `update_profile` / `update` and `quality_factors` from `_profile_quality_factors` or heuristics. |
| **Documents (related)** | `EmployeeDocument` + primary docs milestone → `action_type` `document_upload` / `profile_reminder_resolved` (`employees.py`). Strengthen to match “a little” if only profile fields, not doc pipeline. |
| **Actor** | Employee (self) or HR depending on route. |

---

## 3. Leave & attendance

### 3.1 `L-APR-TIME-01` — Approval timeliness (S2)

| Item | Map |
|------|-----|
| **Model** | `LeaveRequest`: `created_at`, `updated_at` (set on decision), `status`, `approved_by` (`app/models/hr_ops.py`). |
| **When to score (already partial)** | `PATCH .../leave/requests/{id}/decision` → `decide_leave_request` in `api/v1/hr_ops.py`: `log_tracked_hr_action` with `module="leave"`, `action_type=approved|rejected`, `reference_started_at=row.created_at`. **Timeliness** is auto from `scoring_rules.SLA_SECONDS_BY_ACTION` → `leave:approved` / `rejected` = 24h. |
| **Tuning** | Change SLA in `scoring_rules.py` or move to per-company `ScoringRule` row; align S2 **numeric** with product. |

**Related (not a separate spec rule, but data exists):** `POST /leave/requests` logs `action_type=create` with body completeness; `attendance` / `holiday` routes log with static-ish factors.

---

## 4. Performance & learning

### 4.1 `T-DUE-OWN-01` — Overdue required training (S2+)

| Item | Map |
|------|-----|
| **Models** | `Course.mandatory` (`mandatory: bool`); `TrainingAssignment` (`due_date`, `status`, `assigned_by`, `employee_id`); `TrainingCompletion` (`completed_at`, `assignment_id`). |
| **Owner for HR penalty** | **Proposed default:** if `course.mandatory` and past `TrainingAssignment.due_date` and no `TrainingCompletion` (or `status != completed`): attribute follow-up to **`assigned_by`** (HR user) when set; if null, only employee-facing metrics unless product says otherwise. |
| **When to score** | **Event:** on employee completion path already logs `log_tracked_hr_action` in `api/v1/performance_learning.py` (module `training`, `action_type=complete`). **Gap:** add **scheduled** job: query `TrainingAssignment` join `Course` where `mandatory` and `due_date < today` and incomplete — emit score row for `assigned_by` (or a single `training_overdue_followup` per company rule). |
| **Activity log today** | Training completion only; no overdue follow-up log yet. |

---

## 5. Pay, benefits, compensation (payroll + structures)

### 5.1 `C-PAY-BAND-01` (payroll slice) — Salary vs grade band

| Item | Map |
|------|-----|
| **Models** | `CompensationGradeBand` and/or org ranges — see `compensation_engagement.py` (`/payroll/grade-bands`, `release_employee_salary`, `SalaryStructure` with `components_json`, etc.). `Employee` links to `position_id` / job for grade resolution (see `_employee_position_grade` patterns in same file). |
| **When to score** | On `create_salary_structure` / `update` / `release_employee_salary` when you can compute “annual” vs band min/max. **No** `log_tracked_hr_action` in `compensation_engagement.py` today. |
| **Reuse** | `_validate_org_grade_range` / grade band validation already encodes invariants; scoring should **not** double-count HTTP 400 — score only **warnings** (inside band) vs **S3** (way outside) per spec.  

### 5.2 Recruitment offer (same rule ID)

See **§1.3** for `Offer` + `JobCatalogEntry.salary_band_json`.

---

## 6. Compliance & policies

### 6.1 `A-POL-ACK-01` — Policy acknowledgment timeliness (S3)

| Item | Map |
|------|-----|
| **Models** | `PolicyDocument` (`created_at`); `PolicyAcknowledgment` (`acknowledged_at` per `user_id` + `policy_id`) — `app/models/policy.py`. |
| **When to score (partial)** | `acknowledge_policy` in `api/v1/audits.py`: on first ack, `log_tracked_hr_action` with `module="compliance"`, `action_type="policy_acknowledged"`, `reference_started_at=row.created_at` (policy). Timeliness is computed vs SLA `compliance:policy_acknowledged` (14d in `scoring_rules.py`). **Late** ack = low timeliness; **Missing** = no user event — needs **batch** job: policies published before `T` and users without a `PolicyAcknowledgment` by `T + SLA` get a negative or zero score row / flag (implementation choice). |
| **Gap** | “Expected time by when” may need a **`due_at` on `PolicyDocument` or Inbox task** to align with the spec’s “certain time”; default today is time-since-`PolicyDocument.created_at`. |

---

## 7. Suggested file layout (new code)

| File | Role |
|------|------|
| `backend/app/services/scoring_engine/rules/recruitment.py` | `evaluate_r_req_comp_01`, `evaluate_r_proc_hole_01` |
| `backend/app/services/scoring_engine/rules/employee.py` | Wrap / replace ad-hoc `_profile_quality_factors` for `E-PROF-COMP-01` |
| `backend/app/services/scoring_engine/rules/leave.py` | Optional: centralize factors for `L-APR-TIME-01` (wrapper around existing log) |
| `backend/app/services/scoring_engine/rules/training.py` | Overdue mandatory assignment checks |
| `backend/app/services/scoring_engine/rules/comp.py` | Band checks for offer + salary structure |
| `backend/app/services/scoring_engine/rules/compliance.py` | `A-POL-ACK-01` extensions (batch) |
| `backend/app/jobs/scoring_*.py` (or cron) | Overdue training + missing policy ack |

Unit tests: small fixtures per rule; assert `quality_factors_json` ranges for S1/S2/S3.

---

## 8. Quick reference: rule → primary route(s)

| Rule ID | Primary file & symbol |
|---------|------------------------|
| `R-REQ-COMP-01` | `api/v1/recruitment.py` — `create_requisition`, `update_requisition`, `create_job_posting`, `update_job_posting` |
| `R-PROC-HOLE-01` | `update_application_stage`, `create_offer`, `create_interview` (+ optional job) |
| `C-PAY-BAND-01` (offers) | `create_offer` in `recruitment.py` |
| `E-PROF-COMP-01` | `api/v1/employees.py` — `update_my_employee_record`, `update_employee` |
| `L-APR-TIME-01` | `api/v1/hr_ops.py` — `decide_leave_request` |
| `T-DUE-OWN-01` | `performance_learning.py` — `TrainingAssignment` + scheduled job; completion handler for partial credit |
| `C-PAY-BAND-01` (pay) | `compensation_engagement.py` — salary release / structure writes |
| `A-POL-ACK-01` | `api/v1/audits.py` — `acknowledge_policy`; + batch for missing acks |

---

*End of implementation map.*
