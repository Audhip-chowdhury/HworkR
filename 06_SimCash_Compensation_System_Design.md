# SimCash Compensation & Payroll System

## HworkR — Economy & Calculation Engine Design

---

## 1. SimCash Currency

**Symbol:** ₹S (SimCash)  
**Peg:** ₹S 1 = $1 USD equivalent market value  
**Purpose:** Enables realistic payroll practice without real money. All salary structures, deductions, taxes, and settlements use SimCash. The math mirrors real-world Indian payroll — only the currency is simulated.

Every employee-user in the system receives a SimCash salary. Every HR compensation action involves real arithmetic the HR user must perform themselves.

---

## 2. Grade & Salary Band Structure 

TBD when organization defines its structure

---

## 3. CTC Breakdown Structure

The Indian-format CTC structure applied to SimCash:

### 3.1 Component Formulas


| Component            | Formula                                          | Category              |
| -------------------- | ------------------------------------------------ | --------------------- |
| Basic Salary         | 45% of CTC                                       | Earning               |
| HRA                  | 50% of Basic                                     | Earning               |
|                      |                                                  |                       |
| Conveyance Allowance | ₹S 1,600/year (fixed)                            | Earning               |
| Medical Allowance    | ₹S 1,250/year (fixed)                            | Earning               |
| LTA                  | ₹S 2,500/year (fixed)                            | Earning               |
| Special Allowance    | CTC − all other components (balancing figure)    | Earning               |
| Performance Bonus    | Tenant-configurable (default 5–10% of CTC)       | Earning (Variable)    |
| PF – Employer        | 12% of Basic                                     | Employer Contribution |
| ESI – Employer       | 3.25% of Gross (only if Gross ≤ ₹S 1,750/month)  | Employer Contribution |
| Gratuity             | 4.81% of Basic                                   | Employer Contribution |
| PF – Employee        | 12% of Basic                                     | Deduction             |
| ESI – Employee       | 0.75% of Gross (only if Gross ≤ ₹S 1,750/month)  | Deduction             |
| Professional Tax     | ₹S 200/year (₹S 16.67/month, fixed)              | Deduction             |
| TDS                  | 30% flat on taxable income                       | Deduction             |
| Other                | Loan recovery, insurance premium (as applicable) | Deduction             |


### 3.2 Key Calculation Rules

**Gross Salary** = Basic + HRA + Conveyance + Medical + LTA + Special Allowance + Bonus

**CTC** = Gross Salary + Employer PF + Employer ESI + Gratuity

**Taxable Income** = Annual Gross − Employee PF − Professional Tax − Standard Deduction (₹S 4,167/year)

**TDS** = Taxable Income × 30%

**Net Take-Home** = Gross Salary − Employee PF − Employee ESI − Professional Tax − TDS − Other Deductions

### 3.3 Worked Example — G4 Senior Associate at ₹S 80,000 CTC

**Annual Breakdown:**

```
CTC: ₹S 80,000/year

EARNINGS:
  Basic Salary (45% of CTC)         : ₹S 36,000.00/yr   → ₹S 3,000.00/mo
  HRA (50% of Basic)                : ₹S 18,000.00/yr   → ₹S 1,500.00/mo
  DA (5% of Basic)                  : ₹S  1,800.00/yr   → ₹S   150.00/mo(dont need)
  Conveyance Allowance (fixed)      : ₹S  1,600.00/yr   → ₹S   133.33/mo
  Medical Allowance (fixed)         : ₹S  1,250.00/yr   → ₹S   104.17/mo
  LTA (fixed)                       : ₹S  2,500.00/yr   → ₹S   208.33/mo
  Special Allowance (balance)       : ₹S  9,798.40/yr   → ₹S   816.53/mo
  Performance Bonus (variable)      : ₹S  5,000.00/yr   → ₹S   416.67/mo
                                      ─────────────────
  GROSS SALARY                      : ₹S 75,948.40/yr   → ₹S 6,329.03/mo

EMPLOYER CONTRIBUTIONS (part of CTC):
  PF Employer (12% of Basic)        : ₹S  4,320.00/yr   → ₹S   360.00/mo
  ESI Employer                      : ₹S      0.00      (not applicable)
  Gratuity (4.81% of Basic)         : ₹S  1,731.60/yr   → ₹S   144.30/mo
                                      ─────────────────
  TOTAL EMPLOYER COST               : ₹S  6,051.60/yr

  VERIFICATION: Gross + Employer = ₹S 75,948.40 + ₹S 6,051.60 = ₹S 82,000
  Note: ₹S 2,000 variance from ₹S 80,000 CTC is adjusted via
  Special Allowance in actual implementation. The system expects
  HR to balance this correctly.

DEDUCTIONS (from employee gross):
  PF Employee (12% of Basic)        : ₹S  4,320.00/yr   → ₹S   360.00/mo
  ESI Employee                      : ₹S      0.00      (not applicable)
  Professional Tax (fixed)          : ₹S    200.00/yr   → ₹S    16.67/mo
  TDS (30% of taxable)              : ₹S 20,168.52/yr   → ₹S 1,680.71/mo
                                      ─────────────────
  TOTAL DEDUCTIONS                  : ₹S 24,688.52/yr   → ₹S 2,057.38/mo

  TDS CALCULATION:
    Annual Gross                    : ₹S 75,948.40
    Less: Employee PF               : ₹S  4,320.00
    Less: Professional Tax          : ₹S    200.00
    Less: Standard Deduction        : ₹S  4,167.00
                                      ─────────────
    Taxable Income                  : ₹S 67,261.40
    TDS @ 30%                       : ₹S 20,178.42/yr → ₹S 1,681.54/mo

NET TAKE-HOME                       : ₹S 51,259.88/yr   → ₹S 4,271.66/mo
```

---

## 4. Learning Mechanic — "Calculate Then Validate"

The system knows the correct answer but never shows it to the HR user. The HR user must calculate and input every value themselves. The system validates silently, and errors are routed to the Manager (bot).

### 4.1 Flow

```
1. SCENARIO PRESENTED
   System assigns a payroll task to the HR user.
   Example: "Process monthly salary for Priya Sharma (G4, ₹S 80,000 CTC)"

2. HR USER OPENS BLANK CALCULATION FORM
   Every field is empty. No pre-filled values. No formulas shown.
   HR must calculate and enter:
     → Each earning component
     → Gross salary
     → Each deduction
     → Total deductions
     → Net pay

3. HR USER SUBMITS
   System validates every field silently.

4. IF ALL CORRECT:
   → Task marked as "Completed"
   → Score recorded (invisible to HR user)
   → Payslip generated for employee-user
   → Workflow moves forward

5. IF ERRORS FOUND:
   → Task marked as "Needs Review"
   → Manager (bot) receives notification via API:
     {
       "event": "calculation_error",
       "hr_user_id": "uuid",
       "task_id": "uuid",
       "errors": [
         { "field": "DA", "submitted": 180, "expected": 150 },
         { "field": "TDS", "submitted": 1700, "expected": 1681.54 }
       ],
       "error_count": 2,
       "severity": "medium"
     }
   → Manager decides:
     a) Reject → HR sees "Returned by Manager" with feedback
     b) Ask to redo → HR must recalculate and resubmit
     c) Approve with notes → Passes but flagged for learning
   → HR user NEVER sees the correct answer from the system
   → HR user ONLY sees what the Manager communicates

6. HR USER FIXES AND RESUBMITS
   → Repeat until Manager approves
   → Number of attempts tracked in scoring (invisible to HR)
```

### 4.2 What the HR User Sees

**On submission with errors:**

```
┌──────────────────────────────────────────────────┐
│  ⚠️  RETURNED BY MANAGER                        │
│                                                  │
│  Task: Monthly Payroll — Priya Sharma            │
│  Status: Needs Correction                        │
│                                                  │
│  Manager Feedback:                               │
│  "Two calculation errors found. Review your DA   │
│   formula and TDS computation. Refer to the      │
│   payroll documentation section 3.1."            │
│                                                  │
│  [Open Task]  [Message Manager]                  │
└──────────────────────────────────────────────────┘
```

HR manager service has a bot already made.

**What the HR user does NOT see:**

- Which specific value was wrong
- What the correct value should be
- Their score
- How many attempts they've used

The only help channel is: **peers, Manager (bot), and documentation.**

---

## 5. Payroll Scenarios

### 5.1 Standard Monthly Payroll

HR processes salary for all active employees. Each employee is a separate calculation. The payroll workbench shows the full employee roster and HR works through them one by one.

```
PAYROLL WORKBENCH:
  → List of all employees in tenant
  → Each row shows: Name, Grade, Status, Calculation Status
  → Status values: Pending | In Progress | Submitted | 
                    Approved | Returned | Completed
  → HR clicks each employee to open blank calculation form
  → Must complete all employees before submitting the pay run
```

### 5.2 Mid-Month Joiner (Pro-Rata)

**Scenario:** Employee joins on the 15th of a 30-day month.

**What HR must calculate:**

```
Pro-rata factor = Working days / Total days in month
                = 16 / 30 = 0.5333

Each earning component × pro-rata factor:
  Basic: ₹S 3,000 × 0.5333 = ₹S 1,600.00
  HRA:   ₹S 1,500 × 0.5333 = ₹S  800.00
  ... (every component)

Deductions also pro-rated:
  PF:    ₹S 360 × 0.5333 = ₹S 192.00
  PT:    Full month (₹S 16.67) — PT is not pro-rated
  TDS:   Recalculated on pro-rated gross

Net Pay = Pro-rated Gross − Pro-rated Deductions
```

### 5.3 Leave Without Pay (LWP) Deduction

**Scenario:** Employee took 3 days LWP in a 30-day month.

**What HR must calculate:**

```
LWP deduction per day = Monthly Gross / Total days in month
                      = ₹S 6,329.03 / 30 = ₹S 210.97/day

Total LWP deduction = ₹S 210.97 × 3 = ₹S 632.90

Adjusted Gross = ₹S 6,329.03 − ₹S 632.90 = ₹S 5,696.13

All deductions recalculated on adjusted gross:
  PF: 12% of adjusted Basic (also reduced proportionally)
  TDS: Recalculated on new taxable
  PT: Unchanged (fixed)
```

### 5.4 Arrears (Backdated Salary Revision)

**Scenario:** Employee promoted from G3 to G4 effective 3 months ago. Salary revision processed now.

**What HR must calculate:**

```
Old CTC: ₹S 65,000 → Old monthly gross: ₹S X
New CTC: ₹S 80,000 → New monthly gross: ₹S Y

Monthly difference = Y − X

Arrears = Monthly difference × 3 (backdated months)

Current month payslip:
  Regular salary (new CTC) + Arrears (lump sum)
  
Deductions on arrears:
  PF on arrears: 12% of (new Basic − old Basic) × 3 months
  TDS on arrears: 30% of taxable arrears
```

### 5.5 Quarterly Bonus Payout

**Scenario:** Q1 bonus payout for eligible employees (G5 and above).

**What HR must calculate:**

```
Bonus pool assigned by tenant admin (e.g., ₹S 50,000)

For each eligible employee:
  Bonus = (Individual performance score / Sum of all scores) × Pool
  
  OR fixed % of CTC (tenant-configurable):
  Bonus = CTC × bonus % × (days worked in quarter / total quarter days)

Deductions on bonus:
  PF: Not applicable on bonus
  TDS: 30% flat on bonus amount
  
Net bonus = Bonus − TDS
```

### 5.6 Full & Final Settlement

**Scenario:** Employee resigns. Last working day processed. Calculate F&F.

**What HR must calculate:**

```
COMPONENT 1 — Salary for worked days
  Days worked in final month / total days × monthly gross

COMPONENT 2 — Leave encashment
  Unused leave balance (from HR Ops module data)
  Per day value = Basic / 30
  Leave encashment = Per day value × unused days

COMPONENT 3 — Gratuity (if tenure ≥ 5 years)
  Gratuity = (Basic + DA) × 15 / 26 × years of service
  (If tenure < 5 years, gratuity = ₹S 0)

COMPONENT 4 — Notice period
  If not served: Recovery = Monthly Gross × notice period months
  If served: No recovery

COMPONENT 5 — Pending reimbursements
  Any approved but unpaid reimbursements

COMPONENT 6 — Loan recovery
  Outstanding loan balance deducted in full

F&F TOTAL:
  = Salary (worked days)
  + Leave encashment
  + Gratuity
  − Notice period recovery (if applicable)
  + Pending reimbursements
  − Loan recovery
  − PF on applicable components
  − TDS on total F&F

HR must calculate every line item and submit.
Manager (bot) validates the complete settlement.
```

### 5.7 Salary Advance & Loan Recovery

**Scenario:** Employee requested salary advance of ₹S 3,000 to be recovered over 6 months.

**What HR must set up:**

```
Advance amount: ₹S 3,000
Recovery period: 6 months
Monthly EMI: ₹S 3,000 / 6 = ₹S 500/month

Each month's payroll:
  Add ₹S 500 under "Other Deductions — Loan Recovery"
  Track remaining balance: ₹S 3,000 → 2,500 → 2,000 → ...
  
If employee exits before full recovery:
  Remaining balance deducted in F&F
```

### 5.8 Reimbursement Processing

**Scenario:** Employee submits travel reimbursement claim of ₹S 450.

**What HR must process:**

```
Verify claim against policy limits
  → Travel reimbursement cap: ₹S 500/quarter (tenant-configurable)
  → Employee has used ₹S 0 this quarter
  → Claim of ₹S 450 is within limit → Approve

Add to payslip:
  Reimbursement (non-taxable): ₹S 450
  → Does NOT affect PF, TDS, or other deductions
  → Added to net pay directly

If claim exceeds limit:
  → Partial approval or rejection
  → Route to Manager for decision
```

### 5.9 Annual Increment Cycle

**Scenario:** Annual appraisal complete. Tenant admin allocates 10% of total payroll as increment pool. HR must distribute across all employees.

**What HR must calculate:**

```
Total current annual payroll: ₹S 1,200,000 (example, 20 employees)
Increment pool: 10% = ₹S 120,000

For each employee:
  Consider:
    → Performance rating (from L&D module)
    → Current position in salary band (min/mid/max)
    → Tenure
    → Market adjustment needs
  
  Calculate individual increment:
    → High performer at band minimum → larger increment
    → Average performer near band max → smaller increment
    → No increment if already at band max
  
  Verify:
    → New CTC within grade band limits
    → Sum of all increments ≤ pool budget
    → No employee below band minimum after revision

  Output:
    → New CTC per employee
    → Complete new salary breakdown
    → Effective date
    → Arrears if backdated

This is the most complex scenario — tests budget management,
fairness, band compliance, and calculation accuracy simultaneously.
```

---

## 6. Payroll Cycle Timeline

The system simulates a monthly payroll cycle:

```
MONTHLY CYCLE:

Day 1-5:     INPUTS ARRIVE
              → Attendance data finalized (from HR Ops)
              → New joiners this month confirmed
              → Exits and F&F cases identified
              → Reimbursement claims submitted
              → Loan recovery schedules active
              → Any salary revisions effective this month

Day 5-10:    HR REVIEWS INPUTS
              → Verify attendance data completeness
              → Confirm LWP days
              → Check for any special cases (arrears, bonus)
              → Flag missing data to HR Ops via texting app

Day 10-20:   HR PROCESSES PAYROLL
              → Open payroll workbench
              → Calculate each employee's salary
              → Handle all exceptions (pro-rata, LWP, arrears, F&F)
              → Submit completed pay run

Day 20-22:   MANAGER REVIEW
              → Manager (bot) validates all calculations
              → Returns errors for correction
              → Approves clean submissions

Day 22-25:   PAYSLIPS PUBLISHED
              → Employee-users can view their SimCash payslips
              → Dispute window opens (employees can raise issues)

Day 25-30:   COMPLIANCE & CLOSE
              → PF challan summary generated
              → PT return summary generated
              → TDS summary generated
              → Month closed
              → Scoring recorded (invisible to HR user)
```

---

## 7. Payroll Workbench UI

### 7.1 Main View

```
┌──────────────────────────────────────────────────────────────┐
│  💰 PAYROLL WORKBENCH — March 2026                          │
│                                                              │
│  Pay Period: 1 Mar – 31 Mar    Deadline: Day 20 (8 days)    │
│  Employees: 24                 Processed: 0/24               │
│  Status: NOT STARTED                                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Employee         │ Grade │ Type       │ Status         │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Priya Sharma     │ G4    │ Regular    │ ⏳ Pending     │  │
│  │ Rahul Verma      │ G3    │ Regular    │ ⏳ Pending     │  │
│  │ Anita Desai      │ G5    │ LWP (2d)  │ ⏳ Pending     │  │
│  │ Vikram Singh     │ G4    │ Arrears    │ ⏳ Pending     │  │
│  │ Meera Nair       │ G2    │ New Join   │ ⏳ Pending     │  │
│  │                  │       │ (15th)     │                │  │
│  │ Deepak Joshi     │ G6    │ F&F        │ ⏳ Pending     │  │
│  │ Kavita Reddy     │ G3    │ Regular    │ ⏳ Pending     │  │
│  │ Arjun Mehta      │ G5    │ Bonus Q1   │ ⏳ Pending     │  │
│  │ ... (16 more)    │       │            │                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  This Month's Exceptions:                                    │
│  📌 1 mid-month joiner (pro-rata required)                  │
│  📌 1 employee with 2 days LWP                              │
│  📌 1 salary revision with 3 months arrears                 │
│  📌 1 F&F settlement                                        │
│  📌 Q1 bonus payout for G5+ employees                       │
│                                                              │
│  [Start Processing]                                          │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Individual Calculation Form

```
┌──────────────────────────────────────────────────────────────┐
│  SALARY CALCULATION — Priya Sharma                           │
│  Grade: G4  |  CTC: ₹S 80,000/yr  |  Status: Active        │
│  Days in Month: 30  |  Days Worked: 30  |  LWP: 0           │
│                                                              │
│  EARNINGS                              YOUR INPUT            │
│  ───────────────────────────────────────────────             │
│  Basic Salary                          [          ]  /month  │
│  HRA                                   [          ]  /month  │
│  Dearness Allowance                    [          ]  /month  │
│  Conveyance Allowance                  [          ]  /month  │
│  Medical Allowance                     [          ]  /month  │
│  LTA                                   [          ]  /month  │
│  Special Allowance                     [          ]  /month  │
│  Performance Bonus                     [          ]  /month  │
│  ───────────────────────────────────────────────             │
│  GROSS SALARY                          [          ]  /month  │
│                                                              │
│  DEDUCTIONS                            YOUR INPUT            │
│  ───────────────────────────────────────────────             │
│  PF (Employee)                         [          ]  /month  │
│  ESI (Employee)                        [          ]  /month  │
│  Professional Tax                      [          ]  /month  │
│  TDS                                   [          ]  /month  │
│  Loan Recovery                         [          ]  /month  │
│  Other Deductions                      [          ]  /month  │
│  ───────────────────────────────────────────────             │
│  TOTAL DEDUCTIONS                      [          ]  /month  │
│                                                              │
│  ═══════════════════════════════════════════════             │
│  NET PAY                               [          ]  /month  │
│                                                              │
│  [Submit for Review]                     [Save Draft]        │
└──────────────────────────────────────────────────────────────┘
```

**No hints. No formulas. No help button. Just the blank form and the employee's CTC.**

---

## 8. Error Handling Flow

```
HR submits calculation
        │
        ▼
  System validates silently
        │
   ┌────┴────┐
   │         │
CORRECT    ERRORS FOUND
   │         │
   ▼         ▼
Task      Manager (bot) receives notification:
marked     {
"Done"       event: "calculation_error",
   │         hr_user_id: "uuid",
   │         task_id: "uuid",
   │         employee_name: "Priya Sharma",
   │         error_count: 2,
   │         error_fields: ["DA", "TDS"],
   │         severity: "medium",
   │         attempt_number: 1
   │       }
   │         │
   │         ▼
   │    Manager decides:
   │    ┌─────────────────────────────────┐
   │    │ a) REJECT                       │
   │    │    → "Recalculate DA and TDS.   │
   │    │       Review section 3.1 of     │
   │    │       the payroll docs."        │
   │    │                                 │
   │    │ b) REDO                         │
   │    │    → "Multiple errors found.    │
   │    │       Please redo entire        │
   │    │       calculation."             │
   │    │                                 │
   │    │ c) APPROVE WITH NOTES           │
   │    │    → "Minor rounding diff.      │
   │    │       Approved. Be careful      │
   │    │       with decimal handling."   │
   │    └─────────────────────────────────┘
   │         │
   │         ▼
   │    HR user sees:
   │    "Returned by Manager" + feedback text
   │    HR corrects and resubmits
   │    (cycle repeats until approved)
   │
   ▼
Score recorded
(INVISIBLE to HR user — only Manager and Admin see it)
```

---

## 9. Scoring Model (Invisible to HR User)

Scores are tracked silently. HR user only sees their score at certification review.

### 9.1 Scoring Dimensions


| Dimension         | Weight | What It Measures                                       |
| ----------------- | ------ | ------------------------------------------------------ |
| Completeness      | 25%    | All fields filled, no blanks left                      |
| Accuracy          | 30%    | Mathematical correctness of every field                |
| Timeliness        | 20%    | Processed within payroll cycle deadline                |
| Process Adherence | 25%    | Followed correct workflow, handled exceptions properly |


### 9.2 Accuracy Scoring Detail

```
Per employee calculation:

  Total fields to calculate: ~15 (earnings + deductions + net)
  
  Each field scored:
    EXACT MATCH (within ₹S 1 tolerance): 100%
    CLOSE (within 2% variance):           75%
    WRONG (> 2% variance):                0%
  
  Field accuracy = sum of field scores / total fields

  Attempt penalty:
    1st attempt: no penalty
    2nd attempt: −10% on accuracy score
    3rd attempt: −25% on accuracy score
    4+ attempts: −50% on accuracy score

  Scenario complexity bonus:
    Regular payroll:   1.0x multiplier
    Pro-rata:          1.2x multiplier
    LWP:               1.2x multiplier
    Arrears:           1.5x multiplier
    F&F:               2.0x multiplier
    Increment cycle:   2.0x multiplier
```

### 9.3 What Manager (Bot) and Admin See

```
HR USER SCORECARD (Admin/Manager view only):

  User: Compensation Specialist — Ravi K.
  Tenant: TechCo Solutions
  
  Monthly Summary — March 2026:
    Employees processed: 24/24
    First-attempt accuracy: 78%
    Average attempts per employee: 1.6
    Payroll submitted: Day 18 (within deadline)
    
    Breakdown:
      Regular (18 employees):    92% accuracy
      Pro-rata (1 employee):     65% accuracy — 3 attempts
      LWP (2 employees):         80% accuracy
      Arrears (1 employee):      50% accuracy — 4 attempts
      F&F (1 employee):          70% accuracy — 2 attempts
      Bonus (1 employee):        85% accuracy
    
    Composite Score: 79/100
    
    Weak Areas:
      → Pro-rata calculation (consistently struggles)
      → Arrears backdating (PF on arrears missed twice)
    
    Trend: Improving (last month was 71/100)
```

---

## 10. SimCash Economy Rules

### 10.1 Company Budget

Each tenant gets a simulated company budget:

```
Company Budget = Sum of all employee CTCs × 1.15
  (15% buffer for bonuses, increments, reimbursements)

Example: 20 employees, avg CTC ₹S 80,000
  Budget = 20 × 80,000 × 1.15 = ₹S 1,840,000/year
  Monthly budget = ₹S 153,333

Payroll run debits from budget.
If payroll exceeds monthly budget → exception flagged.
Budget replenishes quarterly (simulated revenue).
```

### 10.2 Employee Interaction with SimCash

Employee-users see and interact with:


| Feature             | Description                                              |
| ------------------- | -------------------------------------------------------- |
| CTC Offer           | During recruitment, sees offered CTC in SimCash          |
| Monthly Payslip     | Full breakdown — earnings, deductions, net pay           |
| Benefits Enrollment | Choose plans that deduct from salary                     |
| Dispute             | Can raise a dispute if they believe calculation is wrong |


Employee-users do NOT see:

- HR user's score
- Whether HR got the calculation right on first attempt
- The internal scoring mechanics

### 10.3 Disputes as Learning Scenarios

```
When employee-user raises a dispute:

  Employee: "My LWP deduction seems too high for 1 day"
  
  → Compensation specialist receives the dispute
  → Must review their own calculation
  → If HR made an error: correct and reprocess
  → If employee is wrong: explain with breakdown via texting app
  → Manager (bot) monitors resolution quality
  
  This teaches:
    → Self-auditing
    → Employee communication
    → Error correction workflow
    → Documentation of changes
```

---

## 11. Certification Criteria — Compensation Track

Single path from noob to expert. No levels, just a continuous journey.

### 11.1 Required Actions for Certification

```
MINIMUM REQUIREMENTS (must complete ALL):

  □ Process 6 full monthly payroll cycles (complete roster)
  □ Handle at least 3 mid-month joiner calculations
  □ Handle at least 5 LWP deduction calculations
  □ Handle at least 2 arrears calculations
  □ Process at least 2 quarterly bonus payouts
  □ Complete at least 2 F&F settlements
  □ Process at least 3 reimbursement claims
  □ Manage at least 1 salary advance with recovery schedule
  □ Complete 1 annual increment cycle (full roster)
  □ Resolve at least 3 employee disputes
  □ Generate monthly compliance summaries for 6 months
```

### 11.2 Certification Review

```
After completing all required actions:

  1. Manager (bot) and Admin review full scorecard
  2. Composite score calculated across all months
  3. Weak areas identified
  4. Certification decision:
  
     CERTIFIED:
       → Average composite score ≥ 75/100
       → No critical failures (e.g., zero payroll errors 
         that went uncorrected for 2+ cycles)
       → All required actions completed
       
     NOT YET CERTIFIED:
       → Score below threshold
       → OR missing required actions
       → HR user continues practicing
       → Re-review after next cycle

  5. HR user sees their score FOR THE FIRST TIME
     at certification review — full breakdown, 
     trends over time, strong/weak areas

  6. Certificate issued with:
     → Name, role, tenant
     → Composite score
     → Months of practice
     → Actions completed count
     → Verification ID
```

---

## 13. Database Tables — Compensation Specific

```sql
-- SALARY STRUCTURES
salary_structures (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  ctc_annual DECIMAL(12,2),
  components JSONB,
  -- components: { basic, hra, da, conveyance, medical, 
  --   lta, special_allowance, bonus, employer_pf, 
  --   employer_esi, gratuity }
  effective_from DATE,
  effective_to DATE,
  created_by UUID,
  created_at TIMESTAMP
);

-- GRADE BANDS
grade_bands (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  grade_code VARCHAR(10),
  grade_name VARCHAR(100),
  min_ctc DECIMAL(12,2),
  mid_ctc DECIMAL(12,2),
  max_ctc DECIMAL(12,2),
  config JSONB
  -- config: { basic_pct, hra_pct, da_pct, 
  --   fixed_allowances, bonus_pct }
);

-- PAY RUNS
pay_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  month INTEGER,
  year INTEGER,
  status VARCHAR(20),
  -- status: draft | in_progress | submitted | 
  --   under_review | approved | published
  employee_count INTEGER,
  total_gross DECIMAL(14,2),
  total_deductions DECIMAL(14,2),
  total_net DECIMAL(14,2),
  processed_by UUID,
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  published_at TIMESTAMP
);

-- PAYSLIPS (HR user's submitted calculation)
payslips (
  id UUID PRIMARY KEY,
  pay_run_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  salary_structure_id UUID,
  days_in_month INTEGER,
  days_worked INTEGER,
  lwp_days INTEGER DEFAULT 0,
  
  -- HR user's submitted values
  submitted_basic DECIMAL(10,2),
  submitted_hra DECIMAL(10,2),
  submitted_da DECIMAL(10,2),
  submitted_conveyance DECIMAL(10,2),
  submitted_medical DECIMAL(10,2),
  submitted_lta DECIMAL(10,2),
  submitted_special DECIMAL(10,2),
  submitted_bonus DECIMAL(10,2),
  submitted_gross DECIMAL(10,2),
  submitted_pf_employee DECIMAL(10,2),
  submitted_esi_employee DECIMAL(10,2),
  submitted_pt DECIMAL(10,2),
  submitted_tds DECIMAL(10,2),
  submitted_loan_recovery DECIMAL(10,2),
  submitted_other_deductions DECIMAL(10,2),
  submitted_reimbursements DECIMAL(10,2),
  submitted_arrears DECIMAL(10,2),
  submitted_total_deductions DECIMAL(10,2),
  submitted_net_pay DECIMAL(10,2),
  
  -- System's calculated values (NEVER shown to HR user)
  system_basic DECIMAL(10,2),
  system_hra DECIMAL(10,2),
  system_da DECIMAL(10,2),
  system_conveyance DECIMAL(10,2),
  system_medical DECIMAL(10,2),
  system_lta DECIMAL(10,2),
  system_special DECIMAL(10,2),
  system_bonus DECIMAL(10,2),
  system_gross DECIMAL(10,2),
  system_pf_employee DECIMAL(10,2),
  system_esi_employee DECIMAL(10,2),
  system_pt DECIMAL(10,2),
  system_tds DECIMAL(10,2),
  system_total_deductions DECIMAL(10,2),
  system_net_pay DECIMAL(10,2),
  
  -- Validation
  is_correct BOOLEAN,
  error_fields JSONB,
  -- error_fields: [{ field, submitted, expected, variance_pct }]
  attempt_number INTEGER DEFAULT 1,
  
  -- Status
  status VARCHAR(20),
  -- status: draft | submitted | returned | approved | published
  manager_feedback TEXT,
  
  created_at TIMESTAMP,
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP
);

-- SALARY ADVANCES & LOANS
salary_advances (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  amount DECIMAL(10,2),
  recovery_months INTEGER,
  monthly_emi DECIMAL(10,2),
  remaining_balance DECIMAL(10,2),
  status VARCHAR(20),
  started_at DATE,
  completed_at DATE
);

-- REIMBURSEMENT CLAIMS
reimbursement_claims (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  type VARCHAR(50),
  amount DECIMAL(10,2),
  approved_amount DECIMAL(10,2),
  status VARCHAR(20),
  processed_by UUID,
  pay_run_id UUID,
  submitted_at TIMESTAMP,
  processed_at TIMESTAMP
);

-- F&F SETTLEMENTS
fnf_settlements (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  last_working_date DATE,
  
  submitted_salary_days DECIMAL(10,2),
  submitted_leave_encashment DECIMAL(10,2),
  submitted_gratuity DECIMAL(10,2),
  submitted_notice_recovery DECIMAL(10,2),
  submitted_reimbursements DECIMAL(10,2),
  submitted_loan_recovery DECIMAL(10,2),
  submitted_pf DECIMAL(10,2),
  submitted_tds DECIMAL(10,2),
  submitted_net_settlement DECIMAL(10,2),
  
  system_salary_days DECIMAL(10,2),
  system_leave_encashment DECIMAL(10,2),
  system_gratuity DECIMAL(10,2),
  system_notice_recovery DECIMAL(10,2),
  system_reimbursements DECIMAL(10,2),
  system_loan_recovery DECIMAL(10,2),
  system_pf DECIMAL(10,2),
  system_tds DECIMAL(10,2),
  system_net_settlement DECIMAL(10,2),
  
  is_correct BOOLEAN,
  error_fields JSONB,
  attempt_number INTEGER DEFAULT 1,
  status VARCHAR(20),
  manager_feedback TEXT,
  
  created_at TIMESTAMP,
  submitted_at TIMESTAMP
);

-- COMPANY BUDGET
company_budgets (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  year INTEGER,
  quarter INTEGER,
  total_budget DECIMAL(14,2),
  used_budget DECIMAL(14,2),
  remaining_budget DECIMAL(14,2)
);

-- INCREMENT CYCLES
increment_cycles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  year INTEGER,
  pool_amount DECIMAL(14,2),
  pool_used DECIMAL(14,2),
  status VARCHAR(20),
  created_by UUID,
  created_at TIMESTAMP
);

increment_decisions (
  id UUID PRIMARY KEY,
  cycle_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  old_ctc DECIMAL(12,2),
  submitted_new_ctc DECIMAL(12,2),
  system_validated BOOLEAN,
  within_band BOOLEAN,
  increment_amount DECIMAL(10,2),
  increment_pct DECIMAL(5,2),
  justification TEXT,
  status VARCHAR(20),
  attempt_number INTEGER DEFAULT 1
);

-- DISPUTES
payroll_disputes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  payslip_id UUID,
  reason TEXT,
  status VARCHAR(20),
  -- status: open | under_review | resolved | closed
  resolved_by UUID,
  resolution TEXT,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP
);
```

---

*Document version: 1.0*  
*Module: SimCash Compensation & Payroll System*  
*Parent: HworkR — HR Training & Certification Platform*