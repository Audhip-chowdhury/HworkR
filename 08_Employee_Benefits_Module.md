# HworkR — Employee Benefits Module

> **Who this is for:** Anyone joining the project with zero prior context — devs, designers, product reviewers, or anyone wanting to suggest improvements.

---

## 1. What is the Benefits Module?

The Benefits module lets a company set up **benefit plans** (health, dental, retirement, etc.) and track which employees are **enrolled** in each plan. Like every HworkR module it runs inside a simulated company using SimCash (₹S), so HR learners practice real benefits administration without touching real money or real employee data.

**Compensation & Analytics Specialist** (role: `compensation_analytics`) is the primary user. Company admin (`company_admin`) can also manage. Employees (`employee`) can view and enroll themselves.

---

## 2. Current State: What is Actually Built

The module is a **stub**. It exists and the backend is functional, but the frontend UI is minimal — roughly 50 lines of inline, unstyled HTML. There is no role-awareness, no dependent management, no enrollment period enforcement, and no cost tracking.

---

## 3. Data Models

### 3.1 BenefitsPlan (`benefits_plans` table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID string | PK |
| `company_id` | UUID string | FK → companies |
| `name` | String (255) | e.g. "Group Health Insurance 2026" |
| `type` | String (64), nullable | e.g. `health`, `dental`, `retirement`, `flex` |
| `details_json` | JSON, nullable | Freeform plan details (coverage %, limits, etc.) |
| `enrollment_period` | String (128), nullable | e.g. "Jan 1 – Jan 31 2026" |
| `created_at` | DateTime | |

### 3.2 BenefitsEnrollment (`benefits_enrollments` table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID string | PK |
| `plan_id` | UUID string | FK → benefits_plans |
| `company_id` | UUID string | FK → companies |
| `employee_id` | UUID string | FK → employees |
| `dependents_json` | JSON, nullable | Freeform dependent info (names, relationship, DOB) |
| `status` | String (32) | `active` (default) or `cancelled` |
| `created_at` | DateTime | |

> **Note:** There is no `updated_at` column, so cancellation time is not recorded.

---

## 4. Backend API

All endpoints are under `/api/v1/companies/{company_id}/`.

| Method | Endpoint | Roles | What it does |
|---|---|---|---|
| `POST` | `/benefits/plans` | `company_admin`, `compensation_analytics` | Create a plan |
| `GET` | `/benefits/plans` | All members | List all plans in the company |
| `POST` | `/benefits/enrollments` | `employee` (self only), `company_admin`, `compensation_analytics` | Enroll an employee |
| `GET` | `/benefits/enrollments` | All (employees see own; comp/admin see all or filter by employee) | List enrollments |

### Role Logic on Enrollments

```
POST /benefits/enrollments
  if role == "employee":
    → can only enroll themselves (employee_id must match their own)
    → if employee_id does not match → 403
  elif role not in (company_admin, compensation_analytics):
    → 403
  else:
    → can enroll any employee
```

**No duplicate-enrollment check exists.** An employee can be enrolled in the same plan multiple times — there is no unique constraint on `(plan_id, employee_id)`.

---

## 5. Frontend UI (Current State)

Route: `/company/:companyId/benefits`  
File: `frontend/src/pages/company/benefits/BenefitsPage.tsx`

The current page has **2 tabs**, both very minimal:

### Tab 1 — Plans
- Two raw text inputs: plan name, plan type
- A "Create plan" button — fires `POST /benefits/plans`
- A list of plan names (just `name (type)` text, no table)
- **No role check.** Any logged-in member can see the create form (though the API enforces `_COMP`).

### Tab 2 — Enrollments
- Raw text input for employee id (UUID — not a dropdown)
- Plan select dropdown (populated from plans list)
- "Enroll" button — fires `POST /benefits/enrollments`
- Status filter dropdown (all / active / cancelled)
- A list of enrollments as `employee_id.slice(0,8)… status` (no employee names)
- **No role check.** Any logged-in member can see the form.

### Role access (navConfig.ts)
```
benefits → roles: ['company_admin', 'compensation_analytics', 'employee']
```
`hr_ops`, `talent_acquisition`, `ld_performance` do **not** see Benefits in the nav.

---

## 6. Complete End-to-End Flow (as designed and as currently working)

```
SETUP (company admin / comp analytics)
──────────────────────────────────────
Plans tab → enter name + type → Create plan
  → POST /benefits/plans
  → Plan saved to DB

OPEN ENROLLMENT
───────────────
Admin announces enrollment period (outside the system — no notification or
workflow triggers exist yet).

Tab 2 (Enrollments) →
  Comp analytics manually enters employee UUID + selects plan → Enroll
  → POST /benefits/enrollments
  → BenefitsEnrollment row created (status: "active")

EMPLOYEE SELF-ENROLLMENT
─────────────────────────
Same flow — employee navigates to Benefits, sees the plans list,
enters their own employee id, and clicks Enroll.
  → API checks employee_id == their own → allowed
  → BenefitsEnrollment row created

CANCELLATION
────────────
No cancellation UI exists in the frontend.
The status field supports "cancelled" but there is no PATCH/DELETE endpoint
and no button to cancel. Cancellation cannot be performed through the UI.
```

---

## 7. What is Built vs. What is Missing

### Built and Working
- [x] `BenefitsPlan` model and `POST`/`GET` endpoints
- [x] `BenefitsEnrollment` model and `POST`/`GET` endpoints
- [x] Role guard: employees can only enroll themselves
- [x] `dependents_json` field in the model (but no UI to fill it)
- [x] Status filter on enrollment list
- [x] Audit trail written on both `create_benefits_plan` and `create_benefits_enrollment`

### NOT Built Yet (Gap List)

#### Critical gaps (the module is non-functional without these)

| Gap | Impact |
|---|---|
| No employee dropdown — user must paste raw UUID | Completely unusable in practice |
| No role-aware UI — create form shown to all | Confusing/misleading UX |
| No cancel enrollment — no PATCH or DELETE endpoint | Enrollments cannot be ended |
| No duplicate enrollment guard | Same employee can be enrolled twice in the same plan |
| No employee name in enrollment list | Impossible to understand who is enrolled |

#### Medium priority

| Gap | Description |
|---|---|
| No plan details UI | `details_json` exists but there is no form to fill it (coverage %, premium, etc.) |
| No enrollment period enforcement | `enrollment_period` string exists on the plan but is never checked — you can enroll any time |
| No self-enrollment UX for employees | Employees see the same raw form as admins — no "My Benefits" view showing plans available to them vs. ones they are enrolled in |
| No dependent management | `dependents_json` is stored but never surfaced — there is no form to add dependents (names, DOB, relationship) |
| No enrollment history | Every enrollment is a new row — there is no timeline or previous-status view |
| No `updated_at` on enrollments | Cannot know when a status changed |

#### Low priority / future phases

| Gap | Description |
|---|---|
| No benefits cost analysis | Total cost per department, per plan, per month |
| No bulk enrollment | Enroll a whole department or all employees at once |
| No plan expiration | Plans do not have end dates — they are always available |
| No open enrollment notification | No inbox task or notification triggers when enrollment opens |
| No PDF/document attachment for plan details | Employees cannot download their plan certificate |
| No plan comparison UI | Employees cannot view two plans side by side |

---

## 8. Backend API Map (Full)

```
GET  /api/v1/companies/{company_id}/benefits/plans
POST /api/v1/companies/{company_id}/benefits/plans

GET  /api/v1/companies/{company_id}/benefits/enrollments
     ?employee_id=<uuid>        (comp/admin only — filter by employee)
POST /api/v1/companies/{company_id}/benefits/enrollments
```

Missing endpoints needed:
```
PATCH /api/v1/companies/{company_id}/benefits/enrollments/{id}
      → update status (active → cancelled)
      → update dependents_json

DELETE /api/v1/companies/{company_id}/benefits/enrollments/{id}  (optional)

PATCH /api/v1/companies/{company_id}/benefits/plans/{id}
      → update plan name, type, details, enrollment_period
```

---

## 9. Role Access Matrix

| Action | `company_admin` | `compensation_analytics` | `hr_ops` | `employee` | Others |
|---|---|---|---|---|---|
| See Benefits in nav | Yes | Yes | No | Yes | No |
| Create plan | Yes (API) | Yes (API) | No | No | No |
| List plans | Yes | Yes | No | Yes | No |
| Enroll any employee | Yes (API) | Yes (API) | No | No | No |
| Enroll self | Yes | Yes | No | Yes | No |
| List all enrollments | Yes | Yes | No | Own only | No |
| Cancel enrollment | Not available | Not available | — | — | — |

> **Bug:** The current `BenefitsPage.tsx` does not check roles at all. Any authenticated user on the Benefits page sees the create form and can submit. The API correctly rejects unauthorized calls, but the UI should hide those forms from unauthorized roles to avoid confusion.

---

## 10. Suggested Improvements (Prioritized)

### Priority 1 — Make it usable
1. **Employee dropdown instead of raw UUID input.** Load employees via `listEmployees()`, show name + code.
2. **Role-aware UI.** Hide "Create plan" and "Enroll" forms from `employee` role (self-enroll via a separate "My Benefits" section) and from non-compensation roles.
3. **Cancel enrollment.** Add `PATCH /benefits/enrollments/{id}` endpoint + a "Cancel" button per row.
4. **Prevent duplicate enrollment.** Add unique constraint `(plan_id, employee_id)` + backend 409 response.
5. **Employee names in enrollment list.** Show `full_name (employee_code)` instead of truncated UUID.

### Priority 2 — Real functionality
6. **Plan details form.** Expose `details_json` as structured fields: coverage %, monthly premium (₹S), eligible employee types.
7. **Enrollment period guard.** Parse `enrollment_period` dates; disable enrollments outside the window (with a clear message).
8. **My Benefits view (employees).** Show available plans + enrolled status + dependents per plan. One "Enroll" or "View" button per plan.
9. **Dependent management.** Structured form inside the enrollment: add family members (name, relationship, DOB).
10. **Add `hr_ops` to Benefits nav.** HR Ops should see Benefits in read-only mode for compliance checks.

### Priority 3 — Analytics and automation
11. **Benefits cost report.** Total monthly cost broken down by plan type and department.
12. **Enrollment coverage metric.** % of employees enrolled in at least one plan.
13. **Inbox notification on enrollment window open.** Create an inbox task for eligible employees when an enrollment period starts.
14. **Bulk enroll by department.** One-click enroll all employees in a department into a selected plan.
