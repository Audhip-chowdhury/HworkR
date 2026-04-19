# HworkR — Engagement & Surveys Module

> **Who this is for:** Anyone joining the project with zero prior context — devs, designers, product reviewers, or anyone wanting to suggest improvements.

---

## 1. What is the Engagement & Surveys Module?

This module lets HR practice the full survey lifecycle inside HworkR's simulated company:

1. Design and publish a **pulse or standard survey** with structured questions
2. Employees **respond** to active surveys (one response per employee per survey)
3. HR **analyzes** responses — per-question statistics, response rate, raw table
4. HR creates **action plans** linked to specific survey results
5. HR tracks **satisfaction trends** over time using rating scores across surveys

The module is under the nav item **"Engagement & Surveys"**, accessible via `/company/:companyId/surveys`.

---

## 2. Who Uses It

| Role | Access level |
|---|---|
| `company_admin` | All 4 tabs, can create/publish surveys and action plans, read-only worksheet |
| `compensation_analytics` | All 4 tabs, full create/manage |
| `hr_ops` | All 4 tabs, view-only (cannot create surveys or action plans) |
| `employee` | "Surveys" tab only (respond to active surveys) + "Satisfaction trends" tab |
| `talent_acquisition`, `ld_performance` | No access |

---

## 3. Data Models

### 3.1 Survey (`surveys` table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID string | PK |
| `company_id` | UUID string | FK → companies |
| `title` | String (255) | Survey name |
| `questions_json` | JSON | Array of question objects (see §4) |
| `target_audience_json` | JSON, nullable | Reserved for future audience scoping |
| `start_date` | String (32), nullable | ISO date `YYYY-MM-DD` |
| `end_date` | String (32), nullable | ISO date `YYYY-MM-DD` |
| `status` | String (32) | `draft` → `active` → `closed` |
| `survey_type` | String (32), nullable | `pulse` or `standard` |
| `created_at` | DateTime | |

### 3.2 SurveyResponse (`survey_responses` table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID string | PK |
| `survey_id` | UUID string | FK → surveys |
| `company_id` | UUID string | FK → companies |
| `employee_id` | UUID string | FK → employees |
| `answers_json` | JSON, nullable | `{ "q_id": value, ... }` |
| `submitted_at` | DateTime | |

> **No update on responses** — submissions are immutable. The only guard is the **409 Conflict** when an employee tries to submit a second response for the same survey.

### 3.3 SurveyActionPlan (`survey_action_plans` table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID string | PK |
| `survey_id` | UUID string | FK → surveys |
| `company_id` | UUID string | FK → companies |
| `title` | String (255) | Action item title |
| `description` | Text, nullable | Free-form detail |
| `assignee_employee_id` | UUID string, nullable | FK → employees |
| `due_date` | String (32), nullable | ISO date |
| `status` | String (32) | `open` → `in_progress` → `done` |
| `created_by` | UUID string, nullable | FK → users |
| `created_at` | DateTime | |

---

## 4. Question Format

Questions are stored as a JSON array inside `questions_json`. The system supports three types:

```json
[
  {
    "id": "q_1234567_abc",
    "text": "Overall, how satisfied are you with your role? (1–5)",
    "type": "rating_1_5",
    "required": true
  },
  {
    "id": "q_1234568_def",
    "text": "Would you recommend HworkR to a colleague?",
    "type": "yes_no",
    "required": true
  },
  {
    "id": "q_1234569_ghi",
    "text": "Any other comments?",
    "type": "text",
    "required": false
  }
]
```

| Question type | Answer stored in `answers_json` | How it is analysed |
|---|---|---|
| `rating_1_5` | Integer 1–5 | Average score + distribution bar per star (1–5 count) |
| `yes_no` | `"yes"` or `"no"` | Split bar: % yes vs. % no |
| `text` | Free string | Scrollable list of all text answers |

**Backwards compatibility:** Legacy surveys created before structured questions (plain `{"q1": "text"}` objects) are parsed as `text` type questions automatically.

---

## 5. Backend API

All endpoints under `/api/v1/companies/{company_id}/engagement/`.

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| `POST` | `/engagement/surveys` | `company_admin`, `compensation_analytics` | Create survey (status: draft) |
| `GET` | `/engagement/surveys` | All members (employees: active/closed only) | List surveys |
| `PATCH` | `/engagement/surveys/{survey_id}` | `company_admin`, `compensation_analytics` | Update title, questions, status, type |
| `POST` | `/engagement/survey-responses` | All members | Submit response |
| `GET` | `/engagement/survey-responses` | `company_admin`, `compensation_analytics`, `hr_ops` (all); `employee` (own) | List responses |
| `POST` | `/engagement/surveys/{survey_id}/action-plans` | `company_admin`, `compensation_analytics` | Create action plan |
| `GET` | `/engagement/surveys/{survey_id}/action-plans` | All members | List action plans for a survey |
| `PATCH` | `/engagement/action-plans/{action_plan_id}` | `company_admin`, `compensation_analytics` | Update action plan status / fields |

### Key backend rules
- **Employees never see draft surveys** — `GET /engagement/surveys` filters to `status IN ('active', 'closed')` for the `employee` role.
- **One response per employee per survey** — submitting a second response returns `409 Conflict` with message "You already submitted a response for this survey".
- **Employees can only respond as themselves** — the `employee_id` in the body must match their linked employee record or the API returns `403`.

---

## 6. Frontend: 4 Tabs

Route: `/company/:companyId/surveys`  
File: `frontend/src/pages/company/surveys/SurveysPage.tsx`

### Tab visibility per role

| Tab | `company_admin` | `compensation_analytics` | `hr_ops` | `employee` |
|---|---|---|---|---|
| Surveys | Yes | Yes | Yes | Yes |
| Responses & analysis | Yes | Yes | Yes | No |
| Action plans | Yes | Yes | Yes | No |
| Satisfaction trends | Yes | Yes | Yes | Yes |

---

## 7. Tab 1 — Surveys

### 7.1 For `company_admin` / `compensation_analytics`: Create Survey

```
Form fields:
  - Title (free text)
  - Type: Pulse | Standard
  - Start date (date picker, optional)
  - End date (date picker, optional)
  - Question builder:
      Per question: Text input | Type selector | Required checkbox
      Buttons: Remove | Up | Down | Add question
      
Submit → POST /engagement/surveys
  status = "draft"
  questions_json = structured array
```

### 7.2 Survey List (all configuring roles)

A table showing all surveys:

| Column | Notes |
|---|---|
| Title | |
| Type | Pulse / Standard / — |
| Status | draft / active / closed |
| Start date | |
| End date | |
| Responses | Count of responses for this survey |
| Actions | Context-sensitive buttons (see below) |

**Actions per status:**

| Status | Available actions |
|---|---|
| `draft` | **Publish** (→ active via PATCH) · **Edit draft** (inline edit form) |
| `active` | **Close** (→ closed via PATCH) · **Analysis** (link to Tab 2) · **Action plans** (link to Tab 3) |
| `closed` | **Analysis** · **Action plans** |

### 7.3 Edit Draft (inline, appears below the table)
Same form fields as Create. Saves via `PATCH /engagement/surveys/{id}`.

### 7.4 For `hr_ops`: view-only notice
"Survey creation and publishing are handled by company admin or compensation analytics roles."

### 7.5 For `employee`: Respond
Employees see the same surveys table (active/closed only — drafts hidden).  
Below it: a section titled **"Respond to a survey"** listing active surveys with:
- Survey title + type badge
- Status: already submitted ("Submitted — thank you.") or a **Respond** button
- Clicking Respond opens an **inline form** per question:
  - `rating_1_5` → `<select>` 1–5
  - `yes_no` → `<select>` Yes / No
  - `text` → `<textarea>`
- Required questions are validated before submission
- Submit → `POST /engagement/survey-responses`

---

## 8. Tab 2 — Responses & Analysis

**Visible to:** `company_admin`, `compensation_analytics`, `hr_ops`

### Summary bar
```
┌───────────────────┬──────────────────────────────┐
│   Responses: 23   │  Approx. response rate: 38%  │
└───────────────────┴──────────────────────────────┘
```
> Response rate denominator = total employees loaded for the company (approximate).

### Per-question analysis cards

For each question in the selected survey:

**Rating 1–5 question:**
```
Average: 3.74 / 5
1  ████                     4
2  ██                       2
3  ██████████               10
4  ████████████████         16
5  ██████                   6
```

**Yes / No question:**
```
Yes 65%      No 35%
[████████████████████████████░░░░░░░░░░░░░░░░░]
```

**Open text question:**
- Scrollable bullet list of all text answers (max-height 200px)

### Raw responses table (comp/admin/hr_ops only)
Columns: Employee (name + code) | Submitted at | One column per question (truncated headers)

---

## 9. Tab 3 — Action Plans

**Visible to:** All roles with survey access  
**Create/Update:** `company_admin`, `compensation_analytics` only

### Survey picker
Dropdown of all surveys. Changing the selection reloads action plans for that survey.

### Create form (comp/admin)
Fields: Title (required) · Description (optional) · Assignee (employee dropdown) · Due date · Initial status

→ `POST /engagement/surveys/{survey_id}/action-plans`

### Action plan list

| Column | Notes |
|---|---|
| Title | |
| Assignee | Employee name or — |
| Due | ISO date or — |
| Status | open / in_progress / done |
| Update (comp/admin) | Inline `<select>` dropdown; changing it fires `PATCH /engagement/action-plans/{id}` immediately |

---

## 10. Tab 4 — Satisfaction Trends

**Visible to:** All roles including employees

Shows average rating over time using only **`rating_1_5`** questions. Only surveys with status `active` or `closed` appear.

**Optional filter:** Pick a specific rating question by its text (when the same question id appears across multiple surveys).

**Chart:** Pure CSS horizontal bar, 0–5 scale, one row per survey sorted by start date / created at.

```
Q1 2026 Pulse · 2026-01-15       3.74 / 5
[████████████████████████████████████░░░░]

Q2 2026 Pulse · 2026-04-01       4.12 / 5
[█████████████████████████████████████████░]
```

---

## 11. Complete End-to-End Flow

```
ADMIN / COMP ANALYTICS FLOW
────────────────────────────
1. Tab 1 → Create survey
   - Choose: Pulse or Standard
   - Set start/end dates
   - Add questions (rating/yes-no/text, required flags)
   - Save as draft

2. Review draft → Edit if needed (Edit draft inline form)

3. Publish → status: draft → active
   - Employees can now see and respond

4. (Optional) monitor Tab 2 for early response data

5. Close survey when period ends → status: active → closed

6. Tab 2 → Analyze results
   - Per-question stats
   - Raw responses table

7. Tab 3 → Create action plans based on findings
   - Assign to team members
   - Set due dates and track progress (open → in_progress → done)

8. Tab 4 → Track satisfaction trend across surveys over time

EMPLOYEE FLOW
──────────────
1. Navigate to Engagement & Surveys
   (Only Surveys tab + Satisfaction Trends tab visible)

2. See "Respond to a survey" section
   - Active surveys listed; "Submitted" badge if already responded

3. Click Respond → inline form opens
   - Answer each question per its type
   - Required fields validated before submit

4. Submit → POST /engagement/survey-responses
   - Success: form closes, survey shows "Submitted — thank you."
   - If already submitted: API returns 409 → error shown
```

---

## 12. What is Built vs. What is Missing

### Built and Working
- [x] 3 DB tables: `surveys`, `survey_responses`, `survey_action_plans`
- [x] Structured question format (rating / yes-no / text)
- [x] Full CRUD: create survey, update (publish/close/edit), list
- [x] Employee response submit with duplicate-prevention (409)
- [x] Employees only see active/closed surveys (drafts hidden)
- [x] Response analysis: average, distribution bars, yes/no split, text list
- [x] Raw response table with employee names (when employee list loaded)
- [x] Action plans: create, list, inline status update
- [x] Satisfaction trends: CSS bar chart across surveys over time
- [x] Rating question filter for trends
- [x] Role-based tab visibility (employees see fewer tabs)
- [x] Audit trail on survey create/update and action plan create/update
- [x] `hr_ops` added to nav + response list access

### NOT Built Yet (Gap List)

#### High priority

| Gap | Impact |
|---|---|
| **No end-date auto-close** | Surveys stay `active` forever unless manually closed — the `end_date` is stored but never checked |
| **No notifications/inbox** when a survey is published | Employees have no indication a new survey is live unless they check the page manually |
| **No response edit or retract** | An employee who submits a wrong response cannot fix it |
| **`hr_ops` cannot update action plan status** | They have view access but the update requires `_COMP` — `hr_ops` users are often the assignees of action plans |
| **No response rate in action plans context** | When creating an action plan, the analyst has no response rate summary visible |

#### Medium priority

| Gap | Description |
|---|---|
| No survey templates | HR must build the same questions from scratch every time. A library of common pulse templates (eNPS, manager effectiveness) would save time |
| No anonymous response option | All responses are linked to `employee_id`. True anonymity (only aggregate data visible) is a common survey requirement |
| No target audience scoping | `target_audience_json` exists in the model but is never used — you cannot send a survey to only one department |
| `hr_ops` view-only but no visual difference | The page doesn't show an "hr_ops" mode message on Responses/Action Plans tabs — they can see the create form buttons in the DOM but clicks are blocked at the API level, which is confusing |
| No survey delete for drafts | A draft survey cannot be deleted from the UI |
| No pagination on response table | If the company has 1000+ employees the raw responses table renders all rows with no pagination |
| Satisfaction trend denominator shows any rating Q | If a survey has multiple `rating_1_5` questions, trend uses the first one — user may not notice this silently |

#### Low priority / future phase

| Gap | Description |
|---|---|
| No eNPS calculation | Employee Net Promoter Score is a standard derived from a 0–10 recommend question |
| No export to CSV/PDF | Responses and analysis cannot be downloaded |
| No scheduled/recurring surveys | A pulse survey cannot be set to repeat monthly automatically |
| No manager-level breakdown | Results cannot be filtered to show "responses from employees reporting to manager X" |
| No action plan comments/notes thread | Action plans have a description but no comment thread for follow-up discussion |
| No satisfaction benchmark | No comparison against previous period or company average |

---

## 13. Suggested Improvements (Prioritized)

### Priority 1 — Fix functional gaps
1. **Auto-close surveys on `end_date`.** Add a scheduled check (or check on page load) that calls `PATCH status=closed` when `end_date < today` and status is `active`.
2. **Inbox notification when survey published.** When `PATCH status=active` is called, create an inbox task for all eligible employees: "New survey: [title] — please respond by [end_date]."
3. **Allow `hr_ops` to update action plan status.** Change `_COMP` guard on `PATCH /engagement/action-plans/{id}` to include `hr_ops`, since they are most often the assignees.
4. **Add survey delete for drafts.** Add `DELETE /engagement/surveys/{id}` guarded to draft status + `_COMP` role. Add a "Delete" button on draft rows in the table.

### Priority 2 — Make it production-quality
5. **Anonymous response mode.** Add `anonymous: bool` field to `Survey`. When true: `GET /engagement/survey-responses` never returns `employee_id`; raw table shows "Anonymous" for all rows.
6. **Target audience by department.** Use `target_audience_json` to scope a survey to selected department ids. Only employees in those departments see the survey in their "Respond" list.
7. **Survey templates.** Pre-built question sets (eNPS, manager check-in, onboarding feedback) selectable when creating a new survey.
8. **Response edit window.** Allow employees to edit their response within 24 hours of submission.
9. **hr_ops visual cue.** Show a read-only banner on Action Plans and Responses tabs when role is `hr_ops`.

### Priority 3 — Analytics depth
10. **eNPS calculation.** Detect a "recommend" `rating_1_5` question; compute Promoters (9–10 mapped to 5), Passives (7–8 mapped to 3–4), Detractors (0–6 mapped to 1–2); show NPS = % Promoters − % Detractors.
11. **Department breakdown in analysis.** On Tab 2, add a department filter so comp analysts can compare results across teams.
12. **CSV export for responses.** Add a "Download CSV" button on the raw responses table.
13. **Trend benchmark line.** On Tab 4, overlay a dashed line for the all-time average rating so individual survey results can be compared to the baseline.
