# HworkR Certification System — Full Implementation Spec

> Feed this document to the agent and say: **"Implement the certification system using this spec."**  
> The agent has no other context needed — everything is here.

---

## 1. What This Is

HworkR is an HR training simulation platform. Users log into a company workspace and perform real HR tasks (hiring, leave approvals, policy acknowledgements, etc.). Each action gets a quality score across four dimensions. The **certification system** is a crash-course assessment on top of this — it verifies that the user can perform their role's tasks correctly, not just theoretically.

This spec describes exactly what needs to be **changed or added** to implement the full certification loop.

---

## 2. Current System State (What Already Exists)

### Backend

| File | What it does |
|------|-------------|
| `backend/app/scoring_rules.py` | Weights, SLAs, module labels, required action list, min score (80) for eligibility |
| `backend/app/models/certification.py` | `CertTrack`, `CertProgress`, `Certificate` SQLAlchemy models |
| `backend/app/schemas/certification.py` | Pydantic I/O schemas for all three models + dashboard |
| `backend/app/api/v1/certification.py` | REST endpoints: CRUD on tracks, progress, certificates, dashboard |
| `backend/app/services/certification_rules.py` | `validate_certificate_issuance()` — enforces requirements_json rules |
| `backend/app/models/tracking.py` | `ActivityLog` — every HR action is recorded here with `module`, `action_type`, `quality_score`, `quality_factors_json` |
| `backend/app/models/membership.py` | `CompanyMembership` — has a `role` field |

### Membership roles (already in DB)
```
company_admin
talent_acquisition
hr_ops
ld_performance
compensation_analytics
employee
```

### Scoring dimensions (weights in scoring_rules.py)
```
completeness        25%
accuracy            30%
timeliness          20%
process_adherence   25%
```

### Modules tracked in ActivityLog
```
employees     → Employee
compliance    → Audit
leave         → Leave
recruitment   → Recruitment
training      → Learning
compensation  → Compensation
```

### Current cert statuses in CertProgress
```
in_progress
completed
```

### Current cert issuance flow
- `POST /companies/{company_id}/certification/certificates/issue` — issues immediately, no approval step.
- `validate_certificate_issuance()` checks: min_actions_count, required_action_keys, max_days, disallow_critical_failures, min_score.
- Company admin bypasses all rules (early return at top of validator).

### Current progress dashboard status values
```
not_started
in_progress
failed               ← if critical_failure_count > 0
eligible_for_assessment  ← all required actions done + overall_score >= 80
```

### Frontend
- `frontend/src/pages/company/progress/ProgressPage.tsx` — shows overall score, status pill, dimension bars, module breakdown, required actions progress, recent activity.
- `frontend/src/api/certificationApi.ts` — all cert API calls.
- `frontend/src/api/types.ts` — TypeScript types.

---

## 3. Design Decisions Made

| Decision | Choice |
|----------|--------|
| Time-based gates | **None.** No `max_days` enforcement for cert eligibility. Timeliness is *recorded* for analytics but does not block certification. |
| What drives eligibility | Task quantity (min tasks per module) + overall quality score threshold |
| Task assignment | System auto-selects the relevant track based on `CompanyMembership.role` |
| Certification levels/tracks | **Role-based** — each membership role maps to exactly one certification track template |
| Certificate issuance | **Two-step**: system auto-creates with `status = "pending_approval"` when conditions are met → admin approves → status becomes `"approved"` (released to player) |
| Certificate approval | Company admin only, via a new `POST /certification/certificates/{id}/approve` endpoint |

---

## 4. Role → Track Mapping (New Config)

Add to `backend/app/scoring_rules.py`:

```python
# Minimum tasks per module required for certification eligibility, keyed by membership role.
# Each inner dict: module_key → minimum number of ActivityLog entries in that module.
CERT_MIN_TASKS_PER_MODULE_BY_ROLE: Final[dict[str, dict[str, int]]] = {
    "hr_ops": {
        "employees": 3,
        "compliance": 2,
        "leave": 3,
    },
    "talent_acquisition": {
        "recruitment": 4,
        "employees": 2,
    },
    "ld_performance": {
        "training": 4,
        "employees": 2,
    },
    "compensation_analytics": {
        "compensation": 4,
        "employees": 2,
    },
    "company_admin": {
        "employees": 3,
        "compliance": 2,
        "leave": 2,
        "recruitment": 2,
        "training": 2,
        "compensation": 2,
    },
    "employee": {
        "employees": 1,
        "compliance": 1,
        "leave": 1,
    },
}

# Minimum overall quality score (0–100) required per role for certification eligibility.
CERT_MIN_SCORE_BY_ROLE: Final[dict[str, float]] = {
    "hr_ops": 75.0,
    "talent_acquisition": 75.0,
    "ld_performance": 75.0,
    "compensation_analytics": 75.0,
    "company_admin": 80.0,
    "employee": 65.0,
}

# Fallback values used when a role is not in the maps above.
CERT_DEFAULT_MIN_TASKS_PER_MODULE: Final[dict[str, int]] = {
    "employees": 2,
    "compliance": 1,
    "leave": 1,
}
CERT_DEFAULT_MIN_SCORE: Final[float] = 70.0
```

---

## 5. Database Changes

### 5.1 `Certificate` model — add `approval_status` column

File: `backend/app/models/certification.py`

Add to the `Certificate` class:
```python
approval_status: Mapped[str] = mapped_column(String(32), default="pending_approval", nullable=False)
```

Valid values: `"pending_approval"` | `"approved"`

### 5.2 Alembic migration (or SQLite direct)

Since the project uses SQLite with `hworkr.db`, check how migrations are handled.

- If using Alembic: generate migration `alembic revision --autogenerate -m "add_cert_approval_status"` and apply.
- If no Alembic: add the column with `ALTER TABLE certificates ADD COLUMN approval_status VARCHAR(32) NOT NULL DEFAULT 'pending_approval'` directly in the DB init or recreate via `Base.metadata.create_all`.

> **Agent note:** Check `backend/app/database.py` to see if the project uses `create_all` (dev mode) or Alembic. If `create_all`, the model change is enough. If Alembic, generate a migration.

---

## 6. Backend Changes

### 6.1 `backend/app/scoring_rules.py`

Add the four config blocks from §4 above. No other changes to this file.

---

### 6.2 `backend/app/services/certification_rules.py`

Replace the entire file with a new version that:

1. **Resolves the role** from `CompanyMembership` for the target user in the given company.
2. **Checks per-module task minimums** by counting `ActivityLog` rows grouped by module.
3. **Checks overall score threshold** using the per-role minimum.
4. **Strips time-window enforcement** (remove `max_days` check entirely from non-admin path).
5. **Keeps critical_failure block** as-is.
6. **Keeps min_score from CertTrack** as a secondary override (track's own `min_score` still applies if it's higher than the role default).

New function signature stays the same: `validate_certificate_issuance(db, *, company_id, track, target_user_id, proposed_score, issuer_is_company_admin)`.

Logic outline:
```python
def validate_certificate_issuance(db, *, company_id, track, target_user_id, proposed_score, issuer_is_company_admin):
    if issuer_is_company_admin:
        return

    # 1. Resolve membership role
    membership = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == target_user_id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    role = membership.role if membership else "employee"

    # 2. Per-module task minimums
    min_tasks = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role, CERT_DEFAULT_MIN_TASKS_PER_MODULE)
    logs = db.execute(
        select(ActivityLog).where(
            ActivityLog.company_id == company_id,
            ActivityLog.user_id == target_user_id,
        )
    ).scalars().all()
    tasks_by_module = Counter(log.module for log in logs)
    for module, required_count in min_tasks.items():
        actual = tasks_by_module.get(module, 0)
        if actual < required_count:
            raise HTTPException(400, detail=f"Module '{module}' requires {required_count} tasks (have {actual})")

    # 3. Overall score threshold
    role_min_score = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    effective_min = max(role_min_score, track.min_score)  # stricter of the two wins
    if proposed_score < effective_min:
        raise HTTPException(400, detail=f"Score {proposed_score:.1f} below required {effective_min:.1f}")

    # 4. Critical failure check (from requirements_json on track)
    req = track.requirements_json or {}
    if req.get("disallow_critical_failures"):
        for log in logs:
            ctx = log.context_json
            if isinstance(ctx, dict) and ctx.get("critical_failure"):
                raise HTTPException(400, detail="Certification blocked due to critical failure on record")

    # 5. Legacy required_action_keys check (keep for backwards compat)
    prog = db.execute(select(CertProgress).where(...)).scalar_one_or_none()
    completed = prog.completed_actions_json if prog else {}
    for key in req.get("required_action_keys") or []:
        if not completed.get(key):
            raise HTTPException(400, detail=f"Missing required completed action: {key}")
```

---

### 6.3 `backend/app/services/auto_certification.py` (NEW FILE)

Create a new service file. This is the auto-issuance trigger called after every scored HR action.

```python
"""
Auto-certification trigger.

Call check_and_auto_issue(db, company_id, user_id) after any scored HR action
to detect when a player has just become eligible and auto-create a pending certificate.
"""

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.certification import CertProgress, CertTrack, Certificate
from app.models.membership import CompanyMembership
from app.models.tracking import ActivityLog
from app.scoring_rules import (
    CERT_DEFAULT_MIN_SCORE,
    CERT_DEFAULT_MIN_TASKS_PER_MODULE,
    CERT_MIN_SCORE_BY_ROLE,
    CERT_MIN_TASKS_PER_MODULE_BY_ROLE,
    PROGRESS_MODULES,
)
import uuid


def _compute_overall_score(logs: list) -> float | None:
    scores = [float(l.quality_score) for l in logs if l.quality_score is not None]
    return round(sum(scores) / len(scores), 2) if scores else None


def check_and_auto_issue(db: Session, company_id: str, user_id: str) -> Certificate | None:
    """
    Check if the user is now eligible for certification on any active track.
    If eligible and no pending/approved certificate exists yet, auto-create one
    with approval_status='pending_approval'.

    Returns the created Certificate row, or None if nothing was issued.
    """
    membership = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    role = membership.role if membership else "employee"

    # Find the relevant track for this role
    track = db.execute(
        select(CertTrack).where(
            CertTrack.company_id == company_id,
            CertTrack.role_type == role,
        ).order_by(CertTrack.created_at.desc())
    ).scalar_one_or_none()
    if track is None:
        return None  # No track configured for this role yet

    # Check if a certificate already exists (pending or approved)
    existing = db.execute(
        select(Certificate).where(
            Certificate.company_id == company_id,
            Certificate.user_id == user_id,
            Certificate.track_id == track.id,
        )
    ).scalar_one_or_none()
    if existing:
        return None  # Already issued

    # Fetch all activity logs for this user in this company
    logs = db.execute(
        select(ActivityLog).where(
            ActivityLog.company_id == company_id,
            ActivityLog.user_id == user_id,
            ActivityLog.module.in_(tuple(PROGRESS_MODULES.keys())),
        )
    ).scalars().all()

    # Check per-module task minimums
    min_tasks = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role, CERT_DEFAULT_MIN_TASKS_PER_MODULE)
    tasks_by_module = Counter(log.module for log in logs)
    for module, required_count in min_tasks.items():
        if tasks_by_module.get(module, 0) < required_count:
            return None  # Not enough tasks in this module

    # Check overall score threshold
    overall = _compute_overall_score(logs)
    if overall is None:
        return None
    role_min = CERT_MIN_SCORE_BY_ROLE.get(role, CERT_DEFAULT_MIN_SCORE)
    effective_min = max(role_min, track.min_score)
    if overall < effective_min:
        return None  # Score not high enough yet

    # Check no critical failures
    req = track.requirements_json or {}
    if req.get("disallow_critical_failures", True):  # default: block on critical failure
        for log in logs:
            ctx = log.context_json
            if isinstance(ctx, dict) and ctx.get("critical_failure"):
                return None

    # All conditions met — auto-issue with pending_approval
    prog = db.execute(
        select(CertProgress).where(
            CertProgress.company_id == company_id,
            CertProgress.user_id == user_id,
            CertProgress.track_id == track.id,
        )
    ).scalar_one_or_none()

    cert = Certificate(
        id=uuid_str(),
        track_id=track.id,
        company_id=company_id,
        user_id=user_id,
        level=track.level,
        score=overall,
        breakdown_json={
            "overall": overall,
            "tasks_by_module": dict(tasks_by_module),
            "role": role,
            "auto_issued": True,
        },
        verification_id=uuid.uuid4().hex,
        approval_status="pending_approval",
    )
    db.add(cert)

    if prog:
        prog.status = "pending_approval"

    db.commit()
    db.refresh(cert)
    return cert
```

---

### 6.4 `backend/app/api/v1/certification.py` — changes

#### a) Add `approval_status` to `CertificateOut` schema (schemas file first)

In `backend/app/schemas/certification.py`, add to `CertificateOut`:
```python
approval_status: str = "pending_approval"
```

#### b) Update `issue_certificate` endpoint

Change `POST /certificates/issue` to set `approval_status = "pending_approval"` on new certs (not immediately approved). This means manually issued certs also go through approval.

#### c) Add new admin endpoint: `POST /certificates/{certificate_id}/approve`

```python
@router.post("/certificates/{certificate_id}/approve", response_model=CertificateOut)
def approve_certificate(
    company_id: str,
    certificate_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> Certificate:
    user, _ = ctx
    cert = db.execute(
        select(Certificate).where(
            Certificate.id == certificate_id,
            Certificate.company_id == company_id,
        )
    ).scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.approval_status == "approved":
        raise HTTPException(status_code=400, detail="Certificate already approved")
    cert.approval_status = "approved"
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="certificate", entity_id=cert.id, action="approve", changes_json={})
    db.commit()
    db.refresh(cert)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="certificate.approved",
        entity_type="certificate",
        entity_id=cert.id,
        actor_user_id=user.id,
        data={"user_id": cert.user_id, "track_id": cert.track_id, "verification_id": cert.verification_id},
    )
    return cert
```

#### d) Add admin endpoint: `GET /certificates/pending` — list all pending certs for admin review

```python
@router.get("/certificates/pending", response_model=list[CertificateOut])
def list_pending_certificates(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path({"company_admin"}))],
    db: Annotated[Session, Depends(get_db)],
) -> list[Certificate]:
    r = db.execute(
        select(Certificate)
        .where(
            Certificate.company_id == company_id,
            Certificate.approval_status == "pending_approval",
        )
        .order_by(Certificate.issued_at.desc())
    )
    return list(r.scalars().all())
```

#### e) Hook auto-issuance into the activity log flow

In `backend/app/services/activity_tracking.py` (wherever `log_tracked_hr_action` is defined), after the `db.commit()` that saves the log, call:

```python
from app.services.auto_certification import check_and_auto_issue
check_and_auto_issue(db, company_id=company_id, user_id=user_id)
```

> **Agent note:** Import guard against circular imports — use a local import if needed.

---

### 6.5 Progress dashboard — update eligibility logic

In `backend/app/api/v1/certification.py`, inside `get_my_progress_dashboard`, replace the current `required_actions` check with the per-module task count check:

```python
# Resolve role
membership = db.execute(
    select(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.user_id == user.id,
        CompanyMembership.status == "active",
    )
).scalar_one_or_none()
role = membership.role if membership else "employee"

min_tasks_map = CERT_MIN_TASKS_PER_MODULE_BY_ROLE.get(role, CERT_DEFAULT_MIN_TASKS_PER_MODULE)
tasks_by_module = Counter(log.module for log in logs)

# Build per-module progress for display
module_task_progress = [
    {"module": mod, "required": req, "completed": tasks_by_module.get(mod, 0)}
    for mod, req in min_tasks_map.items()
]

required_actions_total = sum(min_tasks_map.values())
required_actions_completed = sum(
    min(tasks_by_module.get(mod, 0), req) for mod, req in min_tasks_map.items()
)
missing_required = [
    f"{mod} ({tasks_by_module.get(mod,0)}/{req})"
    for mod, req in min_tasks_map.items()
    if tasks_by_module.get(mod, 0) < req
]
```

Also add `module_task_progress` to `CertificationProgressDashboardOut` schema:
```python
module_task_progress: list[dict] = []
```

---

## 7. Frontend Changes

### 7.1 `frontend/src/api/types.ts`

Update `Certificate` type:
```typescript
export type Certificate = {
  id: string
  track_id: string
  company_id: string
  user_id: string
  level: string
  score: number
  breakdown_json: Record<string, unknown> | null
  issued_at: string
  verification_id: string
  approval_status: 'pending_approval' | 'approved'  // ADD THIS
}
```

Update `CertificationProgressDashboard` type:
```typescript
export type ModuleTaskProgress = {
  module: string
  required: number
  completed: number
}

export type CertificationProgressDashboard = {
  overall_score: number | null
  action_count: number
  dimension_averages: ProgressDimension
  module_breakdown: ProgressModule[]
  required_actions_total: number
  required_actions_completed: number
  missing_required_actions: string[]
  module_task_progress: ModuleTaskProgress[]  // ADD THIS
  critical_failure_count: number
  status: string
  recent_actions: ProgressRecentAction[]
}
```

### 7.2 `frontend/src/api/certificationApi.ts`

Add:
```typescript
export function approveCertificate(companyId: string, certificateId: string) {
  return apiFetch<Certificate>(
    companyPath(companyId, `/certification/certificates/${certificateId}/approve`),
    { method: 'POST' }
  )
}

export function listPendingCertificates(companyId: string) {
  return apiFetch<Certificate[]>(companyPath(companyId, '/certification/certificates/pending'))
}
```

### 7.3 `frontend/src/pages/company/progress/ProgressPage.tsx`

Replace the **"Core required actions"** section with a **per-module task checklist**:

- For each `module_task_progress` entry, show:
  - Module name
  - `completed / required` count
  - Progress bar
  - Green checkmark when `completed >= required`

Show a new **"Pending approval"** status pill when `status === "pending_approval"` (update `statusPillClass` function).

### 7.4 New admin page: `frontend/src/pages/company/certification/CertApprovalsPage.tsx`

Create a new page (admin only) that:
- Fetches `listPendingCertificates(companyId)`
- Shows a table: user, track, score, issued date, breakdown
- "Approve" button calls `approveCertificate(companyId, cert.id)`, removes from list

Add route in `CompanyLayout.tsx` for admins: `certification/approvals` → `CertApprovalsPage`.

---

## 8. Schemas Summary

### Updated `CertificationProgressDashboardOut` (backend Pydantic)

```python
class ModuleTaskProgressOut(BaseModel):
    module: str
    required: int
    completed: int

class CertificationProgressDashboardOut(BaseModel):
    overall_score: float | None
    action_count: int
    dimension_averages: ProgressDimensionOut
    module_breakdown: list[ProgressModuleOut]
    required_actions_total: int
    required_actions_completed: int
    missing_required_actions: list[str]
    module_task_progress: list[ModuleTaskProgressOut]
    critical_failure_count: int
    status: str
    recent_actions: list[ProgressRecentActionOut]
```

### Updated `CertificateOut` (backend Pydantic)

```python
class CertificateOut(BaseModel):
    id: str
    track_id: str
    company_id: str
    user_id: str
    level: str
    score: float
    breakdown_json: dict[str, Any] | None
    issued_at: datetime
    verification_id: str
    approval_status: str  # ADD THIS

    model_config = {"from_attributes": True}
```

---

## 9. Full Status State Machine

### `CertProgress.status`
```
in_progress  →  pending_approval  →  completed
                                  ↑
                           (after admin approves cert)
```

### `Certificate.approval_status`
```
pending_approval  →  approved
```

### Progress dashboard `status` field
```
not_started
in_progress
failed                   ← critical_failure_count > 0
eligible_for_assessment  ← all module task minimums met + score >= threshold (auto-issue fires here)
pending_approval         ← cert auto-created, awaiting admin
completed                ← cert approved
```

---

## 10. File Change Checklist

```
backend/app/scoring_rules.py                        ← ADD 4 new config blocks
backend/app/models/certification.py                 ← ADD approval_status to Certificate
backend/app/schemas/certification.py                ← ADD ModuleTaskProgressOut, update CertificateOut + DashboardOut
backend/app/services/certification_rules.py         ← REWRITE (task-count + score check, no time gate)
backend/app/services/auto_certification.py          ← NEW FILE
backend/app/services/activity_tracking.py           ← ADD check_and_auto_issue() call after commit
backend/app/api/v1/certification.py                 ← ADD approve endpoint, pending list, update dashboard logic
frontend/src/api/types.ts                           ← UPDATE Certificate + CertificationProgressDashboard
frontend/src/api/certificationApi.ts                ← ADD approveCertificate, listPendingCertificates
frontend/src/pages/company/progress/ProgressPage.tsx  ← REPLACE required actions section with module task bars
frontend/src/pages/company/certification/CertApprovalsPage.tsx  ← NEW FILE (admin approval UI)
frontend/src/pages/company/CompanyLayout.tsx        ← ADD route for CertApprovalsPage
```

> **DB migration note:** The only DB schema change is adding `approval_status VARCHAR(32) NOT NULL DEFAULT 'pending_approval'` to the `certificates` table. If `create_all` is used in dev, the model change is sufficient. If Alembic is used, run `alembic revision --autogenerate`.

---

## 11. What Is Intentionally NOT Changed

- Timeliness dimension weight stays at 20% in `scoring_rules.py` — it contributes to overall quality score (and thus to certification eligibility score), but there is **no separate time cap or time-based gate**.
- The `max_days` field in `CertTrack.requirements_json` still exists in the DB but is **not enforced** in the new `validate_certificate_issuance`.
- Company admins still bypass all checks (early return in validator).
- The existing `POST /certificates/issue` manual flow stays available.

---

## 12. Open Question (Resolve Before Implementing)

One question was not fully answered in the planning session:

> **If no `CertTrack` exists yet for a given role, should the system:**
> - **(a)** silently skip auto-issuance (current plan — safe default), or
> - **(b)** prevent users from reaching "eligible for assessment" status until a track exists?

Current spec uses **(a)**. If you want **(b)**, add a track-existence check to the dashboard status logic.
