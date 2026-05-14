# HworkR — Technical specification

This document describes the **architecture surface area** of the HworkR application: HTTP API layout, real-time channel, frontend routes, and **role-based access** for the company workspace. It is intended for engineers integrating with or extending the product.

---

## 1. Stack and conventions

| Layer | Technology |
|--------|------------|
| Backend | Python, FastAPI, SQLAlchemy |
| Frontend | TypeScript, React 18, React Router 6, Vite |
| Auth | JWT bearer tokens (see `/api/v1/auth`) |
| Real time | WebSocket company events |

**Base API prefix:** all versioned REST routes live under **`/api/v1`**.

**Health:** `GET /health` — returns app status (no auth).

**Static uploads:** `GET /uploads/...` — user-uploaded assets (e.g. company logos).

---

## 2. Authentication

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/auth/register` | Register a user account |
| `POST` | `/api/v1/auth/login` | Obtain JWT access token |
| `GET` | `/api/v1/auth/me` | Current user profile (authenticated) |
| `POST` | `/api/v1/auth/change-password` | Change password |

**Authenticated requests:** send `Authorization: Bearer <token>`.

**Platform admin:** users may have `is_platform_admin`; platform routes require this flag (see §4).

---

## 3. Company context and membership

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/me/companies` | List companies the current user belongs to, with **membership role** per company |

Most company-scoped routes use a path parameter `{company_id}` and validate an **active** `CompanyMembership` for the current user. Server-side dependency modules (e.g. `app.api.deps`) enforce role sets per endpoint; the frontend **mirrors** a subset of rules in `frontend/src/company/companyAccess.ts` for navigation and `CompanyAuthorizedOutlet`.

---

## 4. WebSocket (real-time)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `WS /ws/companies/{company_id}?token=<jwt>` | JWT query param | Subscribe to company-scoped events; server validates membership before accepting |

The UI uses this for live notifications/toasts in the company workspace.

---

## 5. REST API by module

Below, paths are **relative to** `/api/v1` unless noted. Many routes support additional query parameters and request bodies; see OpenAPI / route handlers in `backend/app/api/v1/` for full schemas.

### 5.1 Auth & SSO

| Prefix / path | Highlights |
|-----------------|------------|
| `/auth/*` | Login, register, me, change-password |
| `/auth/sso/providers` | List SSO provider metadata (stubs / config) |
| `/auth/sso/google/authorize` | OIDC authorize stub |
| `/auth/sso/saml/acs` | SAML ACS stub |

### 5.2 Me & company registration (user scope)

| Path | Highlights |
|------|------------|
| `/me/companies` | Companies + roles for current user |
| `/company-registration-requests` | `POST` — submit registration request |
| `/company-registration-requests/me` | `GET` — current user’s request (if any) |

### 5.3 Platform (platform admin only)

| Path | Highlights |
|------|------------|
| `/platform/companies` | List all companies |
| `/platform/company-registration-requests` | List registration requests (`status` query) |
| `/platform/company-registration-requests/{id}/approve` | Approve → create company + admin membership |
| `/platform/company-registration-requests/{id}/reject` | Reject request |

### 5.4 Organization (`/companies`)

Core org structure: company profile, members, departments, locations, job catalog, org roles, **positions** (org chart chairs), demo seed, delete company.

| Path pattern | Examples |
|--------------|----------|
| `/companies/{company_id}` | `GET`, `PATCH` company |
| `/companies/{company_id}/logo` | `POST` upload logo |
| `/companies/{company_id}/members` | `GET` list; `POST .../invite` |
| `/companies/{company_id}/members/{user_id}/role` | `PATCH` |
| `/companies/{company_id}/members/{user_id}/deactivate` | `POST` |
| `/companies/{company_id}/departments` | `GET`, `POST` |
| `/companies/{company_id}/locations` | `GET`, `POST` |
| `/companies/{company_id}/job-catalog` | `GET`, `POST` |
| `/companies/{company_id}/org-roles` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/companies/{company_id}/grade-bands` | Grade structure linked to org (see handler) |
| `/companies/{company_id}/positions` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/companies/{company_id}/seed-demo` | `POST` demo org seed |
| `/companies/{company_id}` | `DELETE` company |

### 5.5 Employees (`/companies/{company_id}/employees`)

| Path | Purpose |
|------|---------|
| `GET` `` | List employees |
| `GET` `/summary` | Summary list |
| `POST` `` | Create employee |
| `GET` `/me`, `PATCH` `/me` | Current user’s employee record in this company |
| `GET` `/me/works-with-peers` | Peers linked via org “works with” |
| `GET` `/me/documents`, `POST` `/me/documents/{doc_type}/upload`, `PATCH` `/me/documents/{doc_type}` | Personal documents |
| `GET` `/my-direct-reports` | Direct reports (manager view) |
| `GET` `/{employee_id}`, `PATCH` `/{employee_id}` | Employee detail / update |
| `PATCH` `/{employee_id}/onboarding` | Onboarding checklist |
| `POST` `/{employee_id}/lifecycle-events` | Record lifecycle event |
| `GET` `/{employee_id}/lifecycle-events` | List lifecycle events |

### 5.6 HR operations — leave, attendance, holidays (`/companies/{company_id}`)

Under `hr_ops` router (same company prefix; paths include `leave/`, `attendance`, `holiday-calendars`):

| Area | Methods (representative) |
|------|---------------------------|
| Leave policies | `GET`/`POST` `/leave/policies` |
| Leave requests | `GET`/`POST` `/leave/requests`, `PATCH` `/leave/requests/{id}/decision` |
| Leave summary | `GET` `/leave/summary` |
| Leave balances | `GET`/`POST` `/leave/balances` |
| Attendance | `GET`/`POST` `/attendance` |
| Holiday calendars | `GET`/`POST` `/holiday-calendars` |

### 5.7 Audits & policies (`/companies/{company_id}/audits`)

| Path | Purpose |
|------|---------|
| `/members/search` | Search members for audit context |
| `/trail/categories`, `/trail` | Audit trail listing |
| `/policies` | Policy library `GET`; `POST` create |
| `/policies/{id}/download` | Download document |
| `/policies/{id}/acknowledge` | Acknowledge policy |
| `/policies/{id}/acknowledgment-detail` | Ack detail |

### 5.8 Recruitment (`/companies/{company_id}/recruitment`)

Includes requisitions, postings, applications, interviews, offers, candidate self-service endpoints, activity, convert offer to employee.

Representative paths:

- `GET`/`POST` `/requisitions`, `PATCH` `/requisitions/{id}`
- `GET`/`POST` `/postings`, `PATCH` `/postings/{id}`
- `GET` `/applications`, `POST` `/applications`, `PATCH` `/applications/{id}/stage`
- `GET` `/application-activity`
- Candidate: `GET` `/candidate/open-postings`, `GET` `/candidate/my-applications`, `GET` `/candidate/my-offers`, etc.
- `GET`/`POST` `/interviews`, `PATCH` `/interviews/{id}`
- `GET`/`POST` `/offers`, `PATCH` `/offers/{id}/respond`, `POST` `/offers/{id}/convert-to-employee`

### 5.9 Public recruitment (unauthenticated entry)

| Method | Path |
|--------|------|
| `POST` | `/api/v1/recruitment/public-apply/{req_code}` |

Creates/identifies user and application from a globally unique requisition code.

### 5.10 Workflows

| Path | Purpose |
|------|---------|
| `GET` `/companies/{company_id}/workflow-templates` | List templates |
| `POST` `/companies/{company_id}/workflow-instances` | Start instance |
| `GET` `/companies/{company_id}/workflow-instances` | List instances (filters) |
| `POST` `/companies/{company_id}/workflow-instances/{id}/actions` | Act (approve/reject/etc.) |
| `GET` `/companies/{company_id}/workflow-instances/{id}/actions` | Action history |

### 5.11 Compensation & engagement (`/companies/{company_id}`)

Large module: **payroll** (grade bands, salary structures, pay runs, payslips, engine validation, reconciliation), **benefits** (plans, enrollments, summary), **engagement** (surveys, responses, action plans).

Representative payroll paths:

- `/payroll/grade-bands`, `/payroll/grade-bands/{id}`, audit variants
- `/payroll/salary-structures`, `PATCH` `.../{structure_id}`, audit
- `/payroll/pay-runs`, `PATCH` `.../{pay_run_id}`, period overview
- `/payroll/pay-runs/{pay_run_id}/employees/{employee_id}/release-salary`
- `/payroll/payslips`, ledger entries, engine/reconciliation validate

Benefits: `/benefits/plans`, `/benefits/enrollments`, `/benefits/enrollment-summary`, etc.

Surveys: `/engagement/surveys`, templates, responses, action plans, `my-action-plans`.

### 5.12 Compensation review (merit cycles)

Prefix: `/companies/{company_id}/compensation`

- Review cycles: `GET`/`POST` `/review-cycles`, `PATCH` `/{cycle_id}`
- Guidelines, proposals, submit/approve/reject, budget summary, apply approved

### 5.13 Performance & learning (`/companies/{company_id}`)

- Performance: review cycles, goals, assessments, PIPs, at-risk employees, etc.
- Learning: courses, training assignments, completions, course scores, skill profiles, suggestions

(Exact path segments live under `/performance/...` and `/learning/...` in `performance_learning.py`.)

### 5.14 Analytics

| Path | Purpose |
|------|---------|
| `GET` `/companies/{company_id}/analytics/dashboard` | Dashboard payload |
| `GET` `/companies/{company_id}/analytics/export/employees.csv` | CSV export |

### 5.15 Certification (company)

Prefix: `/companies/{company_id}/certification`

Tracks, personal progress, dashboard, certificate issue/list/verify/PDF, pending queue, approve.

### 5.16 Public certificates (share / verify)

Prefix: `/certificates` (no company id in URL)

- `GET` `/verify/{verification_id}` (JSON)
- `GET` `/verify/{verification_id}/page` (HTML)
- `GET` `/verify/{verification_id}/pdf`

### 5.17 Tracking & scoring

Prefix: `/companies/{company_id}/tracking`

- Activity logs `POST`/`GET`
- Dashboard score, recent activity
- Scoring rules `POST`/`GET`

### 5.18 Notifications & inbox

| Path | Purpose |
|------|---------|
| `GET` `/companies/{company_id}/notifications` | List (filtered) |
| `POST` `/companies/{company_id}/notifications/mark-read` | Mark read |
| `GET` `/companies/{company_id}/inbox/tasks` | Inbox tasks for current user |

### 5.19 Exports (CSV)

Prefix: `/companies/{company_id}/exports`

- Recruitment: applications, requisitions, offers
- Leave: requests
- Learning: assignments, completions

### 5.20 Webhooks

Prefix: `/companies/{company_id}/webhooks`

- List/create/update subscriptions, test delivery

### 5.21 Scenarios (demo / load)

| Method | Path |
|--------|------|
| `POST` | `/companies/{company_id}/scenarios/generate` |

---

## 6. Frontend application routes

Routes are defined in `frontend/src/App.tsx`. **`/company/:companyId/*`** children are wrapped in **`CompanyAuthorizedOutlet`**, which calls **`canAccessCompanyPath`** (`frontend/src/company/companyAccess.ts`). Unauthorized paths redirect to the company **dashboard** (`/company/:companyId`).

### 6.1 Global (no company)

| Path | Screen | Access |
|------|--------|--------|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/` | Home (company picker, registration flow) | Authenticated |
| `/register-company` | Register a company (request) | Authenticated |
| `/platform` | Platform admin — companies & registration queue | `is_platform_admin` |

### 6.2 Company workspace (`/company/:companyId/...`)

| Route segment | Typical screen |
|---------------|----------------|
| `` (index) | Workspace dashboard |
| `org` | Organization chart & position management |
| `my-profile` | Employee self profile |
| `my-goals`, `my-goals/peer-review` | Goals & peer review |
| `team-goals` | Manager team goals |
| `employees/profile`, `employees/lifecycle` | HR employee admin |
| `employees/:employeeId` | Employee detail |
| `leave/policies`, `holidays`, `request`, `approvals`, `balances` | Leave module |
| `audits/trail`, `audits/policies` | Audit trail & policy library |
| `workflows`, `workflows/:instanceId` | Workflow templates & instance |
| `recruitment` + sub-routes | Recruitment hub, postings, pipeline, interviews, offers, candidate portal, tracking |
| `performance` | HR performance console |
| `learning/assignments`, `catalog`, `scores` | L&D |
| `payroll` (tabs via query) | Payroll & compensation UI |
| `benefits` (tabs) | Benefits |
| `surveys` (tabs) | Surveys & engagement |
| `inbox`, `progress` | Tasks & certification progress |
| `analytics` | Analytics dashboard |
| `certification` | Certification tracks & issuance |
| `exports` | Data exports (admin) |
| `webhooks` | Webhooks (admin) |
| `scenarios` | Scenario generator (admin) |
| `integrations/sso` | SSO integration notes |
| `tracking` | Activity tracking & scoring rules (admin) |
| `members` | Company members & invites (admin) |
| `hr-ops` | HR operations hub (admin) |

**Note:** Some admin URLs are **not** listed in the sidebar `COMPANY_NAV_DEF`; they are still registered in the router and gated by `canAccessCompanyPath` (see §7).

**Home redirect:** if a user has exactly **one** company and is not a platform admin, `HomePage` redirects to **`/company/{id}/org`** (not the dashboard).

---

## 7. Access layers (company membership roles)

### 7.1 Role enum (application)

Stored on `CompanyMembership.role`:

- `company_admin`
- `hr_ops`
- `talent_acquisition`
- `ld_performance`
- `compensation_analytics`
- `employee`

### 7.2 Frontend route guard (`canAccessCompanyPath`)

Path keys are relative to `/company/:id/` (no leading slash in implementation). Summary:

| Area | Allowed roles |
|------|----------------|
| `members`, `hr-ops`, `exports`, `webhooks`, `scenarios`, `integrations/sso`, `tracking` | **`company_admin` only** |
| `employees/*` | `company_admin`, `hr_ops` |
| `workflows`, `workflows/*` | `company_admin`, `talent_acquisition` |
| `recruitment`, `recruitment/*` | `company_admin`, `talent_acquisition`, `employee` |
| `learning/catalog`, `learning/scores` | `company_admin`, `ld_performance` |
| `learning/*` (other) | All six roles |
| `leave/approvals`, `leave/balances` | **`hr_ops` only** (leave org admin) |
| `performance`, `performance/*` | `company_admin`, `hr_ops` |
| `analytics`, `analytics/*` | All **except** `employee` (i.e. HR_NON_EMPLOYEE_ROLES) |
| `payroll`, `payroll/*` | All six roles |
| `benefits`, `benefits/*` | All six roles |
| `surveys`, `surveys/*` | All six roles |
| `my-profile`, `my-goals`, `team-goals` | `employee`, `hr_ops` |
| Dashboard ``, `org`, `leave` (except approvals/balances), `audits`, `inbox`, `progress`, `certification` | All six roles |

### 7.3 Sidebar navigation (`COMPANY_NAV_DEF`)

The sidebar **further** filters items by role (and optionally hides **Team goals** for `employee` / `hr_ops` when the user has no direct reports). Examples:

- **Employees** group: `company_admin`, `hr_ops` only.
- **Leave approvals** & **Leave balance tracker**: `hr_ops` only (among nav children).
- **Policies → Publish**: `company_admin`, `hr_ops`.
- **Workflows**: `company_admin`, `talent_acquisition`.
- **Recruitment** top-level link: `company_admin`, `talent_acquisition`, `employee`.
- **Performance**: `company_admin`, `hr_ops`.
- **Learning → Course catalog / Training scores**: `company_admin`, `ld_performance`.
- **Payroll** children: salary/grades/merit/reimbursements/runs/reconciliation → **compensation** + admin; payslips → everyone.
- **Benefits**: plans/enrollments → compensation + admin; My Benefits → `employee`.
- **Surveys** tabs: mixed employee vs HR admin.
- **Analytics**: non-employee roles only.

**Important:** Server-side checks remain authoritative; the UI hides or blocks routes to avoid confusion.

---

## 8. Related source files

| Concern | Location |
|---------|----------|
| API router wiring | `backend/app/main.py` |
| Company path RBAC (frontend) | `frontend/src/company/companyAccess.ts` |
| Sidebar definition | `frontend/src/company/navConfig.ts` |
| Route table | `frontend/src/App.tsx` |
| Company layout & nav resolution | `frontend/src/pages/company/CompanyLayout.tsx` |
| Route guard outlet | `frontend/src/pages/company/CompanyAuthorizedOutlet.tsx` |

---

*This document reflects the repository structure at the time of writing; route and API lists may grow. For exact request/response models, refer to FastAPI-generated OpenAPI (`/docs` when the server runs with docs enabled) or the schema modules under `backend/app/schemas/`.*
