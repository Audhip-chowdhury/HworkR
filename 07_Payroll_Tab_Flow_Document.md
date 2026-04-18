# HworkR — Payroll Module: Tab-by-Tab Flow Document

> **Purpose:** Full reference for anyone with zero prior context. Explains every tab inside the Payroll page, what each section does, who can use it, how the data flows end-to-end (frontend → API → database), and what is done vs. what still needs to be built.

---

## 0. Context: What is the Payroll Module?

HworkR is an **HR training platform** built like a real HRIS (think Workday). People practice HR skills inside a simulated company. The Payroll module runs on **SimCash (₹S)** — a fictional currency pegged 1:1 to USD — with the exact same math as real Indian payroll (CTC-based, PF/ESI/TDS/PT rules, etc.).

**The core learning mechanic is "Calculate Then Validate":**  
The system always knows the right answer. The HR learner must calculate every value themselves, fill the worksheet, then hit Validate. The system checks silently. If wrong, it routes back via Manager feedback — the HR user **never sees the correct number directly**.

### Who sees the Payroll page?

| Role | Access |
|---|---|
| `company_admin` | All tabs, but **read-only** on payslip worksheet (cannot enter/save payslip figures) |
| `compensation_analytics` | All tabs, full payslip edit |
| `hr_ops` | All tabs, full payslip edit + can **Release salary** |
| `employee` | Only the **Payslips** tab (read-only, their own payslips) |
| `talent_acquisition`, `ld_performance` | No Payroll access |

---

## 1. How the Page is Structured

Route: `/company/:companyId/payroll`  
File: `frontend/src/pages/company/payroll/PayrollPage.tsx`

The page has **4 tabs**, but only configured roles (`company_admin`, `compensation_analytics`, `hr_ops`) see all four. Employees only see the last one.

```
┌──────────────────────────────────────────────────────────────────────┐
│  PAYROLL PAGE                                                        │
│  ┌─────────────────┬──────────────┬──────────────────┬────────────┐ │
│  │ Salary          │  Pay runs    │  Grade structure │  Payslips  │ │
│  │ structures      │              │                  │            │ │
│  │ (configure)     │  (configure) │  (configure)     │  (all)     │ │
│  └─────────────────┴──────────────┴──────────────────┴────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Required setup order (dependency chain):**
```
Grade structure (optional) → Salary structures → Pay runs → Payslips
```
You can skip grade bands, but you cannot generate a payslip without a salary structure, and you cannot create a payslip without a pay run.

---

## 2. Tab 1 — Salary Structures

### What it is
A salary structure stores the **annual CTC** and **bonus % of CTC** for one employee. This is the single source of truth the SimCash engine uses to compute all payroll components (Basic, HRA, PF, TDS, etc.) automatically on the backend.

### Who sees it
`company_admin`, `compensation_analytics`, `hr_ops` only.

### Section A: The Editor Form

**Flow:**
```
1. (Optional) Pick a Department filter   → narrows the employee dropdown
2. (Optional) Pick a Position filter     → narrows further
3. Pick an employee from the dropdown    
   OR type their employee code and click "Look up"
   
4. System auto-loads their latest salary structure (if any).
   → Badge shows "Existing · effective YYYY-MM-DD"  (green)
   → OR "New recruit — confirm CTC & bonus"          (amber)

5. HR fills in:
   - ₹S CTC / year          (required; e.g. 80000)
   - Bonus % of CTC (0–1)   (e.g. 0.0625 = 6.25%)
   - Effective from          (optional date, YYYY-MM-DD)
   - Grade on the org position (optional integer; lower = more senior)

6. If grade bands are configured (Tab 3), the form warns if the entered CTC
   falls outside every currently-effective band. Saving is NOT blocked.

7. Click "Confirm & save" (new) or "Save changes" (edit).
   → POST /api/v1/companies/{id}/salary-structures  (new)
   → PATCH /api/v1/companies/{id}/salary-structures/{id}  (update)
   → Also calls PATCH /api/v1/companies/{id}/employees/{id}
     (updates the employee's department_id + position_id)
   → Also calls PATCH on the position to update its grade integer
```

**Key data stored (`components_json` column in `salary_structures` table):**
```json
{
  "ctc_annual": 80000,
  "bonus_pct_of_ctc": 0.0625
}
```

### Section B: Change History (Audit Log)

Below the form is a searchable audit trail of every create/update to any salary structure in the company.

- Columns: When · By (name + email) · Employee · Action · What changed
- Search is multi-word AND: searches actor name, email, employee name/code/dept, UUIDs, change text
- Powered by: `GET /api/v1/companies/{id}/salary-structures/audit`

### What does NOT exist yet (gaps)
- No ability to **delete** a salary structure (intentional? or missing?)
- No way to see **all employees without a structure** (useful for "who hasn't been set up yet")
- Salary history (multiple structures for same employee) is stored in DB but only the **latest** is loaded/shown — there is no history view per employee

---

## 3. Tab 2 — Pay Runs

### What it is
A **Pay Run** is a batch object that represents "payroll for [Department] in [Month/Year]". It groups all employees in that department for that period. Every employee gets a **line** (`PayRunEmployeeLine`) with a status.

### Who sees it
`company_admin`, `compensation_analytics`, `hr_ops` only.

### Employee Line Statuses (lifecycle)

```
to_be_processed  →  payslip_generated  →  salary_released
```

| Status | Meaning |
|---|---|
| `to_be_processed` | Employee is in the run, no payslip saved yet |
| `payslip_generated` | Payslip worksheet has been filled and saved |
| `salary_released` | HR Ops has confirmed salary is released (final step) |

### Section A: Create a Pay Run (Pay Admin only)

Only `company_admin` and `compensation_analytics` can create pay runs.

```
1. Select Month (dropdown: 18 months back → 6 months ahead)
2. Select Department
3. Click "Create pay run"
   → POST /api/v1/companies/{id}/pay-runs
   → Creates a PayRun row + one PayRunEmployeeLine per active employee
     in that department (status: "to_be_processed")
```

### Section B: Filter & View Existing Pay Runs

```
Filters:
  - Month (calendar period)
  - Department
  - Employee status (all / to_be_processed / payslip_generated / salary_released)

Result: A collapsible list of department cards.
  Each card shows:
    - Department name
    - Status pill: "Pay run created" (open) | "Payrun closed" (closed/finalized)
    
  Expand a card to see the employee table:
    - Employee code | Name | Email | Payroll status
    - Actions:
        [Open payslip]   → navigates to Payslips tab pre-selecting this run + employee
        [Release salary] → visible to hr_ops only, when status = payslip_generated
```

### Release Salary Flow

```
hr_ops clicks "Release salary" on an employee row
  → Confirmation modal appears (critical warning dialog)
  → hr_ops confirms
  → POST /api/v1/companies/{id}/pay-runs/{run_id}/employees/{emp_id}/release
  → Employee line status changes: payslip_generated → salary_released
  → Run status recalculated: if ALL lines are salary_released → "payrun_closed"
```

**This is a one-way, irreversible operation** in the current implementation. No undo.

### What does NOT exist yet (gaps)
- No way to **close/finalize a pay run manually** (only auto-closes when all employees are released)
- No bulk "release all" action
- Pay run has a `status` field (`draft`) but it is **never updated in the UI** — it stays `draft`; the actual completion is derived from employee line statuses
- No payroll **summary view** (total gross/net for the department per month)
- No notifications/inbox task triggered when a payslip is ready for HR Ops to release

---

## 4. Tab 3 — Grade Structure

### What it is
Grade bands define the company's **compensation tiers** — each band has a code (e.g. `G4`, `L6`), a min/mid/max annual salary range, an effective date range, and optional org-position grade mapping. They are **purely informational** for now: they do not block saving a salary structure, they only show a warning on Tab 1 if CTC is outside all current bands.

### Who sees it
`company_admin`, `compensation_analytics`, `hr_ops` only.

### Section A: Grade Band Table

Lists all bands with: Band code · Display name · Min/Mid/Max annual · Currency · Effective from · Effective to · Org grade min/max · Notes.

Each row has an **Edit** button (inline edit form, no delete).

### Section B: Add Grade Band Form

```
Required: Band code, Min annual, Mid annual, Max annual, Effective from
Optional: Display name, Currency (default INR), Effective to, 
          Org grade min, Org grade max, Notes

Validation (client-side):
  - min ≤ mid ≤ max
  - org grade min ≤ org grade max

→ POST /api/v1/companies/{id}/grade-bands
```

**Versioning:** The same band code can appear multiple times with different effective dates. E.g., `G4` from `2024-01-01` to `2024-12-31`, and `G4` from `2025-01-01` onwards with updated ranges.

### Section C: Grade Band Audit Log

Every create/update to a band is logged: When · User · Action · What changed.

Powered by: `GET /api/v1/companies/{id}/grade-bands/audit`

### Important conceptual distinction
> **Org position grade** (Tab 1 / Salary Structures) = an integer rank in the org chart (lower = more senior). This is an org structure concept.  
> **Band code** (Tab 3 / Grade Structure) = a compensation label like `G4` or `L6`. This is a pay-band concept.  
> They are linked optionally via `org_position_grade_min/max` columns on the band.

### What does NOT exist yet (gaps)
- No way to **delete** a grade band
- No automatic assignment of grade band to employees based on their CTC
- No enforcement (bands are advisory only, no block on saving out-of-band CTC)
- No visualization (chart of bands vs. employees' actual CTCs)

---

## 5. Tab 4 — Payslips

This is the core **learning activity tab**. This is where HR learners actually do the payroll calculation work.

### Who sees it
All roles — but with very different experiences:

| Role | Can see payslip form | Can enter/save values | Can validate |
|---|---|---|---|
| `compensation_analytics` | Yes | Yes | Yes |
| `hr_ops` | Yes | Yes | Yes |
| `company_admin` | Yes | **No (view only)** | No |
| `employee` | Sees "Your payslips" list only | No | No |

### Section A: Payslip Worksheet (HR/Comp roles)

**Setup selectors (required before worksheet activates):**
```
1. Select Pay Run  (dropdown: "Month · Department")
2. Select Employee (dropdown filtered to that department's employees)
   → If the selected pay run is department-scoped, only employees
     from that department appear.
```

**If no salary structure exists for the employee**, a warning shows and the Engine reference column is empty (engine cannot compute without CTC).

**The SimCashWorksheet component** (`SimCashWorksheet.tsx`) renders a two-section table:

#### Earnings section
| Field | What HR must calculate |
|---|---|
| Basic salary | 45% of annual CTC ÷ 12 |
| HRA | 50% of monthly Basic |
| Conveyance allowance | ₹S 133.33/mo (fixed: 1,600/yr) |
| Medical allowance | ₹S 104.17/mo (fixed: 1,250/yr) |
| LTA | ₹S 208.33/mo (fixed: 2,500/yr) |
| Special allowance | Balancing figure (CTC − all other components) |
| Performance bonus | bonus_pct_of_ctc × annual CTC ÷ 12 |
| **Gross salary** | Sum of all earnings above |

#### Deductions section
| Field | What HR must calculate |
|---|---|
| PF (employee) | 12% of monthly Basic |
| ESI (employee) | 0.75% of Gross **only if** monthly Gross ≤ ₹S 1,750 |
| Professional tax | ₹S 16.67/mo (fixed: 200/yr) |
| TDS | 30% of (Annual Gross − Employee PF − PT − Standard Deduction ₹4,167) ÷ 12 |
| Loan recovery | HR-entered (optional) |
| Other deductions | HR-entered (optional) |
| **Total deductions** | Sum of all deductions |
| **Net pay** | Gross − Total deductions |

#### Engine Reference Column
A **hidden-by-default column** (toggled by a checkbox) shows the backend-computed correct value for each field. This is the cheat sheet / trainer reference. It is computed in real-time by calling:
```
GET /api/v1/companies/{id}/simcash/engine-expected
    ?employee_id=...&loan_recovery=...&other_deductions=...
```
Debounced 350ms when loan/other deductions change.

> **Note on training philosophy:** The Engine Reference column currently defaults to visible (`localStorage` key `hworkr_simcash_show_engine`). In the original design doc, the HR user should NEVER see the expected value. This toggle exists for trainers/admins. For a pure training experience, this column should be hidden from `compensation_analytics` and `hr_ops` roles.

### The Validation Flow (Core Learning Loop)

```
HR fills all fields manually
         ↓
[Validate (SimCash)] button
         ↓
POST /api/v1/companies/{id}/payroll/validate-calculation
  Body: { employee_id, pay_run_id, submitted: { basic: X, hra: Y, ... } }
         ↓
Backend (simcash_engine.py):
  1. Loads employee's salary structure (CTC + bonus%)
  2. Runs compute_monthly_breakdown()
  3. Compares each submitted field to engine-computed value
     using a tolerance (floating point tolerance for rounding)
  4. Returns:
     { all_match: true/false, fields: { basic: {ok: true}, hra: {ok: false}, ... } }
         ↓
Frontend:
  - If "Show green/red" checkbox is on:
      → each input cell turns GREEN (correct) or RED (wrong)
  - If all_match = true → "All fields match the engine within tolerance"
  - If all_match = false → "Some fields need correction (see highlights)"
         ↓
[Save payslip] — can save even if validation failed (with a confirm dialog warning)
  → POST /api/v1/companies/{id}/payslips
  → Creates Payslip row with earnings_json, deductions_json, gross, net
  → Updates PayRunEmployeeLine status:
      to_be_processed → payslip_generated
```

> **Gap vs. Design Doc:** The design says errors should route to a Manager (bot) with a notification payload. Currently, validation just highlights fields locally. The Manager-bot feedback loop, "Returned by Manager" state, and attempt-counting are **not yet implemented**.

### Section B: Your Payslips (all roles, including employee)

Below the worksheet (for HR roles) or as the entire page (for employees) is a simple list of all saved payslips for the company:

```
Pay run {short-id}… — gross ₹S X · net ₹S Y
```

> **Gap:** This is extremely minimal. For employees it should show their own payslips only, with a formatted breakdown. For HR it should show all payslips with filtering. Currently it just shows every payslip in the company with a minimal one-liner.

---

## 6. Backend API Map

All endpoints live under `/api/v1/companies/{company_id}/`.

| Endpoint | Method | Tab | Purpose |
|---|---|---|---|
| `salary-structures` | GET | Salary | List all structures |
| `salary-structures` | POST | Salary | Create new structure |
| `salary-structures/{id}` | PATCH | Salary | Update structure |
| `salary-structures/audit` | GET | Salary | Change history |
| `pay-runs` | GET | Pay runs | List all pay runs |
| `pay-runs` | POST | Pay runs | Create new pay run |
| `pay-runs/period-overview` | GET | Pay runs | Dept × employee status board |
| `pay-runs/{id}/employees/{id}/release` | POST | Pay runs | Release salary |
| `grade-bands` | GET | Grades | List bands |
| `grade-bands` | POST | Grades | Create band |
| `grade-bands/{id}` | PATCH | Grades | Update band |
| `grade-bands/audit` | GET | Grades | Change history |
| `payslips` | GET | Payslips | List payslips |
| `payslips` | POST | Payslips | Save payslip |
| `payroll/validate-calculation` | POST | Payslips | SimCash validation |
| `simcash/engine-expected` | GET | Payslips | Engine reference preview |

**Role guards (backend):**

| Guard constant | Roles allowed |
|---|---|
| `_COMP` | `company_admin`, `compensation_analytics` |
| `_PAYROLL_OPS` | `company_admin`, `compensation_analytics`, `hr_ops` |
| `_PAYROLL_COMPANY_ADMIN` | `company_admin`, `compensation_analytics` (create pay run) |
| `_PAYROLL_HR_RELEASE` | `hr_ops` only (release salary) |
| `_PAYROLL_PAYSLIP_EDIT` | `compensation_analytics`, `hr_ops` (save payslip) |

---

## 7. Database Models

| Table | Key columns | Purpose |
|---|---|---|
| `salary_structures` | `employee_id`, `components_json`, `effective_from` | CTC + bonus per employee |
| `pay_runs` | `company_id`, `department_id`, `month`, `year`, `status` | Monthly batch per dept |
| `pay_run_employee_lines` | `pay_run_id`, `employee_id`, `status` | Per-employee status in a run |
| `payslips` | `pay_run_id`, `employee_id`, `gross`, `net`, `earnings_json`, `deductions_json` | Final payslip data |
| `compensation_grade_bands` | `band_code`, `min_annual`, `mid_annual`, `max_annual`, `effective_from` | Pay bands |

---

## 8. Full End-to-End Happy Path

```
SETUP (one-time per company)
─────────────────────────────
[company_admin or compensation_analytics]
  Tab 3 → Add grade bands (e.g. G1–G6 with min/mid/max)
  Tab 1 → For each employee:
             Pick dept → Pick position → Pick employee
             Enter CTC annual + bonus % → Save
             (This also sets their dept + position + grade)

MONTHLY PAYROLL CYCLE
──────────────────────
[company_admin or compensation_analytics]
  Tab 2 → Select month → Select department → "Create pay run"
           (Creates the run + employee lines = "to_be_processed" for all)

[compensation_analytics or hr_ops]
  Tab 2 → Find the pay run → Expand the department card
           For each employee: click "Open payslip"
           → Lands on Tab 4, pre-selected on this employee + pay run

  Tab 4 → Worksheet appears (blank)
           HR calculates manually:
             - All earnings line by line
             - Gross
             - All deductions line by line
             - Total deductions
             - Net pay
           Optional: click "Validate (SimCash)" to check
             → Fields turn green/red
             → Fix errors, validate again
           Click "Save payslip"
             → Line status: to_be_processed → payslip_generated

[hr_ops]
  Tab 2 → Find employees with status "payslip_generated"
           Click "Release salary" → confirm modal
             → Line status: payslip_generated → salary_released
           When ALL employees released → run auto-closes ("payrun_closed")
```

---

## 9. What is Built vs. What is Missing

### Built and Working
- [x] Salary structure create/edit/audit
- [x] Grade band create/edit/audit with versioning
- [x] CTC-outside-band warning on salary tab
- [x] Pay run create (per department per month)
- [x] Pay run employee lines (auto-created when pay run is created)
- [x] Pay runs period overview board (dept cards + employee table with status)
- [x] Release salary flow with confirmation modal (hr_ops)
- [x] SimCashWorksheet with all Indian payroll fields
- [x] Engine reference column (real-time backend compute)
- [x] Validate button with per-field green/red highlighting
- [x] Save payslip (creates payslip + updates line status)
- [x] Role-based access (view-only for company_admin, no access for employee on configure tabs)
- [x] URL deep-link support (`?tab=payslips&pay_run_id=...&employee_id=...`)
- [x] Full audit trails for salary structures and grade bands

### NOT Built Yet (Gaps to Address)

#### High priority (core training mechanic)
- [ ] **Manager-bot feedback loop** — when validation fails, notify the Manager bot, show "Returned by Manager" state in the worksheet, allow manager to approve/reject/request-redo. This is the #1 missing piece from the design doc.
- [ ] **Attempt counter** — track how many times an HR user submits a payslip calculation (for scoring). Currently not tracked anywhere.
- [ ] **Hide Engine Reference from learners** — the "Show engine column" currently defaults to visible. For learner roles (`compensation_analytics`, `hr_ops`), it should default OFF and ideally require a trainer/admin to enable it.
- [ ] **Scoring integration** — each payslip save should emit a score event to the tracking/certification system. Not wired yet.

#### Medium priority (usability)
- [ ] **Employee payslip view** — the "Your payslips" section for employees is just a raw list of one-liners. It needs a proper payslip card or PDF view showing all components.
- [ ] **Payroll summary** — a department-level summary: total gross, total deductions, total net for a pay run.
- [ ] **Pay run manual close/reopen** — currently a pay run only closes automatically. There is no way to re-open it.
- [ ] **Employees without salary structure** — there is no view that shows which employees haven't been set up yet.
- [ ] **Payslip history per employee** — the salary structures tab shows one employee at a time; there is no "all employees and their latest structure" table view.
- [ ] **Bulk operations** — no "release all" or "validate all" in a run.

#### Low priority / future phase
- [ ] **Pro-rata payroll scenarios** — mid-month joiners (designed in doc §5.2), not built yet
- [ ] **LWP deductions** — leave without pay adjustment (doc §5.3), not built yet
- [ ] **Arrears calculation** — backdated salary revision (doc §5.4), not built yet
- [ ] **Benefits / ESI enrollment** — `BenefitsPlan` and `BenefitsEnrollment` models exist in the DB but are not exposed in the UI
- [ ] **Survey / engagement** — `Survey` and `SurveyResponse` models exist in the DB but have no UI
- [ ] **Payslip PDF generation** — `pdf_url` column exists in `payslips` table, not generated
- [ ] **Grade band delete**
- [ ] **Salary structure delete**

---

## 10. Recommended Next Steps (Priority Order)

1. **Hide engine reference from learner roles by default.** One-line change: the `showEngineColumn` default in `PayrollPage.tsx` should be `false` for `compensation_analytics` and `hr_ops`.

2. **Build the Manager-bot feedback loop.** When a payslip is saved with `allMatch = false`, the system should create an inbox task for the Manager bot with the field-level error payload (from the design doc §4.1). The HR user should see "Returned by Manager" status and a feedback message. No correct answer is ever shown.

3. **Wire scoring on payslip save.** Call the tracking/scoring API when a payslip is saved. Track: number of validation attempts, whether final save had `allMatch = true`, time taken.

4. **Employee payslip view** — make the "Your payslips" section role-aware (employees only see their own), and show a proper breakdown card with earnings and deductions.

5. **Payroll summary card per pay run** — on the Pay runs tab, show totals (total employees, total gross, total net) at the department-run level.

6. **"Not set up" employees list** — on the Salary structures tab, add a section showing employees who have no salary structure yet.
