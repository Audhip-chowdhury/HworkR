# HworkR — HR Training & Certification Platform

## System Design Document v1.0

---

## 1. Product Vision

**HworkR** is a multi-company HR training platform where HR professionals learn by doing real HR work inside a Workday-inspired environment. Employee-role users simulate a living workforce, while HR-role users practice modules relevant to their specialization. Every HR action is tracked, scored, and contributes toward certification.

**Core Idea:** HR users don't study Workday — they *use* HworkR the way they'd use Workday in a real company, with real employee interactions happening around them.

---

## 2. Platform Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   HworkR Platform                   │
│                  (Multi-company SaaS)                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Company A │  │ Company B │  │ Company C │  ...    │
│  │ (company)  │  │ (company)  │  │ (company)  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                     │
│  Each company has:                                   │
│  • Its own org structure                            │
│  • Its own employee pool                            │
│  • Its own HR team practicing                       │
│  • Its own scoring & certification track            │
│                                                     │
├─────────────────────────────────────────────────────┤
│              Shared Platform Services                │
│  • Auth & SSO  • Activity Tracker  • Cert Engine    │
│  • Module Registry  • company Config  • API Gateway  │
└─────────────────────────────────────────────────────┘
```

---

## 3. User Roles & Access Matrix

### 3.1 Role Types


| Role                                                | Type            | Purpose                                                                                               |
| --------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| **Platform Admin**                                  | System          | Manages companys, global config, certification criteria                                               |
| **company Admin**                                   | Org             | Sets up company org structure, assigns HR roles, manages employee pool                                |
| **Talent Acquisition Specialist**                   | HR Practitioner | Practices recruitment module                                                                          |
| **HR Operations & Compliance Specialist**           | HR Practitioner | Practices employee records, leave, attendance, compliance                                             |
| **L&D & Performance Management Specialist**         | HR Practitioner | Practices performance reviews, goal setting, training management                                      |
| **Compensation, Engagement & Analytics Specialist** | HR Practitioner | Practices payroll, benefits, engagement surveys, reporting                                            |
| **Employee**                                        | Simulated User  | Acts as the workforce — applies for jobs, requests leave, submits timesheets, participates in reviews |


### 3.2 Module Access by HR Role


| Module                  | Talent Acq. | HR Ops      | L&D & Perf. | Comp & Analytics |
| ----------------------- | ----------- | ----------- | ----------- | ---------------- |
| Recruitment & ATS       | ✅ Full      | 👁 View     | ❌           | ❌                |
| Employee Records        | 👁 View     | ✅ Full      | 👁 View     | 👁 View          |
| Leave & Attendance      | ❌           | ✅ Full      | ❌           | 👁 View          |
| Performance Management  | ❌           | ❌           | ✅ Full      | 👁 View          |
| L&D / Training Tracking | ❌           | ❌           | ✅ Full      | ❌                |
| Payroll & Benefits      | ❌           | ❌           | ❌           | ✅ Full           |
| Analytics & Reporting   | 👁 Own data | 👁 Own data | 👁 Own data | ✅ Full           |
| Engagement / Surveys    | ❌           | ❌           | ❌           | ✅ Full           |
| Compliance & Audit      | ❌           | ✅ Full      | ❌           | 👁 View          |


---

## 4. Multi-company Architecture

### 4.1 company Isolation Strategy

Each company (company) operates in complete isolation:

```
Database Strategy: Shared database, company-scoped tables

Every table includes:
  company_id UUID NOT NULL  →  references companys(id)

Row-Level Security (RLS) enforced at database level:
  CREATE POLICY company_isolation ON employees
    USING (company_id = current_setting('app.current_company')::uuid);
```

### 4.2 company Onboarding Flow

```
1. Platform Admin creates company
   → company_id generated
   → company Admin account created

2. company Admin configures:
   → Company name, logo, industry
   → Org structure (departments, levels, locations)
   → Job catalog (job families, titles, grades)
   → HR roles assignment (which user practices which module)
   → Employee pool setup (invite real users or seed with sample data)

3. company goes "Live"
   → Employee users can start interacting
   → HR users start practicing against live data
   → Activity tracker begins recording
```

### 4.3 Org Structure Flexibility

Since every company has different structures, the org model must be fully configurable per company:

```
company Config allows:
  • Custom department hierarchy (unlimited depth)
  • Custom job levels/grades
  • Custom locations (offices, remote, hybrid)
  • Custom pay structures (India-specific: Basic/HRA/DA or global)
  • Custom leave policies (types, accruals, holidays per location)
  • Custom approval chains (1-level, 2-level, skip-level)
  • Custom review cycles (quarterly, biannual, annual)
```

---

## 5. Module Design — Detailed Specifications

### 5.1 Recruitment & ATS (Talent Acquisition Specialist)

**What the HR user practices:**

```
WORKFLOW: End-to-end recruitment lifecycle

Step 1: Job Requisition
  HR creates requisition → selects department, job profile, headcount
  → Sets hiring criteria (skills, experience, education)
  → Submits for approval (goes to company Admin or skip if configured)
  → Activity tracked: requisition creation quality, completeness

Step 2: Job Posting
  HR publishes job → internal board + external (simulated)
  → Writes job description (scored on completeness)
  → Sets application deadline
  → Activity tracked: time to post after approval

  //integrate with naukri

Step 3: Applicant Tracking Pipeline
  Employee-users "apply" for open positions
  HR reviews applications in pipeline view:

  Applied → Screened → Phone Screen → Interview → Assessment → Offer → Hired
     ↓         ↓           ↓            ↓          ↓         ↓
   Rejected  Rejected   Rejected    Rejected   Rejected  Declined

  HR moves candidates through stages
  → Activity tracked: screening time, rejection reason quality,
     pipeline velocity, candidate communication timeliness
//activity tracking , integration
Step 4: Interview Management
  HR schedules interviews (date, panel, format)
  → Collects feedback from "interviewers" (simulated or other users)
  → Compiles scorecards
  → Activity tracked: scheduling efficiency, feedback collection rate
//calendar on screen
Step 5: Offer Management
  HR generates offer letter → selects compensation package
  → Sends to candidate (employee-user receives it)
  → Tracks acceptance/negotiation/decline
  → Activity tracked: offer turnaround time, comp alignment
//role management , offer letter pdf , accept to denies
Step 6: Handoff to Onboarding
  Once accepted → triggers onboarding checklist
  → HR Ops specialist picks it up from here
  → Activity tracked: clean handoff, no data gaps
```
//left
**Candidate Portal (Employee-User Side- we have dedicated webpage will intigate to this ):**

```
Employee users see:
  • Open positions board (filtered by their profile)
  • Application form with resume upload
  • Application status tracker
  • Interview schedule & notifications
  • Offer letter view & accept/decline/negotiate


```

---

### 5.2 Employee Records & Compliance (HR Operations Specialist)

**What the HR user practices:**

```
WORKFLOW: Employee lifecycle management

Employee Profile Management:
  • Create/update employee records
  • Personal info (name, contact, emergency contacts, documents)
  • Job info (title, department, manager, location, start date)
  • Employment history tracking
  • Document management (ID proofs, contracts, offer letters)
  → Activity tracked: data accuracy, completeness score,
     update timeliness

Lifecycle Events:
  • Onboarding checklist management (from Talent Acq handoff)
    - IT setup task, compliance docs, buddy assignment
    - Policy acknowledgment tracking
  • Transfers (department/location/manager changes)
  • Promotions (title + level + comp change workflow)
  • Terminations (exit checklist, asset return, access revocation)
  • Rehires
  → Activity tracked: lifecycle event processing time,
     checklist completion rate, compliance adherence

Leave & Attendance Management:
  • Configure leave policies per company
    - Leave types: Casual, Sick, Earned, Unpaid, 
      Maternity/Paternity, Comp-off, Bereavement
    - Accrual rules (monthly/annual/front-loaded)
    - Carry-forward limits
  • Holiday calendar management (location-specific)
  • Employee leave requests → HR/Manager approval workflow
  • Leave balance tracking & reports
  • Attendance tracking (clock in/out or timesheet-based)
  → Activity tracked: approval response time, policy
     compliance, exception handling quality

Compliance & Audit:
  • Audit trail viewer (who changed what, when)
  • Policy document management & acknowledgment tracking
  • Compliance checklist (document expiry alerts, mandatory training)
  • Data accuracy audits (scheduled checks)
  → Activity tracked: audit response time, compliance gap
     identification, remediation speed
```

---

### 5.3 Performance Management & L&D (L&D Specialist)

**What the HR user practices:**

```
WORKFLOW: Performance & development lifecycle

Goal Setting & OKRs:
  • Create review cycles (quarterly/biannual/annual)
  • Define goal templates per department/role
  • Assign goals to employees
  • Track goal progress (employee updates, manager check-ins)
  → Activity tracked: cycle setup timeliness, goal quality
     (SMART criteria check), coverage rate

Performance Reviews:
  • Self-assessment collection from employees
  • Manager assessment facilitation
  • 360-degree feedback setup (peer nominations, collection)
  • Rating calibration sessions
  • Review documentation:notification to employee
  • Performance Improvement Plans (PIPs) for underperformers: worst rating threshold
  //who has filled and who hasnt
  → Activity tracked: review cycle completion rate, on-time
     submission %, feedback quality, calibration participation

Learning & Development:
  • Course catalog management (create, categorize, set prerequisites)
  • Training assignment (mandatory compliance vs optional upskilling)
  • Track completions, scores, certifications
  • Skill gap analysis (compare required vs actual skills per role)
  • Learning path creation (role-based progression tracks)
  → Activity tracked: catalog freshness, assignment accuracy,
     completion follow-up rate, gap identification quality

Employee Development:
  • Career path planning facilitation : display org tree
  • Succession planning for key positions : sort by rating
  • Talent pool identification (high-potential tracking)
  • Mentorship program management
  → Activity tracked: development plan creation rate,
     succession pipeline coverage
```

---

### 5.4 Payroll, Benefits & Analytics (Compensation Specialist)

**What the HR user practices:**

```
WORKFLOW: Compensation & engagement lifecycle

Salary Structure Management:
  • Define pay structures per company
    - India mode: Basic + HRA + DA + Special Allowance + Conveyance
    - Global mode: Base + Variable + Bonus
  • Grade/band-based salary ranges
  • Compensation revision cycles (annual increment planning)
  → Activity tracked: structure accuracy, market alignment

Payroll Processing:
  • Monthly pay run execution
    - Attendance data integration (from HR Ops module)
    - Leave deductions calculation
    - Tax computation (TDS, PF, ESI, Professional Tax — India)
    - Reimbursement processing
  • Payslip generation (viewable by employee users)
  • Payroll exception handling (arrears, corrections, reversals)
  • Statutory compliance reports
  → Activity tracked: pay run accuracy, exception handling
     speed, compliance report timeliness

Benefits Administration:
  • Benefits plan setup (health, dental, retirement, flex)
  • Open enrollment period management
  • Employee enrollment tracking
  • Dependent management
  • Benefits cost analysis
  → Activity tracked: enrollment coverage, plan accuracy,
     communication timeliness

Engagement & Surveys:
  • Pulse survey creation & distribution
  • Response collection & analysis
  • Action plan creation based on results
  • Employee satisfaction tracking over time
  → Activity tracked: survey frequency, response rate,
     action plan follow-through

Analytics & Reporting:
  • Pre-built dashboards:
    - Headcount by department/location/grade
    - Attrition rate & trends
    - Diversity & inclusion metrics
    - Cost-per-hire, time-to-fill (from recruitment data)
    - Leave utilization patterns
    - Training completion rates
    - Payroll cost breakdown
  • Custom report builder
  • Data export capability
  → Activity tracked: report creation quality, insight
     generation, data-driven recommendation quality
```

---

## 6. Activity Tracking & Scoring Engine

This is the core differentiator — every HR action is tracked, timed, and scored.

### 6.1 Tracker Architecture

```
┌──────────────────────────────────────────────────┐
│              Activity Tracking Engine              │
├──────────────────────────────────────────────────┤
│                                                  │
│  Every HR user action generates an ActivityLog:  │
│                                                  │
│  {                                               │
│    id: uuid                                      │
│    company_id: uuid                               │
│    user_id: uuid (HR practitioner)               │
│    role: "talent_acquisition" | "hr_ops" | ...   │
│    module: "recruitment" | "leave" | ...          │
│    action_type: "create" | "approve" | "update"  │
│    action_detail: "created_requisition"           │
│    entity_type: "requisition" | "employee" | ...  │
│    entity_id: uuid                               │
│    started_at: timestamp                         │
│    completed_at: timestamp                       │
│    duration_seconds: int                         │
│    quality_score: float (0-100)                  │
│    quality_factors: jsonb {                       │
│      completeness: 90,                           │
│      accuracy: 85,                               │
│      timeliness: 100,                            │
│      process_adherence: 95                       │
│    }                                             │
│    context: jsonb (additional metadata)           │
│    session_id: uuid                              │
│  }                                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 6.2 Scoring Dimensions

Every HR action is scored across 4 dimensions:

```
┌────────────────────┬────────────────────────────────────────┐
│ Dimension          │ What It Measures                       │
├────────────────────┼────────────────────────────────────────┤
│ COMPLETENESS       │ Did the HR user fill all required      │
│ (0-100)            │ fields? Missing data = lower score.    │
│                    │ e.g., requisition without salary range  │
│                    │ or employee record without emergency   │
│                    │ contacts = penalty                     │
├────────────────────┼────────────────────────────────────────┤
│ ACCURACY           │ Is the data correct and consistent?    │
│ (0-100)            │ e.g., salary outside band range,       │
│                    │ wrong department code, mismatched       │
│                    │ job level vs compensation grade         │
├────────────────────┼────────────────────────────────────────┤
│ TIMELINESS         │ How fast did the HR user respond?      │
│ (0-100)            │ Each action has an expected SLA:       │
│                    │ - Leave approval: < 24 hours           │
│                    │ - Offer letter: < 48 hours             │
│                    │ - Onboarding setup: < 3 days           │
│                    │ Score degrades as SLA is exceeded       │
├────────────────────┼────────────────────────────────────────┤
│ PROCESS ADHERENCE  │ Did the HR user follow the correct     │
│ (0-100)            │ workflow? e.g., skipping approval      │
│                    │ steps, not collecting interview         │
│                    │ feedback before making offer,           │
│                    │ not running compliance check before     │
│                    │ termination                            │
└────────────────────┴────────────────────────────────────────┘

COMPOSITE SCORE = weighted average:
  Completeness × 0.25 + Accuracy × 0.30 + Timeliness × 0.20 + Process × 0.25
```

### 6.3 Scoring Examples by Module

```
RECRUITMENT MODULE — Talent Acquisition Specialist:
┌─────────────────────────┬─────────┬──────────┬────────────┬─────────┐
│ Action                  │ Complete│ Accurate │ Timely     │ Process │
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Create requisition      │ All     │ Job level│ Within     │ Got     │
│                         │ fields  │ matches  │ 1 day of   │ approval│
│                         │ filled  │ dept     │ need       │ first   │
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Screen candidates       │ Review  │ Match    │ Within     │ Used    │
│                         │ notes   │ criteria │ 48hrs of   │ scoring │
│                         │ added   │ applied  │ application│ rubric  │
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Schedule interview      │ Panel,  │ No       │ Within     │ Sent    │
│                         │ time,   │ conflicts│ 3 days     │ calendar│
│                         │ format  │          │            │ invite  │
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Generate offer          │ Comp,   │ Within   │ Within     │ All     │
│                         │ start   │ salary   │ 48hrs of   │ feedback│
│                         │ date,   │ band     │ final      │ in      │
│                         │ terms   │          │ interview  │ before  │
│                         │         │          │            │ offer   │
└─────────────────────────┴─────────┴──────────┴────────────┴─────────┘

LEAVE MODULE — HR Operations Specialist:
┌─────────────────────────┬─────────┬──────────┬────────────┬─────────┐
│ Action                  │ Complete│ Accurate │ Timely     │ Process │
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Approve/reject leave    │ Comment │ Balance  │ Within     │ Checked │
│                         │ added   │ verified │ 24hrs      │ team    │
│                         │         │          │            │ coverage│
├─────────────────────────┼─────────┼──────────┼────────────┼─────────┤
│ Handle exception        │ Full    │ Policy   │ Same day   │ Escal-  │
│ (negative balance,      │ docs    │ correctly│            │ ated if │
│  overlap, etc.)         │         │ applied  │            │ needed  │
└─────────────────────────┴─────────┴──────────┴────────────┴─────────┘
```

### 6.4 Real-Time Score Dashboard (HR User View)

```
┌──────────────────────────────────────────────────────────┐
│  My Performance Dashboard                                │
│                                                          │
│  Overall Score: 87/100              Rank: 3 of 12       │
│  ████████████████████░░░  87%                           │
│                                                          │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │Complete  │ Accuracy │ Timely   │ Process  │          │
│  │  92%     │   85%    │   82%    │   89%    │          │
│  │ ████░    │ ████░    │ ████░    │ ████░    │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
│                                                          │
│  Recent Actions:                                         │
│  ✅ Approved leave request (L-2847)     Score: 95       │
│  ⚠️  Created requisition (R-1203)       Score: 72       │
│     → Missing: salary range, interview panel             │
│  ✅ Completed onboarding (E-5521)       Score: 88       │
│  ❌ Missed SLA: offer letter (R-1198)   Score: 45       │
│     → 72hrs late                                         │
│                                                          │
│  Certification Progress: Module 3 of 7 ████░░░  43%    │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Certification Engine

### 7.1 Certification Structure

```
Basic certification based on performance (will work on advancement later)
```

### 7.2 Certification Criteria

```
To earn certification, HR user must:

  1. Complete ALL required actions for their level
  2. Maintain minimum average score across all dimensions
  3. No critical failures (e.g., payroll error, compliance miss)
  4. Complete within the time window (e.g., 30 days for Level 1)
  5. Pass a final scenario-based assessment

Certificate includes:
  • User name & role
  • company/company context
  • Level achieved
  • Composite score
  • Breakdown by dimension
  • Actions completed count
  • Date of certification
  • Unique verification ID
```

---

## 8. Employee-User Experience

Employee users are not passive — they actively create the scenarios HR users practice against.

### 8.1 Employee Actions That Trigger HR Work

```
EMPLOYEE ACTION              →  CREATES WORK FOR
─────────────────────────────────────────────────
Apply for open position      →  Talent Acquisition (screening)
Accept/decline offer         →  Talent Acquisition (pipeline update)
Submit leave request         →  HR Operations (approval)
Clock in/out, submit timesheet → HR Operations (attendance)
Update personal info         →  HR Operations (record verification)
Submit self-assessment       →  L&D Specialist (review cycle)
Complete training course     →  L&D Specialist (tracking)
Request salary revision info →  Compensation Specialist (query)
Enroll in benefits           →  Compensation Specialist (enrollment)
Respond to survey            →  Compensation Specialist (analytics)
Submit resignation           →  HR Operations (offboarding)
Raise HR ticket              →  Routes to appropriate HR role
```

### 8.2 Simulated Scenario Engine

To ensure HR users always have work to practice with, the platform can also auto-generate scenarios:

```
Scenario Generator (configurable per company- we will discuss and work oon it later):

  • Auto-create employee leave requests at realistic intervals
  • Simulate new job applications from candidate pool
  • Trigger performance review deadlines
  • Generate payroll data for processing
  • Create compliance audit scenarios
  • Simulate employee lifecycle events (transfers, promotions)

This ensures HR users aren't blocked waiting for employee-users
to take action — they always have a steady stream of realistic work.
```

---

## 9. UI/UX Design — Workday-Inspired, Modern

### 9.1 Navigation Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─────┐  HworkR                    🔍 Search...    🔔  📥  👤  │
│ │ ≡   │  [Company Name]                                         │
├─┼─────┼──────────────────────────────────────────────────────────┤
│ │     │                                                          │
│ │ 🏠  │  HOME                                                   │
│ │Home │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │     │  │Pending  │ │My Score │ │Cert     │ │Team     │       │
│ │ 📋  │  │Actions  │ │  87/100 │ │Progress │ │Overview │       │
│ │Tasks│  │   12    │ │         │ │ 43%     │ │         │       │
│ │     │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│ │ 👥  │                                                          │
│ │People│  RECENT ACTIVITY                                       │
│ │     │  ┌──────────────────────────────────────────────┐       │
│ │ 📊  │  │ ⚠ Leave request from Priya S. awaiting      │       │
│ │Dash │  │ ✅ Requisition R-1204 approved                │       │
│ │     │  │ 📝 Performance review cycle Q1 starting       │       │
│ │ 📁  │  │ 🔔 Payroll deadline in 3 days                │       │
│ │Docs │  └──────────────────────────────────────────────┘       │
│ │     │                                                          │
│ │ 🎯  │  ANNOUNCEMENTS                                          │
│ │Cert │  New certification batch starts April 15th              │
│ │     │                                                          │
│ │ ⚙️  │                                                          │
│ │Set  │                                                          │
│ │     │                                                          │
└─┴─────┴──────────────────────────────────────────────────────────┘

LEFT SIDEBAR (always visible):
  - Adapts based on user role
  - HR roles see their relevant modules
  - Employee roles see self-service modules
  - Icons + labels, collapsible to icons-only
```

### 9.2 Module-Specific Navigation

```
TALENT ACQUISITION SPECIALIST sees:
  🏠 Home
  📋 My Inbox (pending tasks)
  💼 Recruitment
     → Job Requisitions
     → Job Postings
     → Candidate Pipeline
     → Interview Schedule
     → Offers
     → Onboarding Handoff
  👥 People Directory
  📊 My Dashboard (recruitment metrics)
  🎯 Certification Progress
  ⚙️ Settings

HR OPERATIONS SPECIALIST sees:
  🏠 Home
  📋 My Inbox
  👤 Employee Records
     → All Employees
     → New Hires
     → Lifecycle Events
     → Documents
  🗓️ Leave & Attendance
     → Leave Requests
     → Attendance Log
     → Holiday Calendar
     → Leave Policies
  🛡️ Compliance
     → Audit Trail
     → Policy Management
     → Checklists
  📊 My Dashboard
  🎯 Certification Progress
  ⚙️ Settings

L&D SPECIALIST sees:
  🏠 Home
  📋 My Inbox
  🎯 Performance
     → Review Cycles
     → Goals & OKRs
     → Assessments
     → Calibration
     → PIPs
  📚 Learning
     → Course Catalog
     → Training Assignments
     → Completions & Certs
     → Skill Gaps
     → Learning Paths
  📊 My Dashboard
  🎯 Certification Progress
  ⚙️ Settings

COMPENSATION SPECIALIST sees:
  🏠 Home
  📋 My Inbox
  💰 Payroll
     → Salary Structures
     → Pay Runs
     → Payslips
     → Exceptions
     → Tax & Compliance
  🎁 Benefits
     → Plans
     → Enrollment
     → Dependents
  📊 Analytics
     → Dashboards
     → Reports
     → Custom Report Builder
  💬 Engagement
     → Surveys
     → Results & Actions
  🎯 Certification Progress
  ⚙️ Settings

EMPLOYEE USER sees:
  🏠 Home
  👤 My Profile
  💼 Career (job applications, open positions)
  🗓️ My Time (leave requests, attendance)
  💰 My Pay (payslips, tax docs, benefits)
  🎯 My Goals (self-assessment, objectives)
  📚 My Learning (assigned courses, completions)
  📬 My Requests (HR tickets)
```

### 9.3 Visual Design Direction

```
DESIGN LANGUAGE: "Modern Enterprise"
  Inspired by Workday but cleaner, not a clone

  Colors:
    Primary: Deep Blue (#1B4F72) — headers, sidebar, CTAs
    Secondary: Teal (#148F77) — success states, progress bars
    Accent: Amber (#F39C12) — warnings, attention items
    Error: Coral (#E74C3C) — errors, critical alerts
    Background: Light Gray (#F8F9FA) — page background
    Card Background: White (#FFFFFF) — content cards
    Text: Dark Gray (#2C3E50) — body text

  Typography:
    Headings: Inter (bold/semibold)
    Body: Inter (regular)
    Data/Tables: Inter (medium, slightly tighter tracking)

  Components:
    • Cards with subtle shadows (worklet-style tiles on home)
    • Clean data tables with sortable columns
    • Sidebar navigation (always visible, collapsible)
    • Top bar with global search, notifications, inbox, profile
    • Breadcrumb navigation within modules
    • Multi-step forms with progress indicators
    • Toast notifications for real-time updates
    • Modal dialogs for quick actions
    • Timeline views for lifecycle events
    • Kanban boards for recruitment pipeline
    • Calendar views for interviews, leave, reviews
```

---

## 10. Ecosystem Integration Points

Since this connects to your broader ecosystem:

```
HworkR Platform
  │
  ├── API Layer (REST + WebSocket)
  │   ├── /api/v1/companys — company management
  │   ├── /api/v1/employees — employee CRUD
  │   ├── /api/v1/recruitment — ATS operations
  │   ├── /api/v1/leave — leave management
  │   ├── /api/v1/payroll — payroll operations
  │   ├── /api/v1/performance — review & goals
  │   ├── /api/v1/learning — L&D tracking
  │   ├── /api/v1/analytics — reporting & dashboards
  │   ├── /api/v1/tracking — activity logs & scores
  │   └── /api/v1/certification — cert engine
  │
  ├── Webhook System
  │   Emit events for external systems:
  │   • employee.created, employee.updated
  │   • requisition.approved, offer.accepted
  │   • leave.requested, leave.approved
  │   • payroll.processed, review.completed
  │   • certification.earned
  │
  ├── SSO / Auth Integration
  │   Connect to your ecosystem's auth system
  │   Support: Email/password, Google OAuth, SAML
  │
  └── Data Export
      • CSV/Excel export for all modules
      • PDF export for certificates, payslips, reports
      • API access for programmatic integration
```

---

## 11. Tech Stack (Revised for Python + React)

```
I want major tech stack to be python and react. Supporting infra should f=be free and not incur any cost. Let us have a discussion of this later.
```

---

## 12. Database Schema — Core Tables

```sql
-- MULTI-TENANCY
companys (id, name, logo_url, industry, config_json, created_at)
company_memberships (user_id, company_id, role, status)

-- USERS & AUTH
users (id, email, password_hash, name, avatar_url, created_at)
user_roles (user_id, company_id, role_type, modules_access_json)

-- ORG STRUCTURE (per company)
departments (id, company_id, name, parent_id, head_id, level)
locations (id, company_id, name, address, timezone, country)
job_catalog (id, company_id, title, family, level, grade, salary_band_json)

-- EMPLOYEE RECORDS
employees (id, company_id, user_id, employee_code, 
           department_id, job_id, manager_id, location_id,
           status, hire_date, personal_info_json, 
           documents_json, created_at, updated_at)

-- RECRUITMENT
requisitions (id, company_id, created_by, department_id, job_id,
              headcount, status, approval_chain_json, created_at)
job_postings (id, requisition_id, company_id, description, 
              requirements, deadline, status)
applications (id, posting_id, company_id, candidate_user_id,
              resume_url, status, stage, applied_at)
interviews (id, application_id, company_id, scheduled_at,
            panel_json, format, feedback_json, status)
offers (id, application_id, company_id, compensation_json,
        start_date, status, sent_at, responded_at)

-- LEAVE & ATTENDANCE
leave_policies (id, company_id, type, accrual_rules_json, 
                carry_forward_limit, applicable_to_json)
leave_requests (id, company_id, employee_id, type, 
                start_date, end_date, reason, status, 
                approved_by, created_at)
leave_balances (id, company_id, employee_id, type, 
                balance, year)
attendance_records (id, company_id, employee_id, date,
                    clock_in, clock_out, status)
holiday_calendars (id, company_id, location_id, date, name)

-- PERFORMANCE & GOALS
review_cycles (id, company_id, name, type, start_date, 
               end_date, status)
goals (id, company_id, employee_id, cycle_id, title,
       description, target, progress, status)
assessments (id, company_id, employee_id, cycle_id, 
             type, assessor_id, ratings_json, 
             comments, submitted_at)
pips (id, company_id, employee_id, reason, plan_json,
      start_date, end_date, status)

-- LEARNING & DEVELOPMENT
courses (id, company_id, title, category, duration,
         prerequisites_json, content_url, mandatory)
training_assignments (id, company_id, employee_id, course_id,
                      assigned_by, due_date, status)
training_completions (id, assignment_id, company_id, 
                      completed_at, score, certificate_url)
skill_profiles (id, company_id, employee_id, skills_json)

-- PAYROLL & COMPENSATION
salary_structures (id, company_id, employee_id, 
                   components_json, effective_from)
pay_runs (id, company_id, month, year, status, 
          processed_by, processed_at)
payslips (id, pay_run_id, company_id, employee_id, 
          gross, deductions_json, net, pdf_url)
benefits_plans (id, company_id, name, type, 
                details_json, enrollment_period)
benefits_enrollments (id, plan_id, company_id, employee_id,
                      dependents_json, status)

-- ENGAGEMENT
surveys (id, company_id, title, questions_json, 
         target_audience_json, start_date, end_date, status)
survey_responses (id, survey_id, company_id, employee_id,
                  answers_json, submitted_at)

-- ACTIVITY TRACKING & SCORING
activity_logs (id, company_id, user_id, role, module,
               action_type, action_detail, entity_type,
               entity_id, started_at, completed_at,
               duration_seconds, quality_score,
               quality_factors_json, context_json, session_id)
scoring_rules (id, company_id, module, action_type,
               sla_seconds, weight_completeness, 
               weight_accuracy, weight_timeliness,
               weight_process, criteria_json)

-- CERTIFICATION
cert_tracks (id, company_id, role_type, level, 
             name, requirements_json, min_score)
cert_progress (id, track_id, company_id, user_id,
               completed_actions_json, current_score,
               status, started_at)
certificates (id, track_id, company_id, user_id,
              level, score, breakdown_json,
              issued_at, verification_id)

-- NOTIFICATIONS & INBOX
notifications (id, company_id, user_id, type, title,
               message, entity_type, entity_id, 
               read, created_at)
inbox_tasks (id, company_id, user_id, type, title,
             entity_type, entity_id, priority,
             status, due_at, created_at)

-- BUSINESS PROCESS ENGINE
workflow_templates (id, company_id, name, module,
                    steps_json, conditions_json)
workflow_instances (id, template_id, company_id,
                    entity_type, entity_id, current_step,
                    status, initiated_by, initiated_at)
workflow_actions (id, instance_id, step, actor_id,
                  action, comments, acted_at)

-- AUDIT
audit_trail (id, company_id, user_id, entity_type,
             entity_id, action, changes_json,
             ip_address, timestamp)
```

---

## 13. Build Phases — Revised

```
I want the product to be built in phases based on functionality. Phase 1 should cover organizational registration, org structure. Phase 2 covers employee onboaring(application->conversion).Phase 3 HR ops. Phase 4 compensation, then performance and offboarding certification. Plan accordingly and we can discuss on this if you have any questions.
```

---

## 14. Open Questions for You

1. **Scenario complexity:** Should the platform have pre-built "scenario packs" (e.g., "New Office Opening" that triggers 50 hires, new location setup, benefits enrollment) or purely organic from employee actions? -> I will confirm this later as I am testing
2. **Real-time vs async:** Should HR users see live notifications when employees take actions, or is batch processing (e.g., morning queue of pending tasks) acceptable? -> both, give me an idea of cost involved for realtime
3. **Leaderboard:** Do you want cross-company leaderboards (Company A's HR vs Company B's HR) or only within-company ranking? -> not for now
4. **Indian payroll depth:** How deep on India-specific payroll (PF, ESI, Professional Tax, Form 16, etc.) vs keeping it generic initially? -> very basic one for now, indianised but contains only metrics that apply to all countries and not only india specific

---

*Document version: 1.0*
*Created: April 2026*
*Project: HworkR — HR Training & Certification Platform*