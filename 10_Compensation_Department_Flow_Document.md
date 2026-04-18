# HworkR — Compensation Department: End-to-End Module & Flow Guide

> Audience: business users, HR learners, technical teams, and AI agents.  
> Goal: explain what exists today, what each tab/module does, and how data flows across the compensation domain.

---

## 1) What "Compensation Department" means in HworkR

In this workspace, compensation is delivered as a connected set of modules:

1. **Payroll** (salary structures, grade bands, merit cycles, pay runs, reimbursements, reconciliation, payslips)
2. **Benefits** (benefit plans + enrollments)
3. **Engagement & Surveys** (survey cycles, responses, action plans, trends)

At the navigation level, these are separate pages:
- `Payroll`
- `Benefits`
- `Engagement & Surveys`

They are connected because all 3 operate on the same company + employee master data and use role-based permissions.

---

## 2) Role access (high level)

Common roles used in compensation scope:
- `company_admin`
- `compensation_analytics`
- `hr_ops`
- `employee`

Page-level visibility from navigation:
- `Payroll`: `company_admin`, `compensation_analytics`, `hr_ops`, `employee`
- `Benefits`: `company_admin`, `compensation_analytics`, `employee`
- `Engagement & Surveys`: `company_admin`, `compensation_analytics`, `hr_ops`, `employee`

---

## 3) Payroll page tabs and what each tab contains

File: `frontend/src/pages/company/payroll/PayrollPage.tsx`

Current tabs:
1. **Salary structures**
2. **Pay runs**
3. **Grade structure**
4. **Merit / increments**
5. **Reconciliation**
6. **Reimbursements**
7. **Payslips**

### 3.1 Salary structures
Purpose:
- Set or update an employee's compensation base used by SimCash.

Contains:
- Employee selection/filtering
- CTC + bonus configuration
- Save/update actions
- Salary structure audit view

Output:
- Writes `SalaryStructure` records used by payroll calculations and merit apply flows.

---

### 3.2 Pay runs
Purpose:
- Create period payroll batches.

Contains:
- Create run form with:
  - run kind (`regular`, `off_cycle`, `supplemental`)
  - month/year
  - department (required for regular, optional for non-regular)
  - optional pay date + label for non-regular
- Period filter views
- Run status/employee-line overview

Output:
- Creates `PayRun` batches used when saving payslips.

---

### 3.3 Grade structure
Purpose:
- Maintain compensation grade bands and related policy ranges.

Contains:
- Grade band list
- Add/update controls
- Grade-band audit trail

Output:
- Grade band catalog used as guidance for salary and merit planning.

---

### 3.4 Merit / increments
Purpose:
- Run annual/periodic increment cycles.

Contains:
- Review cycle CRUD (label, fiscal year, state, budget, effective date)
- Guidelines by band code (min/max %)
- Employee proposals (draft/submit/approve/reject)
- Budget summary (approved + submitted deltas)
- "Apply approved" action to create new salary structures

Output:
- Converts approved proposals into new `SalaryStructure` rows with cycle effective date.

---

### 3.5 Reconciliation
Purpose:
- Validate aggregate payroll values for a selected period/run.

Contains:
- Expected totals fetch
- Reconciliation worksheet
- Validation action

Output:
- Quality control signal before downstream release.

---

### 3.6 Reimbursements (new dedicated tab)
Purpose:
- Manage supplemental earning lines independent from the main payslip worksheet.

Contains:
- Pay run + employee selectors
- Supplemental lines editor:
  - `type`: reimbursement / adjustment / arrears / other
  - `code`
  - `amount`
  - `taxable`
- Ledger preview for selected payslip (if available)
- Guidance to save from Payslips tab

Output:
- Writes to `earnings_json.lines` on payslip save and contributes to payroll ledger entries.

---

### 3.7 Payslips
Purpose:
- Perform and validate payroll worksheet, then save payslip.

Contains:
- Pay run + employee selection
- SimCash worksheet form
- Engine reference + validation
- Save payslip action
- User-level payslip list/history

Note:
- Reimbursement/supplemental line editing has been moved to the dedicated **Reimbursements** tab.

---

## 4) Payroll end-to-end flow (business view)

Recommended operational order:

1. Configure **Grade structure** (optional policy layer)
2. Configure **Salary structures** (mandatory for meaningful engine results)
3. Create **Pay runs** (regular/off-cycle/supplemental)
4. Prepare supplemental lines in **Reimbursements** (if needed)
5. Calculate and save **Payslips**
6. Run **Reconciliation**
7. If annual cycle: run **Merit / increments** and apply approved proposals

---

## 5) Technical flow map (Payroll)

```mermaid
flowchart TD
  GB[Grade Bands] --> SS[Salary Structures]
  SS --> PR[Pay Runs]
  PR --> PS[Payslips]
  RB[Reimbursements Tab\n(earnings_json.lines)] --> PS
  PS --> LG[Payroll Ledger Entries]
  PS --> RC[Reconciliation]
  MC[Merit Cycle + Proposals] -->|Apply Approved| SS
```

---

## 6) Benefits module flow

File: `frontend/src/pages/company/benefits/BenefitsPage.tsx`

Main tabs:
- `plans`
- `enrollments`
- `myBenefits`

Flow:
1. Admin/comp roles create and maintain benefit plans.
2. Enrollments are created/updated for employees.
3. Summary metrics show coverage and gaps.
4. Employees can view their benefit participation.

Dependencies:
- Uses employee + company master data.
- Independent from payroll calculations, but complementary from a total-rewards perspective.

---

## 7) Engagement & Surveys module flow

File: `frontend/src/pages/company/surveys/SurveysPage.tsx`

Main tabs:
- `surveys`
- `responses`
- `actionPlans`
- `trends`

Flow:
1. Create surveys (or start from templates).
2. Activate and collect responses.
3. Analyze responses + response rates.
4. Create and track action plans.
5. Track trend signals over time.

Dependencies:
- Uses employees and role permissions.
- Operationally related to compensation/engagement strategy, though not part of payroll math.

---

## 8) API connectivity (backend routes)

Primary backend files:
- `backend/app/api/v1/compensation_engagement.py`
- `backend/app/api/v1/compensation_review.py`

### 8.1 Payroll endpoints (selected)
- `/payroll/grade-bands` (+ audit)
- `/payroll/salary-structures` (+ audit)
- `/payroll/pay-runs`
- `/payroll/pay-runs/period-overview`
- `/payroll/payslips`
- `/payroll/payslips/{payslip_id}/ledger-entries`
- `/payroll/engine-expected`
- `/payroll/validate-calculation`
- `/payroll/reconciliation-expected`
- `/payroll/validate-reconciliation`

### 8.2 Merit (compensation review) endpoints
- `/compensation/review-cycles`
- `/compensation/review-cycles/{cycle_id}/guidelines`
- `/compensation/review-cycles/{cycle_id}/proposals`
- proposal actions: `/submit`, `/approve`, `/reject`
- `/compensation/review-cycles/{cycle_id}/budget-summary`
- `/compensation/review-cycles/{cycle_id}/apply-approved`

### 8.3 Benefits endpoints
- `/benefits/plans`
- `/benefits/enrollments`
- `/benefits/enrollment-summary`

### 8.4 Engagement endpoints
- `/engagement/surveys`
- `/engagement/survey-templates`
- `/engagement/survey-responses`
- `/engagement/surveys/{survey_id}/action-plans`
- `/engagement/action-plans/{action_plan_id}`

---

## 9) Data objects and module connectivities

Core connectivity entities:
- **Employee** (common across all modules)
- **SalaryStructure** (base compensation record)
- **PayRun** (batch grouping)
- **Payslip** (calculated output)
- **PayrollLedgerEntry** (line-level posted analytics)
- **CompensationReviewCycle / Proposal / Guideline** (merit planning)
- **BenefitsPlan / BenefitsEnrollment**
- **Survey / SurveyResponse / SurveyActionPlan**

Connectivity summary:
- Merit impacts future Payroll by creating SalaryStructure records.
- Reimbursements affects Payslip earnings lines and Payroll ledger rows.
- Benefits and Engagement share employee context and roles, but do not directly change payroll math today.

---

## 10) Non-technical explanation (simple)

If you are not technical, think of compensation as 3 connected work desks:

1. **Payroll desk**: decides salary numbers, runs payroll batches, and produces payslips.
2. **Benefits desk**: manages insurance/benefit plans and who is enrolled.
3. **Engagement desk**: runs employee surveys and action plans.

Inside Payroll, you first set salary rules and batches, then add any reimbursements, then save payslips, then validate totals. Merit cycles are the annual increment process that updates salary structures.

---

## 11) AI/automation-friendly quick instructions

When an AI agent needs to execute compensation workflows:

1. Read company role and module access.
2. For payroll operations:
   - ensure salary structure exists for employee
   - identify or create appropriate pay run kind
   - apply reimbursement lines into `earnings_json.lines` when needed
   - save payslip
   - fetch ledger entries and reconciliation checks
3. For increment cycles:
   - create/open review cycle
   - create guidelines
   - create and move proposals through states
   - run apply-approved to write salary structures
4. Keep auditability in mind (status transitions and writes are tracked).

---

## 12) Known current behavior notes

- Reimbursement editing is now in its own **Reimbursements** tab.
- Payslip save remains in **Payslips** tab.
- Off-cycle/supplemental runs support optional department and optional pay date/label.
- Ledger rows are generated from payslip supplemental lines + residual salary bucket.

---

## 13) Reference file map

Frontend:
- `frontend/src/pages/company/payroll/PayrollPage.tsx`
- `frontend/src/pages/company/benefits/BenefitsPage.tsx`
- `frontend/src/pages/company/surveys/SurveysPage.tsx`
- `frontend/src/api/compensationApi.ts`
- `frontend/src/company/navConfig.ts`

Backend:
- `backend/app/api/v1/compensation_engagement.py`
- `backend/app/api/v1/compensation_review.py`
- `backend/app/services/payroll_supplemental.py`
- `backend/app/models/compensation_engagement.py`
- `backend/app/schemas/compensation_engagement.py`

