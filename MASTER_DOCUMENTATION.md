# HworkR — Master Product & Technical Documentation

> **Audience:** Product team, QA testers, engineers, and launch stakeholders.  
> **Purpose:** Single source of truth for manual testing, production launch, and team onboarding.  
> **Last updated:** May 2026

---

## Table of Contents

1. [What is HworkR?](#1-what-is-hworkr)
2. [Target Market & Users](#2-target-market--users)
3. [User Roles](#3-user-roles)
4. [User Role Tasks & Permissions](#4-user-role-tasks--permissions)
5. [Product Modules — Feature-by-Feature](#5-product-modules--feature-by-feature)
6. [User Flows](#6-user-flows)
7. [How Tasks Are Assigned](#7-how-tasks-are-assigned)
8. [Performance Measurement System](#8-performance-measurement-system)
9. [Certification System](#9-certification-system)
10. [Who Connects to Whom and For What](#10-who-connects-to-whom-and-for-what)
11. [Technical Architecture](#11-technical-architecture)
12. [Database Models](#12-database-models)
13. [API Endpoints — Complete Reference](#13-api-endpoints--complete-reference)
14. [Frontend Routes & RBAC](#14-frontend-routes--rbac)
15. [Real-Time & WebSocket](#15-real-time--websocket)
16. [Payroll Engine (SimCash)](#16-payroll-engine-simcash)
17. [Legal AI Chatbot (RAG)](#17-legal-ai-chatbot-rag)
18. [Workflow Engine](#18-workflow-engine)
19. [Webhooks & External Integrations](#19-webhooks--external-integrations)
20. [Deployment & Environment](#20-deployment--environment)
21. [Known Issues & Code Notes](#21-known-issues--code-notes)
22. [Glossary](#22-glossary)

---

## 1. What is HworkR?

HworkR is a **multi-tenant, role-based Human Resources and People Operations web application**. It is organized as a **company workspace**: each organization is an isolated tenant; users can belong to one or more companies, each with a distinct role.

### Core Value Proposition

- **Structured organization modeling:** departments, positions, org chart, job catalog, locations
- **Full HR lifecycle management:** hire-to-retire — employee records, documents, lifecycle events
- **End-to-end recruitment:** requisitions, job postings, candidate pipeline, interviews, offers
- **Payroll & compensation configuration:** Indian CTC-style payroll engine, grade bands, salary structures, pay runs, payslips, reconciliation
- **Learning, performance & certification:** training courses, review cycles, goals, PIPs, skill profiles, and a built-in certificate issuance engine tied to verifiable activity scoring
- **Employee engagement:** surveys, action plans, satisfaction trends
- **Compliance:** policy documents, acknowledgments, full audit trail
- **AI-powered legal assistant:** RAG-based chatbot powered by Google Vertex AI + ChromaDB over a legal knowledge corpus
- **Real-time UX:** WebSocket-driven live toasts and notifications
- **Integrations:** webhooks, CSV exports, optional SSO (stubs for Google OIDC and SAML)

---

## 2. Target Market & Users

### Market

- **Segment:** Small-to-medium enterprises (SMEs) and growing mid-size companies
- **Geography:** India-first (CTC payroll structure, Indian legal corpus for RAG, Indian leave defaults) with a globally extensible design
- **Category:** B2B HR SaaS (multi-tenant, workspace-per-company)
- **Competitive space:** Competes in the segment occupied by Darwinbox, Zoho People, Keka, and BambooHR — distinguished by its built-in scoring/certification engine and legal AI layer

### Primary User Personas

| Persona | Role in System | What They Care About |
|---------|---------------|----------------------|
| **HR Director / Admin** | `company_admin` | Full control, org setup, compliance |
| **HR Operations Manager** | `hr_ops` | Day-to-day employee admin, leave, policies |
| **Recruiter** | `talent_acquisition` | Requisitions, pipeline, interviews, offers |
| **L&D Manager** | `ld_performance` | Course catalog, training assignments, scores |
| **Compensation Analyst** | `compensation_analytics` | Grade bands, salary structures, payroll runs |
| **Employee (IC / Manager)** | `employee` | Self-service: profile, leave, goals, payslip, certification |
| **Platform Operator** | Platform admin (system flag) | Company onboarding, global registry |

---

## 3. User Roles

Every user has one **platform-level** identity and one or more **company-level memberships**, each with a role.

### 3.1 Platform-Level Role

| Flag | Who Has It | What They Can Do |
|------|-----------|-----------------|
| `is_platform_admin` | Internal operators only | View all companies, approve/reject company registration requests, look up companies by name |

Platform admins work in the `/platform` area and **cannot** access company workspaces through normal membership.

### 3.2 Company Membership Roles

There are **6 roles** stored in `CompanyMembership.role`:

| Role Key | Display Name | Scope |
|----------|-------------|-------|
| `company_admin` | Company Admin | Superuser within the company — everything |
| `hr_ops` | HR Operations | Employee records, leave admin, performance, policies |
| `talent_acquisition` | Talent Acquisition | Recruitment, workflows (alongside admin) |
| `ld_performance` | Learning & Development | Courses, training assignments, scores (with admin) |
| `compensation_analytics` | Compensation & Analytics | Payroll config, grade bands, salary, benefits plans |
| `employee` | Employee | Self-service only |

> A user can hold different roles in different companies simultaneously.

---

## 4. User Role Tasks & Permissions

### 4.1 company_admin

**Full access to every feature.** Key unique capabilities:

- Invite, role-change, and deactivate members (`/members`)
- Delete the company
- Access `exports`, `webhooks`, `scenarios`, `tracking`, `integrations/sso`
- Approve/reject certificates
- Approve workflow steps (company_admin can act on any step regardless of defined approver role)
- Seed demo data
- Upload company logo
- Create certification tracks
- Publish/update policy documents
- Configure payroll (grade bands, salary structures, pay runs, reconciliation)
- Manage benefit plans and enrollments
- Issue certificates for other users
- Configure scoring rules

### 4.2 hr_ops

- Full access to employee directory (`employees/profile`, `employees/lifecycle`)
- Leave approvals queue and org-wide leave balance tracker (exclusive to `hr_ops`)
- Performance management console (review cycles, goals, PIPs, assessments)
- Policy publishing
- Audit trail and policy library
- My profile + My goals + Team goals (when they have direct reports)
- All Leave sub-pages (including approvals and balances)
- Survey responses and action plans management
- Payslips (read)

### 4.3 talent_acquisition

- Recruitment module: requisitions, postings, pipeline, interviews, offers
- Candidate portal view
- Workflow instances and actions (alongside admin)
- Learning assignments (self)
- Payslips (self)
- Surveys (self)
- Recruitment tracking page
- Cannot access: employee directory, leave approvals/balances, performance console, exports, webhooks

### 4.4 ld_performance

- Course catalog management (create/edit courses)
- Training scores (org-wide view)
- Training assignments (all roles can view their own; LD manages org-wide)
- Payslips (self)
- Surveys (self)
- Cannot access: employee directory, payroll config, recruitment config, leave admin

### 4.5 compensation_analytics

- Payroll configuration: salary structures, grade bands, pay runs, reconciliation, reimbursements, merit increments
- Benefits plans and enrollment management
- Payslips (self + can see others through payroll runs)
- Surveys (self)
- Analytics dashboard (with other non-employee roles)
- Cannot access: employee directory, leave admin, recruitment, performance console

### 4.6 employee

- **My Profile** — view/edit own employment info, upload own documents
- **My Goals** — create/update personal goals; participate in peer review
- **Team Goals** — only shown if employee has direct reports in the system
- **Recruitment** — candidate portal: apply, track applications, view/respond to offers
- **Learning assignments** — view and complete assigned courses
- **Leave request** — submit and track own leave requests
- **Leave policies** and **Holiday calendar** (read)
- **Payslips** tab in payroll (own payslip only)
- **My Benefits** tab
- **My Surveys** + Action Plans assigned to them
- **Inbox** — personal task list
- **Progress** — certification readiness dashboard
- **Certification** — view own progress, certificates
- **Org chart** — read only
- **Audit trail** and **Policy library** (read + acknowledge)
- **Legal chatbot**
- **Notifications**
- Cannot access: employee directory, leave approvals/balances, payroll config, performance console, analytics, tracking, exports, webhooks, members, scenarios

---

## 5. Product Modules — Feature-by-Feature

### 5.1 Dashboard

**Purpose:** Landing snapshot when entering a company workspace.  
**Who sees it:** All 6 roles.  
**What it shows:** High-level orientation; no deep data — acts as a navigation hub.  
**Backend route:** No dedicated dashboard endpoint (page is static/navigational).  
**Frontend:** `WorkspaceDashboardPage.tsx` at route index (`/company/:id`).

---

### 5.2 Organization Chart

**Purpose:** Visual model of the company structure — departments, positions (job slots), reporting lines.  
**Who sees it:** All roles (read). Edits: `company_admin`, `hr_ops`.

**Features:**
- Visual tree of positions with department grouping
- Zoom / full-screen controls
- Export org chart as PDF (`orgChartPdfExport.ts` using `html-to-image` + `jspdf`)
- Add/edit departments, locations, org roles, job catalog entries
- Position cards show role, grade, incumbent (if filled)

**How it works internally:**
- `Department`, `Location`, `JobCatalogEntry`, `OrgRole`, `DepartmentOrgRole`, `Position` models in PostgreSQL
- `Position` has: `name`, `department_id`, `job_id`, `grade`, `reports_to_position_id`, `works_with_json` (peer links), `filled_by_employee_id`
- Org tree layout computed client-side in `orgTreeLayout.ts`
- `GET /companies/{id}/departments-with-org-roles` provides hierarchy for UI

**Key API calls:**
- `GET /companies/{id}` — company profile
- `GET /companies/{id}/departments` — department list
- `GET /companies/{id}/positions` — position list
- `POST/PATCH/DELETE /companies/{id}/positions/{position_id}`
- `GET /companies/{id}/job-catalog`, `GET /companies/{id}/locations`

---

### 5.3 My Profile

**Purpose:** Employees manage their own record and documents.  
**Who:** `employee`, `hr_ops` (those with employee records in the company).

**Features:**
- Edit personal information stored in `personal_info_json` (name, phone, address, etc.)
- Upload and manage documents by document type (offer letter, ID proof, etc.)
- View onboarding checklist completion

**How it works internally:**
- `Employee.personal_info_json` is a flexible JSON blob for personal fields
- `Employee.documents_json` stores document metadata; actual files stored on disk at `UPLOAD_DIR`
- `EmployeeDocument` model tracks document type + status per employee
- Profile-field completeness tracked via `profile_inbox_sync.py` — incomplete fields generate `InboxTask` rows of type `profile_field_reminder`
- Document uploads trigger `employee_document_sync.py` to update inbox tasks

**Key API calls:**
- `GET /companies/{id}/employees/me` — own employee record
- `PATCH /companies/{id}/employees/me` — update own info
- `GET /companies/{id}/employees/me/documents`
- `POST /companies/{id}/employees/me/documents/{doc_type}/upload` (multipart)
- `PATCH /companies/{id}/employees/me/documents/{doc_type}` — update metadata

---

### 5.4 My Goals & Peer Review

**Purpose:** Employees set, track, and submit personal performance goals within a review cycle. Peer review nominations and feedback also flow through here.  
**Who:** `employee`, `hr_ops`.

**Features:**
- View active review cycle and KPIs
- Submit goals for the cycle (with deadlines)
- Nominate up to 3 peer reviewers (from "works-with" cohort — same manager + grade)
- Submit feedback when nominated as a peer reviewer
- Track pending peer feedback requests

**How it works internally:**
- `ReviewCycle` → `ReviewCycleEmployeeGoalSubmission` per employee
- `ReviewCyclePeerNomination` stores who nominated whom
- `PeerReviewFeedback` stores feedback submitted by a reviewer
- "Works with" cohort derived from org structure by `works_with_peers.py` — looks for employees sharing the same manager AND same job/grade band, or explicitly linked in `Position.works_with_json`
- Notifications sent to all eligible employees when a review cycle is created

**Key API calls:**
- `GET /companies/{id}/performance/my-review-cycle-goals`
- `POST /companies/{id}/performance/review-cycles/{cycle_id}/submit-my-goals`
- `POST /companies/{id}/performance/review-cycles/{cycle_id}/submit-peer-review-nominations`
- `POST /companies/{id}/performance/review-cycles/{cycle_id}/submit-peer-feedback`
- `GET /companies/{id}/performance/my-pending-peer-feedback-requests`
- `GET /companies/{id}/performance/my-peer-review-cycles`

---

### 5.5 Team Goals

**Purpose:** Managers (and hr_ops) see their direct reports' goal submissions and cycle participation.  
**Who:** `employee` (if has direct reports), `hr_ops`.  
**Visibility condition:** Sidebar shows "Team goals" only when `listMyDirectReports` API returns a non-empty list.

**Key API call:** `GET /companies/{id}/performance/review-cycles/{cycle_id}/goal-cycle-tracking`

---

### 5.6 Employees (HR Module)

**Purpose:** Central HR directory — full CRUD on employee records, document management, and lifecycle events.  
**Who:** `company_admin`, `hr_ops` only.

**Features:**

**Employee Profile Management tab:**
- Search and browse all employees
- Create new employee (links optionally to a `user_id`)
- Edit employment fields: department, job, position, manager, location, hire date, status
- View/edit documents with admin override
- Access full employee detail page with onboarding checklist and HR panels

**Lifecycle Events tab:**
- Record significant events: hire, transfer, promotion, termination, rehire, etc.
- View history of lifecycle events per employee
- Each event tagged by type, date, notes

**How it works internally:**
- `Employee` model: `company_id`, `user_id` (optional link to auth user), `employee_code`, `department_id`, `job_id`, `position_id`, `manager_id`, `location_id`, `status`, `hire_date`, `personal_info_json`, `documents_json`, `onboarding_checklist_json`
- `EmployeeLifecycleEvent` model: `employee_id`, `event_type`, `effective_date`, `notes_json`
- Creating/updating an employee triggers `log_tracked_hr_action` (module=`employees`) which feeds the scoring engine
- Employee creation also triggers `employee_document_sync.py` to pre-populate document slots and inbox tasks
- Recruitment `convert-to-employee` endpoint converts an accepted offer into an `Employee` record

**Key API calls:**
- `GET /companies/{id}/employees`
- `GET /companies/{id}/employees/summary`
- `POST /companies/{id}/employees`
- `GET /companies/{id}/employees/{eid}/detail`
- `PATCH /companies/{id}/employees/{eid}`
- `PATCH /companies/{id}/employees/{eid}/onboarding`
- `POST /companies/{id}/employees/{eid}/lifecycle-events`
- `GET /companies/{id}/employees/{eid}/lifecycle-events`
- `GET /companies/{id}/employees/{eid}/documents`
- `PATCH /companies/{id}/employees/{eid}/documents/{doc_type}`

---

### 5.7 Leave Management

**Purpose:** Leave policy definition, holiday calendar, employee leave requests, and HR approvals and balance tracking.

**Features by sub-section:**

| Sub-page | Who | Purpose |
|----------|-----|---------|
| Leave policies | All (read); `hr_ops`/admin to create | Define leave types, days per year, carry-forward rules |
| Holiday calendar | All (read); `hr_ops`/admin to create | Company-specific public holidays |
| Leave request | All employees | Submit leave (type, dates, reason) |
| Leave approvals | **`hr_ops` only** | Approve or reject pending requests |
| Leave balance tracker | **`hr_ops` only** | View org-wide leave balances per employee and type |

**How it works internally:**
- `LeavePolicy` model: `leave_type`, `days_per_year`, `carry_forward_days`, `company_id`
- `LeaveRequest` model: `employee_id`, `leave_type`, `start_date`, `end_date`, `status` (pending/approved/rejected), `decision_by`, `decision_at`, `notes`
- `LeaveBalance` model: per employee per leave type; updated when requests approved
- `HolidayCalendar` model: list of dates for a calendar year
- `AttendanceRecord` model: daily presence records (separate from leave)
- Leave approval triggers `log_tracked_hr_action` (module=`leave`, action=`approved` or `rejected`) — feeds scoring
- SLA for leave approval: 24 hours (from `scoring_rules.py`)

**Key API calls:**
- `GET/POST /companies/{id}/leave/policies`
- `GET/POST /companies/{id}/leave/requests`
- `PATCH /companies/{id}/leave/requests/{id}/decision`
- `GET /companies/{id}/leave/summary`
- `GET/POST /companies/{id}/leave/balances`
- `GET/POST /companies/{id}/attendance`
- `GET/POST /companies/{id}/holiday-calendars`

---

### 5.8 Audit Trail & Policies

**Purpose:** Read-only event history for compliance; document publishing and employee acknowledgment.

**Features:**

**Audit Trail:**
- All HR actions logged with entity type, entity id, actor, action, timestamp
- Filterable by category (employees, compliance, recruitment, etc.)
- Member search to filter by person

**Policy Library:**
- HR admins publish PDF policy documents with title and category
- All members can read and download policies
- Employees and HR members can acknowledge reading a policy
- `PolicyAcknowledgment` records who acknowledged, when
- Acknowledgment detail page shows per-user status

**How it works internally:**
- `AuditTrailEntry` model: `company_id`, `user_id`, `entity_type`, `entity_id`, `action`, `changes_json`, `created_at`
- `write_audit()` service called throughout the API on every significant mutation
- `PolicyDocument` model: stores title, category, file path, published_by
- `PolicyAcknowledgment` model: `policy_id`, `user_id`, `acknowledged_at`
- Document files stored in `UPLOAD_DIR` on server
- Policy creation triggers `log_tracked_hr_action` (module=`compliance`, action=`policy_created`)
- Acknowledgment triggers `log_tracked_hr_action` (module=`compliance`, action=`policy_acknowledged`)

**Key API calls:**
- `GET /companies/{id}/audits/trail` (+ `/categories`)
- `GET /companies/{id}/audits/members/search`
- `GET/POST /companies/{id}/audits/policies`
- `GET /companies/{id}/audits/policies/{pid}/download`
- `POST /companies/{id}/audits/policies/{pid}/acknowledge`
- `GET /companies/{id}/audits/policies/{pid}/acknowledgment-detail`

---

### 5.9 Workflows

**Purpose:** Multi-step approval processes (currently wired to recruitment requisition approvals).  
**Who:** `company_admin`, `talent_acquisition` — start and track; approvers determined by template step definition.

**Features:**
- View workflow templates (one default "requisition approval" template created automatically per company)
- Start a workflow instance on an entity (e.g. a requisition)
- Take actions: approve or reject, with optional comments
- Track instance status and history

**How it works internally:**
- `WorkflowTemplate` model: `module`, `steps_json` (ordered list of `{name, approver_role}`)
- `WorkflowInstance` model: `template_id`, `entity_type`, `entity_id`, `current_step`, `status` (active/approved/rejected)
- `WorkflowAction` model: per step action taken (actor, action, comments, timestamp)
- `ensure_default_recruitment_template()` auto-creates a template with a single `company_admin_approval` step if none exists
- `apply_workflow_action()` advances `current_step` on approve; sets status on terminal state
- `sync_entity_after_workflow()` updates the linked entity — for requisitions, sets `status` to `approved` or `rejected`
- `company_admin` can act on any step regardless of defined role

**Key API calls:**
- `GET /companies/{id}/workflow-templates`
- `POST /companies/{id}/workflow-instances`
- `GET /companies/{id}/workflow-instances`
- `POST /companies/{id}/workflow-instances/{inst_id}/actions`
- `GET /companies/{id}/workflow-instances/{inst_id}/actions`

---

### 5.10 Recruitment

**Purpose:** Full hiring funnel from headcount approval to offer acceptance and employee onboarding.  
**Who:** `company_admin`, `talent_acquisition` manage; `employee` accesses candidate portal.

**Features:**

| Sub-page | Who | Purpose |
|----------|-----|---------|
| Requisitions | Admin, TA | Create/manage internal headcount requests |
| Job postings | Admin, TA | Create public/internal job listings from requisitions |
| Pipeline | Admin, TA | View all applications, move through stages |
| Interviews | Admin, TA | Schedule and manage interviews |
| Offers | Admin, TA | Create and track offer letters |
| Candidate portal | Employee | Apply for jobs, view own applications and offers |
| Tracking | Admin, TA | Application activity and pipeline velocity |
| Approval workflow | Admin, TA | Requisition approval via workflow engine |

**Recruitment lifecycle flow:**
1. **Requisition** created (title, department, headcount, criteria) with `req_code` auto-generated
2. Requisition sent for approval via **workflow** (company_admin approves)
3. Approved requisition linked to a **Job posting** (can be public or internal)
4. External candidates apply via `POST /recruitment/public-apply/{req_code}` (no auth needed — account auto-created if new)
5. Internal applicants use **Candidate portal**
6. Applications move through pipeline **stages** (configurable)
7. **Interviews** scheduled and linked to applications
8. **Offer** created and sent; candidate responds (accept/decline)
9. Accepted offer can be **converted to an employee** record

**How it works internally:**
- `Requisition`: `req_code` (unique short code, human-readable), `status` (draft/pending_approval/approved/rejected/open/closed), `department_id`, `job_id`, `hiring_criteria_json`
- `JobPosting`: linked to requisition, `is_public`, `status` (draft/open/closed)
- `Application`: `posting_id`, `user_id` (applicant), `status`, `stage`
- `Interview`: `application_id`, `scheduled_at`, `interviewers_json`, `feedback_json`
- `Offer`: `application_id`, `salary_json`, `status`, `responded_at`, `response`
- `recruit_external_status.py` posts pipeline status updates to a configurable external webhook URL
- `recruitment_offer_webhook.py` sends offer data outbound when created
- Public apply creates a `User` account (if email not found) and an `Application` row

**Key API calls (recruiter):**
- `GET/POST /companies/{id}/recruitment/requisitions`
- `PATCH /companies/{id}/recruitment/requisitions/{rid}`
- `GET/POST /companies/{id}/recruitment/postings`
- `GET /companies/{id}/recruitment/applications`
- `PATCH /companies/{id}/recruitment/applications/{aid}/stage`
- `GET/POST /companies/{id}/recruitment/applications/{aid}/interviews`
- `GET/POST /companies/{id}/recruitment/offers`
- `POST /companies/{id}/recruitment/offers/{oid}/convert-to-employee`

**Key API calls (candidate):**
- `GET /companies/{id}/recruitment/candidate/open-postings`
- `GET /companies/{id}/recruitment/candidate/my-applications`
- `GET /companies/{id}/recruitment/candidate/my-offers`
- `PATCH /companies/{id}/recruitment/offers/{oid}/respond`
- `POST /recruitment/public-apply/{req_code}` (no auth, no company prefix)

---

### 5.11 Performance Management

**Purpose:** Structured performance review cycles, company-wide goal setting, PIPs, and assessments.  
**Who:** `company_admin`, `hr_ops` configure and run; employees participate via Goals module.

**Features:**
- Create and manage review cycles with KPI definitions and deadlines
- Track employee goal submissions per cycle
- Manage Goals (standalone, outside cycles)
- Create Performance Improvement Plans (PIPs) for at-risk employees
- Conduct assessments
- View at-risk employees

**How it works internally:**
- `ReviewCycle` model: `name`, `start_date`, `end_date`, `goals_deadline`, `status`, `kpi_definitions_json`
- `ReviewCycleKpiDefinition`: structured KPI definition rows per cycle
- `ReviewCycleEmployeeGoalSubmission`: employee's goal submission for a cycle
- `ReviewCyclePeerNomination` + `PeerReviewFeedback`: peer review loop
- On cycle creation, notifications sent to all active employees with managers (via `_notify_employees_review_cycle_goals`)
- Peer review nominations also trigger notification wave
- `Goal`: standalone goals with `title`, `description`, `due_date`, `status`, `progress`
- `Assessment`: `employee_id`, `assessor_id`, `period`, `ratings_json`, `comments`
- `Pip`: `employee_id`, `start_date`, `end_date`, `objectives_json`, `status`
- `at-risk-employees` endpoint identifies employees with open/active PIPs

**Key API calls:**
- `GET/POST /companies/{id}/performance/review-cycles`
- `GET /companies/{id}/performance/review-cycles/{cid}/goal-cycle-tracking`
- `GET/POST /companies/{id}/performance/goals`
- `PATCH /companies/{id}/performance/goals/{gid}`
- `POST/GET /companies/{id}/performance/assessments`
- `GET /companies/{id}/performance/pips/at-risk-employees`
- `POST/GET /companies/{id}/performance/pips`

---

### 5.12 Learning & Development

**Purpose:** Course catalog, training assignments, completions, and skill profiles.

| Sub-page | Who | Purpose |
|----------|-----|---------|
| Training assignments | All roles | View and complete assigned courses |
| Course catalog management | `company_admin`, `ld_performance` | Create/edit courses |
| Training scores | `company_admin`, `ld_performance` | View per-employee scores per course |

**Features:**
- Courses have YouTube video links (embedded via `youtubeUtils.ts`)
- Assignments link employees to courses with deadlines
- Completions recorded with pass/fail and score
- Skill profiles per employee (skills + proficiency levels)
- L&D suggestion engine suggests courses based on skill profile gaps

**How it works internally:**
- `Course`: `title`, `description`, `video_url`, `duration_minutes`, `category`, `required_score`
- `TrainingAssignment`: `course_id`, `employee_id`, `due_date`, `mandatory` flag
- `TrainingCompletion`: `assignment_id`, `employee_id`, `completed_at`, `score`, `passed`
- `SkillProfile`: JSON blob per employee with skill name → proficiency
- `learning_employee_suggestions` endpoint: cross-references `SkillProfile` gaps with available courses
- Training completion triggers `log_tracked_hr_action` (module=`training`) → scoring engine
- Late mandatory assignment nudge: `training_assigner_late_mandatory_nudge()` in scoring engine module
- SLA for training completion computed against assignment `due_date`

**Key API calls:**
- `GET/POST /companies/{id}/learning/courses`
- `GET/POST /companies/{id}/learning/training-assignments`
- `POST /companies/{id}/learning/training-completions`
- `GET /companies/{id}/learning/courses/{cid}/employee-scores`
- `GET /companies/{id}/learning/employee-suggestions`
- `GET /companies/{id}/learning/skill-profiles/{eid}`
- `PUT /companies/{id}/learning/skill-profiles/{eid}`

---

### 5.13 Payroll

**Purpose:** Indian CTC-style salary configuration, pay run management, payslip generation, validation, and reconciliation.

**Sub-tabs via query param `?tab=`:**

| Tab | Who | Purpose |
|-----|-----|---------|
| `salary` | Compensation + admin | Salary structures per grade/band |
| `grades` | Compensation + admin | Grade band configuration |
| `merit` | Compensation + admin | Compensation review cycles (merit increments) |
| `reimbursements` | Compensation + admin | Supplemental/reimbursement pay |
| `runs` | Compensation + admin | Create and manage pay run periods |
| `payslips` | **All roles** | View own payslip (employees); manage all (compensation) |
| `reconciliation` | Compensation + admin | Validate pay calculations against engine |

**How it works internally (SimCash engine):**
- Full details in [Section 16](#16-payroll-engine-simcash)
- `SalaryStructure`: `grade_band_id`, `components_json` (CTC annual + bonus pct)
- `CompensationGradeBand`: `band_name`, `min_ctc`, `max_ctc`, `level`
- `PayRun`: `period_month`, `period_year`, `status` (draft/finalized)
- `PayRunEmployeeLine`: one row per employee per pay run with `salary_structure_id`, computed amounts, supplemental lines
- `Payslip`: generated from `PayRunEmployeeLine`; downloadable
- `PayrollLedgerEntry`: line-item audit trail of payroll amounts
- Validation endpoint checks HR-submitted figures against engine calculation (tolerance ₹0.50)
- Reconciliation checks net pay totals against expected from salary structures

**Key API calls:**
- `GET/POST /companies/{id}/payroll/grade-bands`
- `PATCH /companies/{id}/payroll/grade-bands/{bid}`
- `GET/POST /companies/{id}/payroll/salary-structures`
- `PATCH /companies/{id}/payroll/salary-structures/{sid}`
- `GET/POST /companies/{id}/payroll/pay-runs`
- `GET /companies/{id}/payroll/pay-runs/period-overview`
- `GET /companies/{id}/payroll/payslips`
- `GET /companies/{id}/payroll/payslips/{pid}/ledger-entries`
- `GET /companies/{id}/payroll/engine-expected` — get engine-computed values for comparison
- `POST /companies/{id}/payroll/validate-calculation` — submit actual vs expected
- `POST /companies/{id}/payroll/validate-reconciliation`

---

### 5.14 Benefits

**Purpose:** Benefits plan definitions and employee enrollments.

| Sub-tab | Who | Purpose |
|---------|-----|---------|
| Plans | Compensation + admin | Define health, insurance, etc. benefit plans |
| Enrollments | Compensation + admin | Manage employee enrollments |
| My Benefits | **Employee only** | View own enrolled benefits |

**How it works internally:**
- `BenefitsPlan`: `plan_name`, `plan_type`, `description`, `coverage_json`, `cost_json`
- `BenefitsEnrollment`: `employee_id`, `plan_id`, `enrolled_at`, `status`
- Enrollment summary endpoint aggregates coverage per employee

**Key API calls:**
- `GET/POST /companies/{id}/benefits/plans`
- `PATCH/DELETE /companies/{id}/benefits/plans/{pid}`
- `GET/POST /companies/{id}/benefits/enrollments`
- `PATCH /companies/{id}/benefits/enrollments/{eid}`
- `GET /companies/{id}/benefits/enrollment-summary`

---

### 5.15 Engagement & Surveys

**Purpose:** Employee satisfaction surveys, response analysis, action plans, and trends.

| Sub-tab | Who | Purpose |
|---------|-----|---------|
| Surveys | All | Create and view surveys |
| Responses & Analysis | `hr_ops`, admin | Analyze collected responses |
| Action Plans | `hr_ops`, admin, employee | Manage and view action plans |
| Satisfaction Trends | `hr_ops`, admin | Time-series satisfaction tracking |
| My Surveys | Employee | Complete assigned surveys |

**How it works internally:**
- `Survey`: `title`, `questions_json`, `target_role` or broadcast, `period`, `status` (draft/open/closed)
- `SurveyResponse`: `survey_id`, `employee_id`, `answers_json`, `submitted_at`
- `SurveyActionPlan`: created from survey insights; `title`, `description`, `owner_id`, `due_date`, `status`
- Survey templates available for quick creation
- Responses are anonymous by design (no direct user-response linkage in display layer)

**Key API calls:**
- `GET/POST /companies/{id}/engagement/surveys`
- `GET /companies/{id}/engagement/survey-templates`
- `POST /companies/{id}/engagement/survey-responses`
- `GET /companies/{id}/engagement/surveys/{sid}/action-plans`
- `POST /companies/{id}/engagement/surveys/{sid}/action-plans`
- `GET /companies/{id}/engagement/my-action-plans`

---

### 5.16 Legal Chatbot (AI)

**Purpose:** AI-powered Q&A on Indian employment law and HR policy topics.  
**Who:** All roles (entire company workspace).  
**Powered by:** Google Vertex AI (Gemini) + ChromaDB vector database over a legal corpus.

**Features:**
- Chat interface (`LegalChatbot.tsx`)
- Persistent chat history stored in browser localStorage (`legalChatPersistence.ts`)
- Retrieves relevant clauses from the legal corpus before generating answers
- Cites source documents in responses
- Topic gate — only answers legal/HR topics (blocks off-topic queries)

**How it works internally:** See [Section 17](#17-legal-ai-chatbot-rag).

**Key API call:**
- `POST /companies/{id}/legal/chat` — `{message, history}`

---

### 5.17 Inbox

**Purpose:** Personal task list populated automatically by the system based on user's state.  
**Who:** All roles.

**Task types generated automatically:**
- `profile_field_reminder` — missing profile fields detected by `profile_inbox_sync.py`
- `cohort_task` — certification module tasks assigned via `cohort_task_catalog.py`
- `document_reminder` — missing employee documents from `employee_document_sync.py`

**How it works internally:**
- `InboxTask` model: `user_id`, `company_id`, `type`, `title`, `description`, `status` (open/done), `context_json`
- Tasks auto-close when the underlying action is completed
- `auto_certification.py` closes `cohort_task` items when matching `ActivityLog` rows are detected
- `profile_inbox_sync.py` closes `profile_field_reminder` tasks when fields are populated

**Key API call:**
- `GET /companies/{id}/inbox/tasks`

---

### 5.18 Progress

**Purpose:** Shows an employee's certification readiness across all scored modules.  
**Who:** All roles.  
**Connection to Certification:** The progress dashboard is the pre-certification view — it shows whether an employee is on-track, eligible, or blocked for certification.

**What it shows:**
- Overall score (average of quality_score across all ActivityLog rows)
- Per-module breakdown (employees, compliance, leave, recruitment, training, compensation)
- Dimension averages (completeness, accuracy, timeliness, process_adherence)
- Required tasks per module vs completed
- Recent actions list
- Status: `not_started` / `in_progress` / `failed` / `eligible_for_assessment` / `pending_approval` / `completed`
- Missing required actions highlighted

**Backend:** `GET /companies/{id}/certification/progress/me/dashboard`

---

### 5.19 Analytics

**Purpose:** Aggregated company-wide HR metrics and charts.  
**Who:** All roles **except** `employee` (`HR_NON_EMPLOYEE_ROLES`).

**Features:**
- Dashboard with charts (using Recharts library)
- Month-over-month analytics
- Employee data export (`/analytics/export/employees.csv`)

**Key API calls:**
- `GET /companies/{id}/analytics/dashboard`
- `GET /companies/{id}/analytics/export/employees.csv`

---

### 5.20 Certification

**Purpose:** Learning track definitions, certificate issuance, public verification, and admin approval queue.  
**Who:** All roles view own; admin manages.

Full details in [Section 9](#9-certification-system).

---

### 5.21 Tracking & Scoring (Admin)

**Purpose:** Activity log viewer and scoring rule configuration.  
**Who:** `company_admin` only.

**Features:**
- View all `ActivityLog` rows (company_admin and hr_ops can list all)
- Post manual activity log entries
- View personal score dashboard (recent activity, composite score)
- Configure custom `ScoringRule` rows

**How it works internally:** Full scoring details in [Section 8](#8-performance-measurement-system).

**Key API calls:**
- `POST/GET /companies/{id}/tracking/activity-logs`
- `GET /companies/{id}/tracking/dashboard/score`
- `GET /companies/{id}/tracking/dashboard/recent-activity`
- `POST/GET /companies/{id}/tracking/scoring-rules`

---

### 5.22 Exports

**Purpose:** Download CSV extracts of key datasets.  
**Who:** `company_admin` only.

Available exports:
- `GET /companies/{id}/exports/recruitment/applications.csv`
- `GET /companies/{id}/exports/recruitment/requisitions.csv`
- `GET /companies/{id}/exports/recruitment/offers.csv`
- `GET /companies/{id}/exports/leave/requests.csv`
- `GET /companies/{id}/exports/learning/training-assignments.csv`
- `GET /companies/{id}/exports/learning/training-completions.csv`

---

### 5.23 Members Management

**Purpose:** Manage who has access to the company workspace.  
**Who:** `company_admin` only.

**Features:**
- List all current members with role and status
- Invite new members by email (creates account if not existing + membership)
- Change a member's role
- Deactivate a member (revokes access; keeps historical data)

**Key API calls:**
- `GET /companies/{id}/members`
- `POST /companies/{id}/members/invite`
- `PATCH /companies/{id}/members/{uid}/role`
- `POST /companies/{id}/members/{uid}/deactivate`

---

### 5.24 Webhooks

**Purpose:** Configure outbound HTTP webhooks for domain events.  
**Who:** `company_admin` only.

**Features:**
- Create webhook subscriptions (URL + event types)
- Update/deactivate subscriptions
- Test delivery (sends a test payload to the configured URL)

**How it works internally:**
- `WebhookSubscription`: `url`, `events_json`, `secret`, `status`
- `WebhookDelivery`: log of every delivery attempt with status code
- `deliver_webhooks_for_event()` in `services/webhooks.py` — signs payload with HMAC + delivers
- Triggered via `publish_domain_event_post_commit()` pipeline

**Key API calls:**
- `GET/POST /companies/{id}/webhooks/subscriptions`
- `PATCH /companies/{id}/webhooks/subscriptions/{sid}`
- `POST /companies/{id}/webhooks/subscriptions/{sid}/test`

---

### 5.25 Scenarios (Demo Data)

**Purpose:** Generate bulk demo/training data for a company workspace.  
**Who:** `company_admin` only.  
**Key API call:** `POST /companies/{id}/scenarios/generate`  
**Implementation:** `scenario_generator.py` — `run_scenario()` creates employees, leave records, training assignments, etc.

---

## 6. User Flows

### 6.1 New Company Onboarding Flow

```
1. Platform admin exists (seeded at startup)
2. New user registers at /register (POST /auth/register)
3. User submits company registration request at /register-company
   (POST /company-registration-requests)
4. Platform admin reviews at /platform → approves
   (POST /platform/company-registration-requests/{id}/approve)
   → Company created + requester gets company_admin membership
5. Company admin logs in, lands at /company/{id}/org
6. Admin seeds org structure:
   - Creates departments (POST /companies/{id}/departments)
   - Creates locations
   - Creates job catalog entries
   - Creates positions (org chart chairs)
7. Admin invites team members (POST /companies/{id}/members/invite)
8. Members register (if new) or log in → membership activated
9. Admin creates employees (POST /companies/{id}/employees)
   → Inbox tasks generated for onboarding checklist
10. Employees complete profiles and documents
```

### 6.2 Recruitment Flow

```
1. Recruiter creates Requisition (POST /recruitment/requisitions)
   → req_code auto-generated (e.g. REQ-001)
2. Recruiter submits for approval via Workflow
   (POST /workflow-instances linking entity_type=requisition)
3. Company admin approves workflow
   → Requisition.status = "approved"
4. Recruiter creates Job Posting linked to requisition
   (POST /recruitment/postings, is_public=true)
5. External candidate applies via public URL using req_code
   (POST /recruitment/public-apply/REQ-001)
   → Auto-creates user account if needed
   → Creates Application row
6. Recruiter moves application through pipeline stages
   (PATCH /recruitment/applications/{id}/stage)
7. Interview scheduled (POST /applications/{id}/interviews)
8. Offer created (POST /recruitment/offers)
   → Offer webhook fires to external URL if configured
9. Candidate responds: accept (PATCH /offers/{id}/respond)
10. Recruiter converts offer to employee
    (POST /offers/{id}/convert-to-employee)
    → Employee record created with data from offer
```

### 6.3 Leave Request Flow

```
Employee:
1. Opens Leave request page
2. Submits leave (POST /leave/requests): type, dates, reason
3. Status = "pending"
4. Notification/inbox update if configured

HR Ops:
5. Opens Leave approvals page → sees pending queue
6. Approves or rejects (PATCH /leave/requests/{id}/decision)
   → ActivityLog row created (module=leave, action=approved/rejected)
   → SLA 24 hours measured from request creation
   → Scoring computed for the HR action
7. Employee's leave balance updated
```

### 6.4 Payroll Run Flow

```
Compensation Analyst / Admin:
1. Configures Grade Bands (POST /payroll/grade-bands)
2. Creates Salary Structures per grade (POST /payroll/salary-structures)
   → components_json: {ctc_annual, bonus_pct_of_ctc}
3. Creates Pay Run for a period (POST /payroll/pay-runs)
4. Adds employees to pay run (POST pay run employee lines)
5. Validates calculation:
   → GET /payroll/engine-expected → SimCash engine computes expected values
   → POST /payroll/validate-calculation → submits actuals
   → Engine checks tolerance (₹0.50 default)
6. Runs reconciliation (POST /payroll/validate-reconciliation)
7. Finalizes pay run → Payslips generated
8. Employees view payslips at payroll?tab=payslips
```

### 6.5 Performance Review Cycle Flow

```
HR Ops / Admin:
1. Creates review cycle (POST /performance/review-cycles)
   → name, period, goals_deadline, KPI definitions
   → Notifications sent to all employees with managers
   → Peer review notifications sent simultaneously
2. Employees submit goals (POST /review-cycles/{id}/submit-my-goals)
3. Employees nominate peer reviewers (POST /submit-peer-review-nominations)
   → Up to 3 from "works-with" cohort
4. Nominated peers submit feedback (POST /submit-peer-feedback)
5. HR tracks goal submissions (GET /goal-cycle-tracking)
6. HR conducts assessments (POST /assessments)
7. If underperformance: HR creates PIP (POST /pips)
8. Employees/managers monitor at-risk list (GET /pips/at-risk-employees)
```

### 6.6 Certification Flow

```
Employee:
1. Opens Progress page → sees dashboard status
   → GET /certification/progress/me/dashboard
2. Takes HR actions (leave approvals, document uploads, etc.)
   → Each action logs ActivityLog row via log_tracked_hr_action()
   → Scoring computed: composite_score(completeness, accuracy, timeliness, process_adherence)
3. Once minimums met:
   → auto_certification.py detects eligibility
   → Creates Certificate with approval_status = "pending_approval"
   → OR employee manually requests certificate (POST /certification/certificates/issue)
4. Certificate appears in pending queue (GET /certification/certificates/pending)

Admin:
5. Reviews pending certificates (GET /certification/certificates/pending)
6. Approves certificate (POST /certification/certificates/{id}/approve)
   → approval_status = "approved"
   → CertProgress.status = "completed"
   → Domain event "certificate.approved" published

Employee:
7. Downloads PDF (GET /certification/certificates/{id}/pdf)
8. Shares public verification link: GET /certificates/verify/{verification_id}
```

---

## 7. How Tasks Are Assigned

Tasks reach users through three channels:

### 7.1 Inbox Tasks (Automated System Tasks)

Generated by the backend automatically when conditions are met:

| Task Type | Trigger | Auto-closes when |
|-----------|---------|-----------------|
| `profile_field_reminder` | Employee record created with empty fields | Field is populated via profile update |
| `document_reminder` | Document slot created but not uploaded | Document uploaded |
| `cohort_task` | Certification track assigned to user's role | Matching `ActivityLog` row found by `auto_certification.py` |
| `review_cycle_goals` | Review cycle created by HR | Employee submits goals |
| `review_cycle_peer_review` | Review cycle peer review phase started | — |

**Service flow:** `employee_document_sync.py` → creates `InboxTask` rows → `auto_certification.py` closes matching tasks as actions are logged.

### 7.2 Training Assignments

Created by L&D managers or admins:
- `POST /companies/{id}/learning/training-assignments`
- Links employee(s) to a course with due date and mandatory flag
- Employee sees assignments in **Learning assignments** page
- Late mandatory assignments generate a nudge score via `training_assigner_late_mandatory_nudge()`

### 7.3 Notifications

In-app notifications generated at specific lifecycle events:
- Review cycle created → all employees with managers
- Peer review phase → all eligible employees  
- Other system events via `publish_domain_event_post_commit()` → `Notification` rows

Notifications appear in the top-bar bell icon (`NotificationsPanel.tsx`).

---

## 8. Performance Measurement System

HworkR has a **built-in HR activity scoring engine** that measures how well HR professionals perform their tasks. It is used to gate certification eligibility.

### 8.1 Scoring Architecture

Every significant HR action calls `log_tracked_hr_action()` from `services/activity_tracking.py`. This:
1. Computes quality factors for the action
2. Applies SLA-based timeliness scoring
3. Writes an `ActivityLog` row
4. Optionally triggers `check_and_auto_issue()` for certification

### 8.2 Quality Dimensions

Each action is scored on 4 dimensions (0–100 scale):

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| `completeness` | 25% | Were all required fields populated? |
| `accuracy` | 30% | Was the data correct/valid? |
| `timeliness` | 20% | Was the action taken within SLA? |
| `process_adherence` | 25% | Were proper workflows/steps followed? |

**Composite score formula:**
```
quality_score = (completeness × 0.25) + (accuracy × 0.30) + (timeliness × 0.20) + (process_adherence × 0.25)
```

Default quality factors when not explicitly provided: `{completeness: 85, accuracy: 85, timeliness: 90, process_adherence: 85}` → default composite ≈ **86.25**.

### 8.3 SLA Map (Timeliness Thresholds)

| Module | Action | SLA |
|--------|--------|-----|
| employees | create | 2 days |
| employees | update | 1 day |
| employees | update_profile | 12 hours |
| employees | document_upload | 2 days |
| employees | onboarding_update | 1 day |
| employees | lifecycle_transfer | 3 days |
| employees | lifecycle_promotion | 5 days |
| employees | lifecycle_termination | 3 days |
| employees | lifecycle_rehire | 5 days |
| compliance | policy_created | 3 days |
| compliance | policy_acknowledged | 14 days |
| compliance | policy_downloaded | 2 days |
| leave | create (request intake) | 8 hours |
| leave | approved | 1 day |
| leave | rejected | 1 day |
| leave | policy_create | 2 days |
| leave | balance_upsert | 1 day |
| leave | attendance_recorded | 1 day |
| leave | holiday_create | 2 days |
| certification | issue | 7 days |

If action is within SLA → timeliness = 100. If beyond → timeliness degrades proportionally. If no reference timestamp → timeliness = 95.

### 8.4 Scored Modules

`ActivityLog.module` must be one of these to count toward certification progress:

| Module Key | Display Label |
|------------|--------------|
| `employees` | Employee |
| `compliance` | Audit |
| `leave` | Leave |
| `recruitment` | Recruitment |
| `training` | Learning |
| `compensation` | Compensation |

### 8.5 Score Dashboard

Available at `GET /companies/{id}/tracking/dashboard/score`:
- Overall composite score (average of all `quality_score` values)
- Recent activity list

---

## 9. Certification System

HworkR includes a full certificate issuance, approval, and public verification system.

### 9.1 Certification Tracks

A `CertTrack` defines the requirements for certification at a given role and level:
- `role_type`: maps to company membership role (e.g. `hr_ops`, `employee`)
- `level`: e.g. `associate`, `professional`, `expert`
- `name`: display name
- `min_score`: minimum overall score required
- `requirements_json`: custom overrides for `min_tasks_per_module`, `min_actions_count`, `required_action_keys`, `disallow_critical_failures`

A **default track is auto-created** per role when needed via `cohort_assignment.py` → `get_or_create_default_track()`.

### 9.2 Minimum Requirements by Role

| Role | Modules Required | Minimum Tasks per Module | Minimum Score |
|------|-----------------|--------------------------|---------------|
| `hr_ops` | employees: 3, compliance: 2, leave: 3 | As listed | 75.0 |
| `talent_acquisition` | recruitment: 4, employees: 2 | As listed | 75.0 |
| `ld_performance` | training: 4, employees: 2 | As listed | 75.0 |
| `compensation_analytics` | compensation: 4, employees: 2 | As listed | 75.0 |
| `company_admin` | employees: 3, compliance: 2, leave: 2, recruitment: 2, training: 2, compensation: 2 | As listed | 80.0 |
| `employee` | employees: 1, compliance: 1, leave: 1 | As listed | 65.0 |
| Default (fallback) | employees: 2, compliance: 1, leave: 1 | As listed | 70.0 |

### 9.3 Certificate Lifecycle

```
ActivityLog rows accumulate
    ↓
auto_certification.py checks eligibility after each logged action
    ↓
If eligible → Certificate created (approval_status = "pending_approval")
    ↓
OR manual issue: POST /certification/certificates/issue
    ↓
company_admin reviews pending queue
    ↓
POST /certification/certificates/{id}/approve
    → approval_status = "approved"
    → CertProgress.status = "completed"
    ↓
Employee downloads PDF: GET /certification/certificates/{id}/pdf
    → PDF generated with fpdf2 (company logo, recipient name, track name, level, score, verification ID)
    ↓
Public verification link: GET /certificates/verify/{verification_id}
    → Returns JSON or renders HTML page or PDF (no auth required)
```

### 9.4 Certificate Issuance Rules (enforced by `certification_rules.py`)

When NOT issued by `company_admin` (who bypasses all checks):
1. Check `min_tasks_per_module` — each required module must have enough ActivityLog rows
2. Check `min_score` — proposed score must meet role-minimum AND track-specific minimum
3. Check `min_actions_count` and `required_action_keys` (from `CertProgress.completed_actions_json`)
4. Check `disallow_critical_failures` (default: true) — any ActivityLog with `context_json.critical_failure = true` blocks issuance

### 9.5 Progress Dashboard Status States

| Status | Condition |
|--------|-----------|
| `not_started` | No ActivityLog rows found |
| `failed` | One or more critical failure logs |
| `completed` | Approved certificate exists |
| `pending_approval` | Pending certificate exists |
| `eligible_for_assessment` | All module tasks met AND score >= minimum |
| `in_progress` | Has activity but not yet eligible |

---

## 10. Who Connects to Whom and For What

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PLATFORM LAYER                               │
│  Platform Admin ─── reviews ──→ Company Registration Requests       │
│  Platform Admin ─── approves/rejects ──→ Company creation           │
└─────────────────────────────────────────────────────────────────────┘
                                │ company created
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      COMPANY WORKSPACE                              │
│                                                                     │
│  Company Admin                                                      │
│    ├── invites ──→ Members (sets roles)                             │
│    ├── approves ──→ Requisitions (via workflow)                     │
│    ├── approves ──→ Certificates (pending queue)                    │
│    ├── configures ──→ Org structure (dept/positions/locations)      │
│    ├── configures ──→ Payroll (grades/salary structures)            │
│    └── manages ──→ Webhooks, Exports, Tracking, Scenarios, SSO      │
│                                                                     │
│  HR Ops                                                             │
│    ├── manages ──→ Employee records & lifecycle                     │
│    ├── approves ──→ Leave requests (from employees)                 │
│    ├── tracks ──→ Leave balances (all employees)                    │
│    ├── runs ──→ Performance review cycles                           │
│    ├── creates ──→ PIPs for at-risk employees                       │
│    └── publishes ──→ Policy documents (employees acknowledge)       │
│                                                                     │
│  Talent Acquisition                                                 │
│    ├── creates ──→ Requisitions → sends to workflow                 │
│    ├── creates ──→ Job postings (visible to candidates)             │
│    ├── moves ──→ Applications through pipeline stages              │
│    ├── schedules ──→ Interviews (with candidates)                   │
│    └── creates ──→ Offers (sent to candidates)                      │
│                                                                     │
│  L&D Manager                                                        │
│    ├── creates ──→ Courses in catalog                               │
│    ├── assigns ──→ Training to employees (with deadlines)           │
│    └── monitors ──→ Training scores per employee/course             │
│                                                                     │
│  Compensation Analyst                                               │
│    ├── configures ──→ Salary structures and grade bands             │
│    ├── runs ──→ Pay runs (generates payslips for employees)         │
│    ├── manages ──→ Benefits plans and enrollments                   │
│    └── validates ──→ Payroll calculation vs SimCash engine          │
│                                                                     │
│  Employee                                                           │
│    ├── reads ──→ Policy documents (acknowledges)                    │
│    ├── submits ──→ Leave requests (to HR Ops)                       │
│    ├── applies ──→ Job postings (via Candidate portal)              │
│    ├── receives/responds ──→ Offers (from TA)                       │
│    ├── completes ──→ Training assignments (from L&D)                │
│    ├── submits ──→ Goals (for HR Ops/Admin review cycles)           │
│    ├── nominates ──→ Peer reviewers (from works-with cohort)        │
│    ├── gives ──→ Peer feedback (to nominated peers)                 │
│    ├── views ──→ Payslips (generated by Compensation)               │
│    ├── responds to ──→ Surveys (created by HR/Admin)                │
│    └── earns ──→ Certificate (approved by Admin)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                     ↑ real-time events ↑
              WebSocket /ws/companies/{id}?token=JWT
```

---

## 11. Technical Architecture

### 11.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend language** | Python | 3.11+ |
| **Backend framework** | FastAPI | 0.115.6 |
| **ASGI server** | Uvicorn [standard] | 0.34.0 |
| **ORM** | SQLAlchemy | 2.0.36 |
| **Validation** | Pydantic | 2.10.3 |
| **Settings** | pydantic-settings | 2.6.1 |
| **Database (primary)** | PostgreSQL | Any modern version |
| **Database (dev fallback)** | SQLite | Built-in |
| **Database driver** | psycopg2-binary | >=2.9 |
| **Auth** | python-jose [cryptography] | 3.3.0 |
| **Password hashing** | passlib (pbkdf2_sha256) | 1.7.4 |
| **File upload** | python-multipart | 0.0.20 |
| **Email validation** | email-validator | 2.2.0 |
| **HTTP client** | httpx | 0.28.1 |
| **PDF generation** | fpdf2 | 2.8.2 |
| **AI embeddings** | google-cloud-aiplatform | >=1.70 |
| **Vector database** | chromadb | >=0.5 |
| **Tokenizer** | tiktoken | >=0.8 |
| **PDF parsing** | pypdf | >=5 |
| **Testing** | pytest | 8.3.4 |
| **Frontend framework** | React | 18.3.1 |
| **Frontend language** | TypeScript | ~5.6.3 |
| **Build tool** | Vite | 5.4.11 |
| **Routing** | react-router-dom | 6.28.0 |
| **Charting** | recharts | 3.8.1 |
| **Toasts** | react-toastify | 11.0.5 |
| **PDF (frontend)** | jspdf + html-to-image | 2.5.2 + 1.11.13 |
| **Testing (frontend)** | vitest + @testing-library/react | 2.1.6 + 16.0.1 |

### 11.2 Repository Structure

```
HworkR/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, static mounts, lifespan
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # Engine, session, init_db, seeds
│   │   ├── scoring_rules.py     # All scoring constants (edit to tune)
│   │   ├── api/
│   │   │   ├── deps.py          # FastAPI dependencies (auth, RBAC)
│   │   │   └── v1/              # All routers (one file per module)
│   │   ├── core/
│   │   │   └── security.py      # JWT, password hash
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── services/            # Business logic
│   │   │   └── scoring_engine/  # Scoring factor computation per module
│   │   └── assets/branding/     # Static branding assets
│   ├── scripts/
│   │   └── ingest_legal_docs.py # One-time legal corpus ingestion
│   ├── data/
│   │   └── legal/india/         # Legal PDF corpus
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.tsx             # Entry point, providers
│   │   ├── App.tsx              # Route definitions
│   │   ├── auth/
│   │   │   └── AuthContext.tsx  # Auth state, token management
│   │   ├── company/
│   │   │   ├── companyAccess.ts # RBAC path guard logic
│   │   │   └── navConfig.ts     # Sidebar nav definition
│   │   ├── api/                 # All REST helpers (26 modules)
│   │   ├── components/          # Shared UI components
│   │   ├── context/             # React contexts
│   │   ├── hooks/               # Custom hooks (WebSocket, etc.)
│   │   └── pages/               # All page components (100 files)
│   ├── package.json
│   └── vite.config.ts
├── documentation/
│   ├── PRODUCT_OVERVIEW.md
│   └── TECHNICAL_SPECIFICATION.md
├── docs/                        # Implementation specs
├── README.md
└── HworkR_Deployment_Guide.md
```

### 11.3 Authentication Flow

```
1. POST /auth/register → {name, email, password}
   → password hashed with pbkdf2_sha256 (passlib)
   → User row created

2. POST /auth/login → {username: email, password}
   → password verified
   → JWT created: HS256, payload {sub: user_id}, exp = ACCESS_TOKEN_EXPIRE_MINUTES

3. All authenticated requests:
   → Authorization: Bearer <token>
   → OAuth2PasswordBearer extracts token
   → decode_token() → payload
   → User looked up by id
   → CompanyMembership checked for company-scoped routes

4. Frontend stores token in localStorage under key "hworkr_token"
5. Token included in every apiFetch() call automatically
6. WebSocket: token passed as query param ?token=<jwt>
```

### 11.4 Multi-Tenancy Model

- Each `Company` is a fully isolated tenant
- `CompanyMembership` is the join table: `user_id` + `company_id` + `role` + `status`
- Every resource row has `company_id` — queries always filter by it
- A user can belong to multiple companies (distinct memberships)
- Platform admin is a boolean flag on `User` (not a membership role)

### 11.5 Data Flow: Action → Score → Certificate

```
HR action performed (e.g. leave approved)
    ↓
Router calls log_tracked_hr_action(db, company_id, user_id, role, module, action_type, ...)
    ↓
scoring_engine/{module}.py computes quality_factors dict
    → completeness: checks field population
    → accuracy: checks validity/consistency
    → timeliness: compares elapsed time vs SLA_SECONDS_BY_ACTION[module][action_type]
    → process_adherence: checks workflow steps followed
    ↓
composite_score(factors) = weighted sum → quality_score (0-100)
    ↓
ActivityLog row inserted:
    {company_id, user_id, module, action_type, action_detail,
     entity_type, entity_id, quality_score, quality_factors_json, context_json}
    ↓
check_and_auto_issue(db, company_id, user_id) called
    → closes matching cohort InboxTask rows
    → checks eligibility against CERT_MIN_TASKS_PER_MODULE_BY_ROLE
    → if eligible: Certificate created (approval_status = "pending_approval")
    ↓
Domain event published: publish_domain_event_post_commit()
    → enqueue_company_event() → WebSocket broadcast
    → deliver_webhooks_for_event() → outbound HTTP POST
```

### 11.6 Real-Time Architecture

```
HTTP request completes in sync thread
    ↓
publish_domain_event_post_commit() called post-commit
    ↓
enqueue_company_event() → thread-safe queue
    ↓
drain_sync_events_to_websockets() task (runs in asyncio event loop)
    → reads from queue
    → WebSocketHub.broadcast(company_id, event_json)
    → each connected client subscribed to that company_id receives the event
    ↓
Frontend: useCompanyRealtime.ts receives event
    → dispatches to RealtimeEventsContext
    → LiveEventToasts.tsx shows toast
    → NotificationsPanel re-fetches if relevant
```

---

## 12. Database Models

### 12.1 Core / Auth

| Model | Table | Key Fields |
|-------|-------|-----------|
| `User` | `users` | `id`, `name`, `email`, `hashed_password`, `is_platform_admin`, `created_at` |
| `Company` | `companies` | `id`, `name`, `logo_url`, `industry`, `location`, `config_json`, `created_at` |
| `CompanyMembership` | `company_memberships` | `user_id`, `company_id`, `role`, `status` (active/deactivated) |
| `CompanyRegistrationRequest` | `company_registration_requests` | `user_id`, `company_name`, `industry`, `status`, `submitted_at` |

### 12.2 Org Structure

| Model | Table | Key Fields |
|-------|-------|-----------|
| `Department` | `departments` | `company_id`, `name`, `parent_id` |
| `Location` | `locations` | `company_id`, `name`, `country`, `city` |
| `JobCatalogEntry` | `job_catalog` | `company_id`, `title`, `grade`, `family` |
| `OrgRole` | `org_roles` | `company_id`, `name`, `description` |
| `DepartmentOrgRole` | `department_org_roles` | `department_id`, `org_role_id` |
| `Position` | `positions` | `company_id`, `name`, `department_id`, `job_id`, `grade`, `reports_to_position_id`, `works_with_json`, `filled_by_employee_id` |

### 12.3 Employees

| Model | Table | Key Fields |
|-------|-------|-----------|
| `Employee` | `employees` | `company_id`, `user_id`, `employee_code`, `department_id`, `job_id`, `position_id`, `manager_id`, `location_id`, `status`, `hire_date`, `personal_info_json`, `documents_json`, `onboarding_checklist_json` |
| `EmployeeDocument` | `employee_documents` | `employee_id`, `doc_type`, `status`, `file_path`, `uploaded_at` |
| `EmployeeLifecycleEvent` | `employee_lifecycle_events` | `employee_id`, `event_type`, `effective_date`, `notes_json`, `recorded_by` |

### 12.4 HR Operations

| Model | Table | Key Fields |
|-------|-------|-----------|
| `LeavePolicy` | `leave_policies` | `company_id`, `leave_type`, `days_per_year`, `carry_forward_days` |
| `LeaveRequest` | `leave_requests` | `employee_id`, `leave_type`, `start_date`, `end_date`, `status`, `decision_by`, `reason` |
| `LeaveBalance` | `leave_balances` | `employee_id`, `leave_type`, `balance_days`, `year` |
| `AttendanceRecord` | `attendance_records` | `employee_id`, `date`, `status`, `notes` |
| `HolidayCalendar` | `holiday_calendars` | `company_id`, `year`, `holidays_json` |

### 12.5 Performance & Learning

| Model | Table | Key Fields |
|-------|-------|-----------|
| `ReviewCycle` | `review_cycles` | `company_id`, `name`, `start_date`, `end_date`, `goals_deadline`, `status`, `kpi_definitions_json` |
| `ReviewCycleKpiDefinition` | `review_cycle_kpi_definitions` | `cycle_id`, `name`, `weight`, `description` |
| `ReviewCycleEmployeeGoalSubmission` | `review_cycle_employee_goal_submissions` | `cycle_id`, `employee_id`, `goals_json`, `submitted_at` |
| `ReviewCyclePeerNomination` | `review_cycle_peer_nominations` | `cycle_id`, `nominator_employee_id`, `nominee_employee_id` |
| `PeerReviewFeedback` | `peer_review_feedbacks` | `cycle_id`, `reviewer_employee_id`, `reviewee_employee_id`, `feedback_json` |
| `Goal` | `goals` | `company_id`, `employee_id`, `title`, `description`, `due_date`, `status`, `progress` |
| `Assessment` | `assessments` | `company_id`, `employee_id`, `assessor_id`, `period`, `ratings_json`, `comments` |
| `Pip` | `pips` | `company_id`, `employee_id`, `start_date`, `end_date`, `objectives_json`, `status` |
| `Course` | `courses` | `company_id`, `title`, `description`, `video_url`, `duration_minutes`, `category`, `required_score` |
| `TrainingAssignment` | `training_assignments` | `company_id`, `course_id`, `employee_id`, `due_date`, `mandatory`, `status` |
| `TrainingCompletion` | `training_completions` | `assignment_id`, `employee_id`, `completed_at`, `score`, `passed` |
| `SkillProfile` | `skill_profiles` | `company_id`, `employee_id`, `skills_json` |

### 12.6 Compensation & Engagement

| Model | Table | Key Fields |
|-------|-------|-----------|
| `CompensationGradeBand` | `compensation_grade_bands` | `company_id`, `band_name`, `level`, `min_ctc`, `max_ctc` |
| `SalaryStructure` | `salary_structures` | `company_id`, `grade_band_id`, `components_json` (`ctc_annual`, `bonus_pct_of_ctc`) |
| `PayRun` | `pay_runs` | `company_id`, `period_month`, `period_year`, `status` |
| `PayRunEmployeeLine` | `pay_run_employee_lines` | `pay_run_id`, `employee_id`, `salary_structure_id`, `computed_json`, `supplemental_json` |
| `Payslip` | `payslips` | `pay_run_id`, `employee_id`, `payslip_json`, `generated_at` |
| `PayrollLedgerEntry` | `payroll_ledger_entries` | `pay_run_id`, `employee_id`, `entry_type`, `amount`, `description` |
| `BenefitsPlan` | `benefits_plans` | `company_id`, `plan_name`, `plan_type`, `coverage_json`, `cost_json` |
| `BenefitsEnrollment` | `benefits_enrollments` | `employee_id`, `plan_id`, `enrolled_at`, `status` |
| `Survey` | `surveys` | `company_id`, `title`, `questions_json`, `status`, `period` |
| `SurveyResponse` | `survey_responses` | `survey_id`, `employee_id`, `answers_json`, `submitted_at` |
| `SurveyActionPlan` | `survey_action_plans` | `survey_id`, `title`, `owner_id`, `due_date`, `status` |
| `CompensationReviewCycle` | `compensation_review_cycles` | `company_id`, `name`, `period`, `budget_pct`, `status` |
| `CompensationReviewGuideline` | `compensation_review_guidelines` | `cycle_id`, `grade_band_id`, `min_pct`, `max_pct` |
| `CompensationReviewProposal` | `compensation_review_proposals` | `cycle_id`, `employee_id`, `proposed_pct`, `status`, `submitted_by` |

### 12.7 Recruitment

| Model | Table | Key Fields |
|-------|-------|-----------|
| `Requisition` | `requisitions` | `company_id`, `req_code`, `title`, `department_id`, `job_id`, `headcount`, `status`, `hiring_criteria_json` |
| `JobPosting` | `job_postings` | `company_id`, `requisition_id`, `title`, `description_json`, `is_public`, `status` |
| `Application` | `applications` | `posting_id`, `user_id`, `status`, `stage`, `applied_at`, `notes_json` |
| `Interview` | `interviews` | `application_id`, `scheduled_at`, `interviewers_json`, `type`, `feedback_json`, `status` |
| `Offer` | `offers` | `application_id`, `employee_id` (if converted), `salary_json`, `status`, `responded_at`, `response` |

### 12.8 Compliance, Certification & Communication

| Model | Table | Key Fields |
|-------|-------|-----------|
| `PolicyDocument` | `policy_documents` | `company_id`, `title`, `category`, `file_path`, `published_by`, `published_at` |
| `PolicyAcknowledgment` | `policy_acknowledgments` | `policy_id`, `user_id`, `acknowledged_at` |
| `AuditTrailEntry` | `audit_trail_entries` | `company_id`, `user_id`, `entity_type`, `entity_id`, `action`, `changes_json`, `created_at` |
| `CertTrack` | `cert_tracks` | `company_id`, `role_type`, `level`, `name`, `requirements_json`, `min_score` |
| `CertProgress` | `cert_progresses` | `company_id`, `user_id`, `track_id`, `completed_actions_json`, `current_score`, `status`, `started_at` |
| `Certificate` | `certificates` | `company_id`, `user_id`, `track_id`, `level`, `score`, `breakdown_json`, `verification_id` (hex), `approval_status`, `issued_at` |
| `Notification` | `notifications` | `company_id`, `user_id`, `type`, `title`, `message`, `entity_type`, `entity_id`, `read_at` |
| `InboxTask` | `inbox_tasks` | `company_id`, `user_id`, `type`, `title`, `description`, `status`, `context_json` |

### 12.9 Tracking & Integrations

| Model | Table | Key Fields |
|-------|-------|-----------|
| `ActivityLog` | `activity_logs` | `company_id`, `user_id`, `module`, `action_type`, `action_detail`, `entity_type`, `entity_id`, `quality_score`, `quality_factors_json`, `context_json`, `created_at` |
| `ScoringRule` | `scoring_rules` | `company_id`, `module`, `action_type`, `weight_overrides_json`, `description` |
| `WorkflowTemplate` | `workflow_templates` | `company_id`, `name`, `module`, `steps_json`, `conditions_json` |
| `WorkflowInstance` | `workflow_instances` | `template_id`, `company_id`, `entity_type`, `entity_id`, `current_step`, `status`, `initiated_by` |
| `WorkflowAction` | `workflow_actions` | `instance_id`, `step`, `actor_id`, `action`, `comments`, `acted_at` |
| `WebhookSubscription` | `webhook_subscriptions` | `company_id`, `url`, `events_json`, `secret`, `status` |
| `WebhookDelivery` | `webhook_deliveries` | `subscription_id`, `event_type`, `payload_json`, `response_status`, `delivered_at` |
| `ScenarioRun` | `scenario_runs` | `company_id`, `initiated_by`, `params_json`, `status`, `created_at` |

---

## 13. API Endpoints — Complete Reference

**Base prefix:** `/api/v1` (optionally prepended by `API_BASE_PATH` env var)

### Auth

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/auth/register` | No | — |
| POST | `/auth/login` | No | — |
| GET | `/auth/me` | Yes | Any |
| POST | `/auth/change-password` | Yes | Any |
| GET | `/auth/sso/providers` | No | — |
| GET | `/auth/sso/google/authorize` | No | — |
| POST | `/auth/sso/saml/acs` | No | — |
| GET | `/me/companies` | Yes | Any |

### Company Registration

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/company-registration-requests` | Yes | Eligible user |
| GET | `/company-registration-requests/me` | Yes | Any |

### Platform (Platform Admin Only)

| Method | Path |
|--------|------|
| GET | `/platform/companies` |
| GET | `/platform/companies/lookup` |
| GET | `/platform/company-registration-requests` |
| POST | `/platform/company-registration-requests/{id}/approve` |
| POST | `/platform/company-registration-requests/{id}/reject` |

### Organization (Company Admin / HR Ops)

| Method | Path |
|--------|------|
| GET/PATCH | `/companies/{id}` |
| POST | `/companies/{id}/logo` |
| DELETE | `/companies/{id}` |
| GET | `/companies/{id}/members` |
| POST | `/companies/{id}/members/invite` |
| PATCH | `/companies/{id}/members/{uid}/role` |
| POST | `/companies/{id}/members/{uid}/deactivate` |
| GET/POST | `/companies/{id}/departments` |
| GET/POST | `/companies/{id}/locations` |
| GET/POST | `/companies/{id}/job-catalog` |
| GET/POST/PATCH/DELETE | `/companies/{id}/org-roles`, `/{org_role_id}` |
| GET | `/companies/{id}/departments-with-org-roles` |
| POST | `/companies/{id}/departments/{dept_id}/org-roles` |
| DELETE | `/companies/{id}/departments/{dept_id}/org-roles/{org_role_id}` |
| GET/POST | `/companies/{id}/positions` |
| PATCH/DELETE | `/companies/{id}/positions/{position_id}` |
| POST | `/companies/{id}/seed-demo` |

### Employees

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/employees` |
| GET | `/companies/{id}/employees/summary` |
| GET/PATCH | `/companies/{id}/employees/me` |
| GET | `/companies/{id}/employees/me/works-with-peers` |
| GET | `/companies/{id}/employees/me/documents` |
| POST | `/companies/{id}/employees/me/documents/{doc_type}/upload` |
| PATCH | `/companies/{id}/employees/me/documents/{doc_type}` |
| GET | `/companies/{id}/employees/my-direct-reports` |
| GET | `/companies/{id}/employees/{eid}/detail` |
| GET/PATCH | `/companies/{id}/employees/{eid}` |
| PATCH | `/companies/{id}/employees/{eid}/onboarding` |
| POST/GET | `/companies/{id}/employees/{eid}/lifecycle-events` |
| GET/PATCH | `/companies/{id}/employees/{eid}/documents` |
| PATCH | `/companies/{id}/employees/{eid}/documents/{doc_type}` |

### Leave & HR Ops

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/leave/policies` |
| GET/POST | `/companies/{id}/leave/requests` |
| PATCH | `/companies/{id}/leave/requests/{rid}/decision` |
| GET | `/companies/{id}/leave/summary` |
| GET/POST | `/companies/{id}/leave/balances` |
| GET/POST | `/companies/{id}/attendance` |
| GET/POST | `/companies/{id}/holiday-calendars` |

### Audits & Policies

| Method | Path |
|--------|------|
| GET | `/companies/{id}/audits/members/search` |
| GET | `/companies/{id}/audits/trail/categories` |
| GET | `/companies/{id}/audits/trail` |
| GET/POST | `/companies/{id}/audits/policies` |
| GET | `/companies/{id}/audits/policies/{pid}/download` |
| POST | `/companies/{id}/audits/policies/{pid}/acknowledge` |
| GET | `/companies/{id}/audits/policies/{pid}/acknowledgment-detail` |

### Recruitment

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/recruitment/requisitions` |
| PATCH | `/companies/{id}/recruitment/requisitions/{rid}` |
| GET/POST | `/companies/{id}/recruitment/postings` |
| PATCH | `/companies/{id}/recruitment/postings/{pid}` |
| GET/POST | `/companies/{id}/recruitment/applications` |
| PATCH | `/companies/{id}/recruitment/applications/{aid}/stage` |
| GET | `/companies/{id}/recruitment/application-activity` |
| GET/POST | `/companies/{id}/recruitment/applications/{aid}/interviews` |
| GET/PATCH | `/companies/{id}/recruitment/interviews/{iid}` |
| GET | `/companies/{id}/recruitment/interviews` |
| GET/POST | `/companies/{id}/recruitment/offers` |
| PATCH | `/companies/{id}/recruitment/offers/{oid}/respond` |
| POST | `/companies/{id}/recruitment/offers/{oid}/convert-to-employee` |
| GET | `/companies/{id}/recruitment/candidate/open-postings` |
| GET | `/companies/{id}/recruitment/candidate/my-applications` |
| GET | `/companies/{id}/recruitment/candidate/my-offers` |
| GET | `/companies/{id}/recruitment/candidate/offers/{oid}` |
| GET | `/companies/{id}/recruitment/candidate/applications/{aid}/interviews` |
| POST | `/recruitment/public-apply/{req_code}` (no company prefix, no auth) |

### Workflows

| Method | Path |
|--------|------|
| GET | `/companies/{id}/workflow-templates` |
| POST | `/companies/{id}/workflow-instances` |
| GET | `/companies/{id}/workflow-instances` |
| POST | `/companies/{id}/workflow-instances/{iid}/actions` |
| GET | `/companies/{id}/workflow-instances/{iid}/actions` |

### Performance & Learning

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/performance/review-cycles` |
| GET | `/companies/{id}/performance/review-cycles/{cid}/kpi-definitions` |
| GET | `/companies/{id}/performance/review-cycles/{cid}/goal-cycle-tracking` |
| GET | `/companies/{id}/performance/my-review-cycle-goals` |
| GET | `/companies/{id}/performance/my-pending-peer-feedback-requests` |
| GET | `/companies/{id}/performance/my-peer-review-cycles` |
| POST | `/companies/{id}/performance/review-cycles/{cid}/submit-peer-review-nominations` |
| POST | `/companies/{id}/performance/review-cycles/{cid}/submit-peer-feedback` |
| POST | `/companies/{id}/performance/review-cycles/{cid}/submit-my-goals` |
| GET/POST | `/companies/{id}/performance/goals` |
| PATCH | `/companies/{id}/performance/goals/{gid}` |
| POST/GET | `/companies/{id}/performance/assessments` |
| GET | `/companies/{id}/performance/pips/at-risk-employees` |
| POST/GET | `/companies/{id}/performance/pips` |
| GET/POST | `/companies/{id}/learning/courses` |
| GET/POST | `/companies/{id}/learning/training-assignments` |
| POST | `/companies/{id}/learning/training-completions` |
| GET | `/companies/{id}/learning/courses/{cid}/employee-scores` |
| GET | `/companies/{id}/learning/employee-suggestions` |
| GET | `/companies/{id}/learning/skill-profiles/{eid}` |
| PUT | `/companies/{id}/learning/skill-profiles/{eid}` |

### Compensation & Engagement

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/payroll/grade-bands` |
| GET | `/companies/{id}/payroll/grade-bands/audit` |
| PATCH | `/companies/{id}/payroll/grade-bands/{bid}` |
| GET/POST | `/companies/{id}/payroll/salary-structures` |
| GET | `/companies/{id}/payroll/salary-structures/audit` |
| PATCH | `/companies/{id}/payroll/salary-structures/{sid}` |
| GET/POST | `/companies/{id}/payroll/pay-runs` |
| GET | `/companies/{id}/payroll/pay-runs/period-overview` |
| PATCH | `/companies/{id}/payroll/pay-runs/{prid}` |
| GET | `/companies/{id}/payroll/payslips` |
| GET | `/companies/{id}/payroll/payslips/{psid}/ledger-entries` |
| GET | `/companies/{id}/payroll/engine-expected` |
| POST | `/companies/{id}/payroll/validate-calculation` |
| GET | `/companies/{id}/payroll/reconciliation-expected` |
| POST | `/companies/{id}/payroll/validate-reconciliation` |
| GET/POST | `/companies/{id}/benefits/plans` |
| PATCH/DELETE | `/companies/{id}/benefits/plans/{pid}` |
| GET/POST | `/companies/{id}/benefits/enrollments` |
| PATCH | `/companies/{id}/benefits/enrollments/{eid}` |
| GET | `/companies/{id}/benefits/enrollment-summary` |
| GET/POST | `/companies/{id}/engagement/surveys` |
| GET | `/companies/{id}/engagement/survey-templates` |
| POST | `/companies/{id}/engagement/survey-responses` |
| PATCH/DELETE | `/companies/{id}/engagement/surveys/{sid}` |
| GET/POST | `/companies/{id}/engagement/surveys/{sid}/action-plans` |
| GET | `/companies/{id}/engagement/my-action-plans` |
| PATCH | `/companies/{id}/engagement/action-plans/{aid}` |

### Compensation Review (Merit)

| Method | Path |
|--------|------|
| GET/POST | `/companies/{id}/compensation/review-cycles` |
| PATCH | `/companies/{id}/compensation/review-cycles/{cid}` |
| GET/POST | `/companies/{id}/compensation/review-cycles/{cid}/guidelines` |
| PATCH/DELETE | `/companies/{id}/compensation/review-cycles/{cid}/guidelines/{gid}` |
| GET/POST | `/companies/{id}/compensation/review-cycles/{cid}/proposals` |
| PATCH | `/companies/{id}/compensation/review-cycles/{cid}/proposals/{pid}` |
| POST | `/companies/{id}/compensation/review-cycles/{cid}/proposals/{pid}/submit` |
| POST | `/companies/{id}/compensation/review-cycles/{cid}/proposals/{pid}/approve` |
| POST | `/companies/{id}/compensation/review-cycles/{cid}/proposals/{pid}/reject` |
| GET | `/companies/{id}/compensation/review-cycles/{cid}/budget-summary` |
| POST | `/companies/{id}/compensation/review-cycles/{cid}/apply-approved` |

### Tracking, Analytics, Certification, Comms, Admin

| Method | Path |
|--------|------|
| POST/GET | `/companies/{id}/tracking/activity-logs` |
| GET | `/companies/{id}/tracking/dashboard/score` |
| GET | `/companies/{id}/tracking/dashboard/recent-activity` |
| POST/GET | `/companies/{id}/tracking/scoring-rules` |
| GET | `/companies/{id}/analytics/dashboard` |
| GET | `/companies/{id}/analytics/export/employees.csv` |
| POST | `/companies/{id}/certification/tracks` |
| GET | `/companies/{id}/certification/tracks` |
| GET/PUT | `/companies/{id}/certification/progress/me` |
| GET | `/companies/{id}/certification/progress/me/dashboard` |
| POST | `/companies/{id}/certification/certificates/issue` |
| GET | `/companies/{id}/certification/certificates/me` |
| GET | `/companies/{id}/certification/certificates/pending` |
| GET | `/companies/{id}/certification/certificates/verify/{vid}` |
| GET | `/companies/{id}/certification/certificates/{cid}/pdf` |
| POST | `/companies/{id}/certification/certificates/{cid}/approve` |
| GET | `/certificates/verify/{vid}` (public, no company) |
| GET | `/certificates/verify/{vid}/page` (public HTML) |
| GET | `/certificates/verify/{vid}/pdf` (public PDF) |
| GET | `/companies/{id}/notifications` |
| POST | `/companies/{id}/notifications/mark-read` |
| GET | `/companies/{id}/inbox/tasks` |
| POST | `/companies/{id}/legal/chat` |
| GET/POST | `/companies/{id}/webhooks/subscriptions` |
| PATCH | `/companies/{id}/webhooks/subscriptions/{sid}` |
| POST | `/companies/{id}/webhooks/subscriptions/{sid}/test` |
| GET | `/companies/{id}/exports/recruitment/applications.csv` |
| GET | `/companies/{id}/exports/recruitment/requisitions.csv` |
| GET | `/companies/{id}/exports/recruitment/offers.csv` |
| GET | `/companies/{id}/exports/leave/requests.csv` |
| GET | `/companies/{id}/exports/learning/training-assignments.csv` |
| GET | `/companies/{id}/exports/learning/training-completions.csv` |
| POST | `/companies/{id}/scenarios/generate` |

### Non-API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check (no auth) |
| WS | `/ws/companies/{id}?token=JWT` | Real-time company events |
| GET | `/uploads/...` | Static file serving (uploads) |
| GET | `/branding-assets/...` | Static branding images |
| GET | `/docs` | Swagger UI (when enabled) |
| GET | `/redoc` | ReDoc (when enabled) |
| GET | `/openapi.json` | OpenAPI schema |

---

## 14. Frontend Routes & RBAC

### 14.1 Public Routes

| Path | Component | Auth Required |
|------|-----------|--------------|
| `/login` | `LoginPage` | No |
| `/register` | `RegisterPage` | No |

### 14.2 Authenticated (Non-Company) Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `HomePage` | Company picker or redirect to org if single company |
| `/register-company` | `RegisterCompanyPage` | Submit registration request |
| `/platform` | `PlatformCompaniesPage` | `is_platform_admin` only |

### 14.3 Company Workspace Routes

All under `/company/:companyId/` — wrapped in `CompanyAuthorizedOutlet` (RBAC guard).

| Path Segment | Component | Minimum Role |
|--------------|-----------|-------------|
| `` (index) | `WorkspaceDashboardPage` | All |
| `org` | `CompanyOrgPage` | All |
| `my-profile` | `MyProfilePage` | `employee`, `hr_ops` |
| `my-goals` | `EmployeeMyGoalsPage` | `employee`, `hr_ops` |
| `my-goals/peer-review` | `PeerReviewPage` | `employee`, `hr_ops` |
| `team-goals` | `ManagerTeamGoalsPage` | `employee` (with reports), `hr_ops` |
| `employees/profile` | `EmployeesPage` (profile tab) | `company_admin`, `hr_ops` |
| `employees/lifecycle` | `EmployeesPage` (lifecycle tab) | `company_admin`, `hr_ops` |
| `employees/:eid` | `EmployeeDetailPage` | `company_admin`, `hr_ops` |
| `leave/policies` | `LeavePoliciesPage` | All |
| `leave/holidays` | `LeaveHolidaysPage` | All |
| `leave/request` | `LeaveRequestPage` | All |
| `leave/approvals` | `LeaveApprovalsPage` | `hr_ops` only |
| `leave/balances` | `LeaveBalancesPage` | `hr_ops` only |
| `audits/trail` | `AuditTrailPage` | All |
| `audits/policies` | `AuditsPoliciesPage` | All (publish tab: admin + hr_ops) |
| `members` | `MembersPage` | `company_admin` only |
| `hr-ops` | `HrOpsPage` | `company_admin` only |
| `workflows` | `WorkflowsPage` | `company_admin`, `talent_acquisition` |
| `workflows/:iid` | `WorkflowInstancePage` | `company_admin`, `talent_acquisition` |
| `recruitment` | `RecruitmentPage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/postings` | `JobPostingsPage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/pipeline` | `CandidatePipelinePage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/interviews` | `InterviewsPage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/offers` | `OffersPage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/candidate-portal` | `CandidatePortalPage` | `company_admin`, `talent_acquisition`, `employee` |
| `recruitment/tracking` | `CandidateTrackingPage` | `company_admin`, `talent_acquisition`, `employee` |
| `performance` | `PerformancePage` | `company_admin`, `hr_ops` |
| `learning/assignments` | `TrainingAssignmentsPage` | All |
| `learning/catalog` | `CourseCatalogPage` | `company_admin`, `ld_performance` |
| `learning/scores` | `TrainingScoresPage` | `company_admin`, `ld_performance` |
| `payroll` (all tabs) | `PayrollPage` | All (config tabs: admin + comp_analytics) |
| `benefits` (all tabs) | `BenefitsPage` | All (plans/enrollments: admin + comp_analytics; My Benefits: employee) |
| `surveys` (all tabs) | `SurveysPage` | All (responses/trends/action-plans admin: admin + hr_ops) |
| `legal` | `LegalPage` | All |
| `inbox` | `InboxPage` | All |
| `progress` | `ProgressPage` | All |
| `analytics` | `AnalyticsPage` | All except `employee` |
| `certification` | `CertificationPage` | All |
| `exports` | `ExportsPage` | `company_admin` only |
| `webhooks` | `WebhooksPage` | `company_admin` only |
| `scenarios` | `ScenariosPage` | `company_admin` only |
| `tracking` | `TrackingPage` | `company_admin` only |
| `integrations/sso` | `SsoPage` | `company_admin` only |

---

## 15. Real-Time & WebSocket

### Connection

```
ws://host/ws/companies/{company_id}?token=<jwt>
```

**Auth:** JWT validated server-side. Active membership in the company required. Connection rejected otherwise.

### Event Flow

1. Backend completes a mutation (e.g. offer created, certificate approved)
2. `publish_domain_event_post_commit(company_id, event_type, entity_type, entity_id, actor_user_id, data)` called post-commit
3. `enqueue_company_event()` pushes to thread-safe asyncio queue
4. `drain_sync_events_to_websockets()` background task reads queue and calls `WebSocketHub.broadcast()`
5. All WebSocket clients subscribed to `company_id` receive the event JSON
6. Frontend `useCompanyRealtime.ts` hook receives and dispatches to `RealtimeEventsContext`
7. `LiveEventToasts.tsx` renders toast notification
8. Panels that need live updates re-fetch data

### Event Types Published

- `certificate.issued`
- `certificate.approved`
- (other domain events from `publish_domain_event_post_commit` calls throughout routers)

### Frontend WebSocket Hook

`src/hooks/useCompanyRealtime.ts` implements:
- Automatic reconnect with exponential backoff
- WS URL derived from `VITE_API_BASE` (replaces `http`/`https` with `ws`/`wss`)
- Token passed as query parameter

---

## 16. Payroll Engine (SimCash)

HworkR includes a custom **Indian CTC payroll calculation engine** called SimCash (currency: ₹S — SimCash).

### 16.1 CTC Breakdown Components

Given `ctc_annual` (total cost to company per year) and `bonus_pct_of_ctc`:

| Component | Formula |
|-----------|---------|
| Basic | CTC × 45% |
| HRA | Basic × 50% |
| Conveyance | ₹1,600/year |
| Medical | ₹1,250/year |
| LTA | ₹2,500/year |
| Performance bonus | CTC × bonus_pct_of_ctc |
| Special allowance | CTC − (Basic + HRA + Conveyance + Medical + LTA + Bonus + Employer contributions) |
| Gross monthly | (Basic + HRA + Conveyance + Medical + LTA + Special + Bonus) / 12 |

### 16.2 Deductions

| Deduction | Formula |
|-----------|---------|
| PF employee | Basic monthly × 12% |
| ESI employee | Gross monthly × 0.75% (if gross ≤ ₹1,750/month) |
| Professional tax | ₹200/year |
| TDS | 30% of taxable income (after standard deduction ₹4,167/year) |
| Standard deduction | ₹4,167/year |
| Loan recovery | Configurable per pay run |
| Leave deduction | Configurable per pay run |
| Other deductions | Configurable per pay run |

### 16.3 Employer Contributions

| Component | Rate |
|-----------|------|
| PF employer | Basic × 12% |
| ESI employer | Gross × 3.25% (if applicable) |
| Gratuity | Basic × 4.81% |

### 16.4 Validation

HR submits payroll figures → backend calls `SimCashMonthly` calculations → checks each field against submitted value within `DEFAULT_TOLERANCE = ₹0.50`. Mismatches returned as field-level errors.

---

## 17. Legal AI Chatbot (RAG)

### Architecture

```
User types message in LegalChatbot.tsx
    ↓
POST /companies/{id}/legal/chat
    {message, history: [{role, content}]}
    ↓
legal_rag_service.py → legal_chat()
    ↓
1. Topic gate check (regex patterns for legal/HR relevance)
   → If off-topic: returns polite refusal without hitting AI
    ↓
2. embed_texts([user_message]) via Vertex AI embedding model
   (model: from LEGAL_RAG_EMBEDDING_MODEL env var)
    ↓
3. ChromaDB vector similarity search
   (collection: LEGAL_RAG_COLLECTION, top_k: LEGAL_RAG_TOP_K)
   → Returns top-K relevant document chunks with metadata
    ↓
4. Build prompt with retrieved context + conversation history
    ↓
5. generate_legal_json_response() via Vertex AI generative model
   (model: LEGAL_RAG_LLM_MODEL)
   → Returns: {answer, citations: [{source, text, page}]}
    ↓
Response: LegalChatResponse {answer, citations: [LegalCitationOut]}
```

### Configuration (env vars)

| Variable | Purpose |
|----------|---------|
| `GCP_CREDENTIALS_PATH` | Path to Google service account JSON |
| `GCP_PROJECT_ID` | GCP project |
| `GCP_LOCATION` | GCP region |
| `LEGAL_RAG_LLM_MODEL` | Vertex AI generative model (e.g. gemini-pro) |
| `LEGAL_RAG_EMBEDDING_MODEL` | Vertex AI embedding model |
| `LEGAL_RAG_CHROMA_PERSIST_DIR` | ChromaDB persistence directory |
| `LEGAL_RAG_COLLECTION` | ChromaDB collection name |
| `LEGAL_RAG_TOP_K` | Number of chunks to retrieve |
| `LEGAL_RAG_EMBED_BATCH_SIZE` | Embedding API batch size |
| `LEGAL_RAG_EMBED_MAX_RETRIES` | Retry count for embedding API |
| `LEGAL_RAG_EMBED_MIN_INTERVAL_SECONDS` | Rate limit interval |

### Corpus Ingestion

Run once before first use (or when corpus updates):
```bash
python -m scripts.ingest_legal_docs
```
Reads PDFs from `data/legal/india/`, chunks them, generates embeddings, stores in ChromaDB at persist directory.

### Chat Persistence

Chat history stored client-side in `localStorage` via `legalChatPersistence.ts` — no server-side chat storage.

---

## 18. Workflow Engine

### Design

Step-based approval engine. Currently wired to **requisition approval** but designed to support any entity type.

### Template Structure

```json
{
  "steps": [
    {"name": "company_admin_approval", "approver_role": "company_admin"}
  ]
}
```

Multiple steps can be chained. Each step has an `approver_role` that determines who can act.

### Instance Lifecycle

```
Status: active → (approve at final step) → approved
Status: active → (reject at any step) → rejected
```

### Role Override

`company_admin` can approve/reject any step regardless of defined `approver_role`. This allows admins to unblock stuck workflows.

### Entity Sync

When a workflow reaches terminal state (approved/rejected), `sync_entity_after_workflow()` automatically updates the linked entity:
- Requisition: `status` set to `approved` or `rejected`

---

## 19. Webhooks & External Integrations

### Outbound Webhooks (configurable per company)

Companies configure subscriptions via the Webhooks page. When domain events fire:
1. `deliver_webhooks_for_event()` finds all active subscriptions matching the event type
2. Payload signed with HMAC using the subscription's `secret`
3. HTTP POST sent to configured URL
4. `WebhookDelivery` row created with response status

### Recruitment Pipeline Status Webhook

Configurable via `RECRUITMENT_STATUS_WEBHOOK_URL` env var. Called from `recruitment_external_status.py` when application stages change.

### Recruitment Offer Webhook

Configurable via `RECRUITMENT_OFFER_WEBHOOK_URL` env var. Called from `recruitment_offer_webhook.py` when offers are created.

### External API (Port 8020)

Documented in `docs/external_api_port_8020.md` — a separate external API surface. Consult that doc for details.

### SSO (Stubs)

Google OIDC and SAML 2.0 stubs exist in `api/v1/sso.py`. Full implementation requires:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` configuration
- Actual OAuth flow implementation (currently returns stub responses)

---

## 20. Deployment & Environment

### Stack

| Service | Platform | Notes |
|---------|---------|-------|
| Backend API | Railway | Root: `backend/`, start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Database | Railway PostgreSQL | `DATABASE_URL` connection string |
| File storage | Railway volume | Mount at `/data` for uploads + ChromaDB |
| Frontend | Vercel | Root: `frontend/`, `VITE_API_BASE=https://<backend>/api/v1` |

### Required Environment Variables

| Variable | Where | Required |
|----------|-------|---------|
| `DATABASE_URL` | Backend | Yes |
| `SECRET_KEY` | Backend | Yes (long random string) |
| `CORS_ORIGINS` | Backend | Yes (comma-separated frontend URLs) |
| `VITE_API_BASE` | Frontend | Yes (production) |
| `UPLOAD_DIR` | Backend | Optional (default: local `uploads/`) |
| `MAX_UPLOAD_BYTES` | Backend | Optional |
| `API_BASE_PATH` | Backend | Optional (path prefix if behind reverse proxy) |
| `VITE_FRONTEND_BASE_PATH` | Frontend | Optional (for sub-path deployments) |
| `RECRUITMENT_STATUS_WEBHOOK_URL` | Backend | Optional |
| `RECRUITMENT_OFFER_WEBHOOK_URL` | Backend | Optional |
| `GCP_CREDENTIALS_PATH` | Backend | Optional (Legal RAG only) |
| `LEGAL_RAG_LLM_MODEL` | Backend | Optional (Legal RAG only) |
| `LEGAL_RAG_EMBEDDING_MODEL` | Backend | Optional (Legal RAG only) |
| `LEGAL_RAG_CHROMA_PERSIST_DIR` | Backend | Optional (Legal RAG only) |
| `LEGAL_RAG_COLLECTION` | Backend | Optional (Legal RAG only) |
| `SIMCASH_DEBUG` | Backend | Optional (debug payroll output) |

### Database Initialization

On startup, `init_db()` is called automatically:
- Creates all tables via `Base.metadata.create_all`
- Runs column migration helpers for SQLite (adds missing columns if schema changed)
- Seeds platform admin (if no admin exists)
- Seeds demo companies and users (if zero companies — skipped in production with existing data)
- Runs `req_code` backfill for existing requisitions

### Demo Seeds

- **Platform admin:** `admin@hworkr.com` / `Admin@1234`
- **Demo companies:** seeded with admin users (check `database.py` `_seed_demo_companies_and_users()` for credentials)

### Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
# Set DATABASE_URL in .env (SQLite works: sqlite:///./hworkr.db)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
# Swagger UI: http://localhost:8080/docs

# Frontend
cd frontend
npm install
npm run dev
# App: http://localhost:5173

# Legal RAG (optional)
python -m scripts.ingest_legal_docs
```

---

## 21. Known Issues & Code Notes

### 21.1 Duplicate `position_id` on Employee Model

In `backend/app/models/employee.py`, `position_id` is declared **twice**:

```python
position_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("positions.id", ondelete="SET NULL"), nullable=True)
position_id: Mapped[str | None] = mapped_column(
    String(36), ForeignKey("positions.id", ondelete="SET NULL"), nullable=True, index=True
)
```

The second declaration wins at runtime (Python class attribute override). The first declaration is effectively dead code. This should be cleaned up — only the indexed version is needed.

### 21.2 Duplicate Import in `performance_learning.py`

Line 73–74 imports `display_name_and_email` twice:
```python
from app.services.employee_detail import display_name_and_email
from app.services.employee_detail import display_name_and_email
```
Harmless but should be cleaned up.

### 21.3 SSO Not Fully Implemented

Google OIDC and SAML endpoints exist as stubs returning placeholder responses. Full SSO requires external identity provider configuration and flow completion.

### 21.4 Duplicate `Query` Import in `performance_learning.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Query, Query, status
```
`Query` imported twice. Harmless but should be cleaned up.

### 21.5 OAuth2 Token URL Alignment

`oauth2_scheme` in `deps.py` uses `tokenUrl="/api/v1/auth/login"` — if `API_BASE_PATH` is set in production, this URL does not include the base path prefix, which may cause Swagger UI's "Authorize" button to not work. The login endpoint itself works fine.

### 21.6 Legal RAG is Optional

If `GCP_CREDENTIALS_PATH` is not set, the Legal chatbot will fail gracefully or not function. The rest of the app works without it.

---

## 22. Glossary

| Term | Definition |
|------|-----------|
| **Company workspace** | All screens under `/company/{id}/…` for one tenant |
| **Membership** | Link between a User and a Company, includes `role` and `status` |
| **Platform admin** | System-level operator with access to `/platform` (not a company role) |
| **Position** | An org-chart "job slot" — may be filled by an employee |
| **Department** | Structural grouping for people and positions |
| **Requisition** | Internal approval record for a hire; has a unique `req_code` |
| **Job Posting** | Public/internal listing derived from a Requisition |
| **Application** | A candidate's submission for a Job Posting |
| **Offer** | Formal employment offer linked to an accepted application |
| **Workflow** | Multi-step approval process (template + instance model) |
| **Review Cycle** | A structured performance period with goals, deadlines, and KPIs |
| **PIP** | Performance Improvement Plan — for at-risk employees |
| **Pay Run** | A payroll period execution producing payslips |
| **Payslip** | Per-employee pay statement for a pay period |
| **SimCash** | HworkR's internal payroll currency (₹S); the calculation engine name |
| **CTC** | Cost to Company (total annual compensation, Indian standard) |
| **ActivityLog** | Record of a tracked HR action with quality scoring dimensions |
| **quality_score** | Weighted composite of completeness + accuracy + timeliness + process_adherence |
| **CertTrack** | A certification track definition (role + level + requirements) |
| **CertProgress** | An employee's progress against a CertTrack |
| **Certificate** | Issued after eligibility; requires admin approval; has public verification ID |
| **verification_id** | Hex token on Certificate for public, unauthenticated verification |
| **InboxTask** | A personal actionable task generated by the system |
| **Notification** | In-app alert for a company-scoped event |
| **Works-with cohort** | Employees sharing the same manager + grade, used for peer nominations |
| **RAG** | Retrieval-Augmented Generation — the pattern used by the Legal chatbot |
| **Acknowledgment** | Record that a user confirmed reading a Policy document |
| **Audit trail** | Read-only log of all significant HR system actions |
| **req_code** | Human-readable short code for a Requisition (e.g. `REQ-001`) |
| **SLA** | Service Level Agreement — the time limit for an action to be considered "on time" in scoring |
| **Webhook** | Outbound HTTP POST to a configured URL when a domain event fires |
| **WebhookDelivery** | Log of a single webhook POST attempt and its response |
| **CORS** | Cross-Origin Resource Sharing — configured via `CORS_ORIGINS` env var |
| **JWT** | JSON Web Token — used for authentication; signed with `SECRET_KEY` |
| **Bearer token** | HTTP Authorization header pattern: `Authorization: Bearer <jwt>` |

---

*This document was auto-generated from full codebase analysis. Treat as living documentation — update when features change. For live API contracts, refer to `/docs` (Swagger UI) on a running backend instance.*
