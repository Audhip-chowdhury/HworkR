# HworkR — Product overview

This guide explains what **HworkR** is, who it is for, and how to accomplish common tasks. It is written for anyone using the product for the first time as well as trainers and support staff.

---

## 1. What is HworkR?

HworkR is a **human resources and people operations** web application. Organizations use it to:

- Model **structure** (departments, job catalog, org chart positions)
- Run **HR processes** (leave, policies, audits, employee records)
- Support **hiring** (requisitions, postings, pipeline, interviews, offers)
- Manage **payroll and benefits** configuration and employee-facing views
- Offer **learning**, **performance**, **surveys**, and **certification** experiences
- Connect **workflows**, **exports**, **webhooks**, and **analytics** for admins

The interface is organized as a **company workspace**: after you sign in, you work inside a specific company’s data (multi-company users can switch via the home screen).

---

## 2. Signing in and choosing a company

### 2.1 Create an account or log in

- Use **Register** to create a user, or **Login** with an existing email and password.
- Your account can belong to **one or more companies**; each membership has a **role** (what you are allowed to see and do).

### 2.2 Home screen

- If you belong to **multiple companies**, the home page lists them so you can open the right workspace.
- If you belong to **exactly one** company, the app may take you straight to that company’s **Organization** view to get you into the context quickly.
- **Platform administrators** (internal operators) have a separate **Platform** area to review new company registrations and manage companies globally.

### 2.3 Company workspace layout

Inside a company you typically see:

- **Left sidebar** — primary navigation (items depend on your role)
- **Top bar** — page title, account menu (password, sign-out), **notifications**
- **Main content** — the page you selected

Tasks that need your attention often appear in **Inbox** and **Notifications**.

---

## 3. Roles in plain language

Your **role** controls which sidebar links appear and which URLs you can open. Common roles:

| Role | Typical use |
|------|-------------|
| **Company admin** | Full configuration: members, integrations, exports, webhooks, technical settings, and most HR areas |
| **HR operations (`hr_ops`)** | Employee records, leave approvals, org-wide leave balances, performance tools, policy publishing, team goals when managing people |
| **Talent acquisition** | Recruiting configuration, workflows alongside admin, job pipeline |
| **Learning & development** | Course catalog and training scores (with admin) |
| **Compensation analytics** | Payroll structure (grades, salaries, pay runs, reconciliation) and benefits plan management (with admin) |
| **Employee** | Self-service: profile, goals, leave requests, training assignments, recruitment candidate views, payslips, surveys, certification |

If you open a page your role does not allow, you are returned to the **company dashboard** — that is expected security behavior, not a bug.

**Team goals:** managers (and HR ops acting as managers) only see **Team goals** in the sidebar when they have **direct reports** in the system.

---

## 4. Area-by-area guide

### 4.1 Dashboard

**Purpose:** Landing snapshot for the company workspace (high-level context and links).

**Typical flow:** Sign in → select company → review dashboard → open a module from the sidebar.

---

### 4.2 Organization

**Purpose:** Define how the company is structured on the **org chart**: departments, **positions** (job slots), reporting lines, optional **works with** peer links, and grades.

**Who:** Everyone can view; **company admin** and **HR ops** can add or edit departments and positions (where the UI allows).

**Typical flow:**

1. Open **Organization**.
2. Review departments and the visual chart.
3. To add a position: use the form (name, placement, grade, reports to, optional works-with).
4. Adjust **zoom** or **full screen** on the chart if needed; **export** a print-friendly PDF when you want a static copy.

---

### 4.3 My profile

**Purpose:** Employees (and HR ops with an employee record) update **their own** profile and documents.

**Typical flow:** Open **My profile** → edit fields or upload documents as offered → save.

---

### 4.4 My goals & Team goals

**Purpose:** **My goals** — personal objectives and related actions (e.g. peer review where enabled). **Team goals** — manager view of direct reports’ goals.

**Who:** `employee` and `hr_ops` (with the team visibility rule above).

**Typical flow:** Open **My goals** → create or update goals → complete peer steps if assigned. Managers open **Team goals** to review and coach.

---

### 4.5 Employees (HR)

**Purpose:** Central directory and **lifecycle** history for staff.

**Who:** **Company admin** and **HR ops** only.

**Typical flow:**

1. **Employee profile management** — search and open an employee, edit employment data.
2. **Lifecycle events** — record or review hires, transfers, exits, etc., according to your process.

Clicking a person may open a **detail** page with deeper panels (documents, HR events, etc., depending on configuration).

---

### 4.6 Leave

**Purpose:** Policies, **holiday calendar**, submitting **leave requests**, and (for HR ops) **approvals** and **org-wide balances**.

**Typical flow (employee):**

1. **Leave policies** — understand rules.
2. **Holiday calendar** — see company holidays.
3. **Leave request** — submit dates and type → track status.
4. Wait for approval (managers/HR per your rules).

**Typical flow (HR ops):**

1. **Leave approvals** — open queue → approve or reject with comments.
2. **Leave balance tracker** — monitor balances across the organization.

---

### 4.7 Audit trail & Policies

**Purpose:** **Audit trail** — read-only history of important actions. **Policies** — document library; some roles can **publish** new versions.

**Typical flow:** Open **Audit trail** and filter or search (as provided). Open **Policy library** → read or download → **acknowledge** if required. HR admins use **Publish** to add or update policy documents.

---

### 4.8 Workflows

**Purpose:** Run **approval-style processes** from templates (e.g. headcount, offers) with explicit steps and outcomes.

**Who:** **Company admin** and **talent acquisition** (start and track; participation may involve others per template).

**Typical flow:** Open **Workflows** → start an instance from a template or open an existing one → take **actions** (approve, reject, comment) → monitor until complete.

---

### 4.9 Recruitment

**Purpose:** End-to-end hiring: **requisitions**, **job postings**, **applications**, **interviews**, **offers**, and **candidate** self-service where enabled.

**Who:** Admins and talent acquisition manage configuration; **employees** may use candidate-facing parts (e.g. portal) depending on setup.

**Typical flow (recruiter):**

1. Create or update a **requisition** and **posting**.
2. Move candidates through **pipeline** stages.
3. Schedule **interviews** and collect feedback.
4. Create and send **offers**; track responses.
5. Use **tracking** or activity views to monitor bottlenecks.

**Typical flow (candidate / internal applicant):** Use links from your organization to **apply**, then **Candidate portal** to see applications and offers.

---

### 4.10 Performance

**Purpose:** HR-led **performance cycles**, goals alignment, reviews, and performance improvement plans (PIPs) as implemented in your deployment.

**Who:** **Company admin** and **HR ops**.

**Typical flow:** Open **Performance** → configure or run the current cycle → monitor completion and follow-ups.

---

### 4.11 Learning and Development

**Purpose:** **Training assignments** for everyone; **course catalog** and **training scores** for L&D administrators.

**Typical flow (learner):** Open **Training assignment** → launch or complete assigned courses → check progress.

**Typical flow (L&D):** Maintain **Course catalog management**, review **Training scores**, assign content as needed.

---

### 4.12 Payroll

**Purpose:** Compensation structure (grades, salary data), **pay runs**, **payslips**, validation/reconciliation tools, and related tabs (e.g. increments, reimbursements) as shown in your build.

**Who:** **Everyone** can usually open payroll; **sensitive configuration** tabs are limited to **company admin** and **compensation analytics**.

**Typical flow (compensation):** Configure **grade structure** and **salary structures** → run **pay runs** → generate **payslips** → run **reconciliation** checks.

**Typical flow (employee):** Open **Payslips** tab → view or download your payslip for a period.

---

### 4.13 Benefits

**Purpose:** Benefit **plans** and **enrollments** (administrators); **My Benefits** (employees).

**Typical flow:** Admins define plans and enroll people; employees review **My Benefits** during open enrollment or after changes.

---

### 4.14 Engagement & Surveys

**Purpose:** Create surveys, collect **responses**, build **action plans**, and view **trends** (HR); employees complete **My Surveys** and may see **Action plans** assigned to their department.

**Typical flow:** HR publishes a survey → employees respond → HR reviews **Responses & Analysis** → creates **Action plans** → tracks follow-up.

---

### 4.15 Inbox

**Purpose:** Personal **task list** (onboarding items, reminders, actionable nudges) synced with your employee record where applicable.

**Typical flow:** Open **Inbox** → complete tasks → items clear as you finish underlying work (e.g. profile fields).

---

### 4.16 Progress

**Purpose:** Orientation toward **certification** completion and links to related admin tools (e.g. tracking) where relevant.

**Typical flow:** Review progress toward certificate requirements → jump to **Certification** or training as needed.

---

### 4.17 Analytics

**Purpose:** Aggregated **metrics and charts** for people leaders (not the broad employee base).

**Typical flow:** Open **Analytics** → filter or change date ranges as provided → export CSV if offered.

---

### 4.18 Certification

**Purpose:** **Learning tracks**, progress, **certificate issuance**, verification, and approval queues for administrators.

**Typical flow (learner):** Complete track requirements → view issued certificates.

**Typical flow (admin):** Define or manage tracks → issue or **approve** pending certificates → share **public verification** links when supported.

---

### 4.19 Admin-only pages (direct access)

These may not appear in the sidebar but are available to **company administrators** when navigating by URL or internal links:

- **Members** — invite users, change roles, deactivate access  
- **HR ops** hub — consolidated HR operator tools (as built)  
- **Exports** — download CSV extracts  
- **Webhooks** — integrate outbound events  
- **Scenarios** — generate demo or bulk data (development / training)  
- **Integrations / SSO** — identity provider notes and stubs  
- **Tracking and scoring** — activity logging and score rules for gamified or compliance-style tracking  

Use these only if your organization expects you to configure integrations or exports.

---

## 5. Notifications and real-time updates

- The top bar **notification** control lists recent events for **you** in this company.
- The app may use a **live connection** to refresh toasts or lists when something changes (e.g. workflow completed). If updates seem delayed, refresh the page.

---

## 6. Security and privacy habits

- **Sign out** on shared computers (account menu).
- **Do not share** your password; use distinct accounts per person.
- If you cannot access a feature, ask your **company admin** whether your **role** should be updated — the product hides pages intentionally.

---

## 7. Glossary

| Term | Meaning |
|------|---------|
| **Company workspace** | All screens under `/company/{id}/…` for one tenant |
| **Membership** | Link between your user account and a company, including **role** |
| **Position** | An org-chart “chair” (job slot), may be filled by an employee |
| **Department** | Structural grouping for people and positions |
| **Requisition** | Internal approval record to hire for a role |
| **Posting** | Public or internal job listing derived from hiring needs |
| **Workflow** | Multi-step approval process with defined states |
| **Payslip** | Pay statement for a pay period |
| **Acknowledgment** | Record that a user read and accepted a policy |

---

## 8. Getting help

- **In-product:** read page titles, hints, and table headers — they usually state the action (e.g. Approve, Submit, Save).
- **Technical detail:** see **`documentation/TECHNICAL_SPECIFICATION.md`** for routes and APIs.
- **Your organization:** contact your **HR** or **IT administrator** for role changes, data issues, or process questions specific to your company.

---

*HworkR is a demo-friendly HR platform; some integrations (e.g. full SSO) may be stubbed until connected to real identity providers. Features visible in your environment depend on seed data, configuration, and your role.*
