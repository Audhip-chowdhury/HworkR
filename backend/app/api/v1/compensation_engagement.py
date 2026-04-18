from datetime import date, datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from collections import defaultdict

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.config import settings
from app.database import get_db
from app.models.audit import AuditTrailEntry
from app.models.base import uuid_str
from app.models.compensation_engagement import (
    BenefitsEnrollment,
    BenefitsPlan,
    CompensationGradeBand,
    PayRun,
    PayRunEmployeeLine,
    PayrollLedgerEntry,
    Payslip,
    SalaryStructure,
    Survey,
    SurveyActionPlan,
    SurveyResponse,
)
from app.models.employee import Employee
from app.models.membership import CompanyMembership
from app.models.org import Department
from app.models.user import User
from app.schemas.compensation_engagement import (
    BenefitsEnrollmentCreate,
    BenefitsEnrollmentOut,
    BenefitsEnrollmentSummaryOut,
    BenefitsEnrollmentUpdate,
    BenefitsPlanCreate,
    BenefitsPlanEnrollmentCountsOut,
    BenefitsPlanOut,
    BenefitsPlanUpdate,
    CompensationGradeBandCreate,
    CompensationGradeBandOut,
    CompensationGradeBandUpdate,
    GradeBandAuditOut,
    PayRunCreate,
    PayRunDepartmentOverviewOut,
    PayRunEmployeeLineOut,
    PayRunOut,
    PayRunUpdate,
    PayrollEngineExpectedOut,
    PayrollFieldValidation,
    PayrollReconciliationExpectedOut,
    PayrollReconciliationValidateIn,
    PayrollValidateCalculationIn,
    PayrollValidateCalculationOut,
    PayrollLedgerEntryOut,
    PayslipCreate,
    PayslipOut,
    SalaryStructureAuditOut,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
    SurveyActionPlanCreate,
    SurveyActionPlanOut,
    SurveyActionPlanUpdate,
    SurveyCreate,
    SurveyOut,
    SurveyResponseCreate,
    SurveyResponseOut,
    SurveyTemplateOut,
    SurveyTemplateQuestionOut,
    SurveyUpdate,
)
from app.services.audit import write_audit
from app.services.payroll_supplemental import (
    list_ledger_entries_for_payslip,
    sync_ledger_entries_for_payslip,
    validate_payslip_supplemental_vs_gross,
)
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.simcash_engine import (
    breakdown_to_submitted_map,
    compare_reconciliation_submitted,
    compare_submitted,
    compute_monthly_breakdown,
    normalize_submitted_numbers,
    parse_salary_components,
    payslip_deductions_total,
)

router = APIRouter(prefix="/companies/{company_id}", tags=["compensation-engagement"])

_COMP = frozenset({"company_admin", "compensation_analytics"})
# Survey / engagement management — all HR-adjacent roles can create, edit, delete surveys and action plans.
_SURVEY_OPS = frozenset({"company_admin", "compensation_analytics", "hr_ops"})
# Patch action plan: all survey-ops roles can edit any field.
_ACTION_PLAN_PATCH_ROLES = frozenset({"company_admin", "compensation_analytics", "hr_ops"})
# List all survey responses for analysis.
_ENGAGEMENT_SURVEY_RESPONSE_REVIEWERS = frozenset({"company_admin", "compensation_analytics", "hr_ops"})
# Payroll operations (structures, runs, payslips, SimCash engine).
_PAYROLL_OPS = frozenset({"company_admin", "compensation_analytics", "hr_ops"})
# Create pay run (company admin / comp analytics only).
_PAYROLL_COMPANY_ADMIN = frozenset({"company_admin", "compensation_analytics"})
# Release salary after payslip — HR ops only.
_PAYROLL_HR_RELEASE = frozenset({"hr_ops"})
# Create/update payslip worksheet — all configure roles (compensation_analytics = admin in payroll).
_PAYROLL_PAYSLIP_EDIT = frozenset({"company_admin", "compensation_analytics", "hr_ops"})

PAYROLL_STATUS_TO_BE_PROCESSED = "to_be_processed"
PAYROLL_STATUS_PAYSLIP_GENERATED = "payslip_generated"
PAYROLL_STATUS_SALARY_RELEASED = "salary_released"


def _parse_survey_calendar_date(s: str | None) -> date | None:
    if not s or not str(s).strip():
        return None
    t = str(s).strip()[:10]
    try:
        y, m, d = t.split("-")
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def _survey_templates_catalog() -> list[SurveyTemplateOut]:
    return [
        SurveyTemplateOut(
            id="enps_pulse",
            title="eNPS pulse",
            survey_type="pulse",
            questions=[
                SurveyTemplateQuestionOut(
                    id="q_enps_1",
                    text="How likely are you to recommend this company as a place to work? (1 = not at all, 5 = extremely)",
                    type="rating_1_5",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_enps_2",
                    text="Do you feel leadership acts on employee feedback?",
                    type="yes_no",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_enps_3",
                    text="What one thing would most improve your day-to-day experience?",
                    type="text",
                    required=False,
                ),
            ],
        ),
        SurveyTemplateOut(
            id="manager_effectiveness",
            title="Manager effectiveness",
            survey_type="standard",
            questions=[
                SurveyTemplateQuestionOut(
                    id="q_mgr_1",
                    text="My manager gives clear expectations.",
                    type="rating_1_5",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_mgr_2",
                    text="My manager supports my development.",
                    type="rating_1_5",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_mgr_3",
                    text="I receive useful feedback from my manager.",
                    type="yes_no",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_mgr_4",
                    text="What could your manager do more of?",
                    type="text",
                    required=False,
                ),
            ],
        ),
        SurveyTemplateOut(
            id="onboarding_30d",
            title="Onboarding feedback (30-day)",
            survey_type="pulse",
            questions=[
                SurveyTemplateQuestionOut(
                    id="q_ob_1",
                    text="How supported did you feel during your first 30 days? (1–5)",
                    type="rating_1_5",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_ob_2",
                    text="Were tools and access ready when you needed them?",
                    type="yes_no",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_ob_3",
                    text="What would have made onboarding smoother?",
                    type="text",
                    required=True,
                ),
            ],
        ),
        SurveyTemplateOut(
            id="quarterly_pulse",
            title="Quarterly pulse",
            survey_type="pulse",
            questions=[
                SurveyTemplateQuestionOut(
                    id="q_qp_1",
                    text="Overall, how satisfied are you with your role this quarter? (1–5)",
                    type="rating_1_5",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_qp_2",
                    text="Are you proud to work here?",
                    type="yes_no",
                    required=True,
                ),
                SurveyTemplateQuestionOut(
                    id="q_qp_3",
                    text="What should we prioritize next quarter?",
                    type="text",
                    required=False,
                ),
            ],
        ),
    ]


def _employee_display_name(emp: Employee) -> str:
    pi = emp.personal_info_json
    if isinstance(pi, dict):
        fn = pi.get("full_name")
        if isinstance(fn, str) and fn.strip():
            return fn.strip()
    return emp.employee_code


def _employee_work_email(db: Session, emp: Employee) -> str | None:
    if not emp.user_id:
        return None
    u = db.execute(select(User).where(User.id == emp.user_id)).scalar_one_or_none()
    return u.email if u else None


def _upsert_payroll_line_status(
    db: Session,
    company_id: str,
    pay_run_id: str,
    employee_id: str,
    status: str,
) -> None:
    now = datetime.now(timezone.utc)
    line = db.execute(
        select(PayRunEmployeeLine).where(
            PayRunEmployeeLine.pay_run_id == pay_run_id,
            PayRunEmployeeLine.employee_id == employee_id,
            PayRunEmployeeLine.company_id == company_id,
        )
    ).scalar_one_or_none()
    if line:
        line.status = status
        line.updated_at = now
    else:
        db.add(
            PayRunEmployeeLine(
                id=uuid_str(),
                company_id=company_id,
                pay_run_id=pay_run_id,
                employee_id=employee_id,
                status=status,
                updated_at=now,
            )
        )


def _department_name_for_pay_run(db: Session, company_id: str, department_id: str | None) -> str | None:
    if not department_id:
        return None
    d = db.execute(
        select(Department).where(Department.id == department_id, Department.company_id == company_id)
    ).scalar_one_or_none()
    return d.name if d else None


def _pay_run_to_out(db: Session, company_id: str, row: PayRun) -> PayRunOut:
    rk = getattr(row, "run_kind", None) or "regular"
    return PayRunOut(
        id=row.id,
        company_id=row.company_id,
        department_id=row.department_id,
        department_name=_department_name_for_pay_run(db, company_id, row.department_id),
        month=row.month,
        year=row.year,
        status=row.status,
        processed_by=row.processed_by,
        processed_at=row.processed_at,
        created_at=row.created_at,
        run_kind=rk,
        pay_date=getattr(row, "pay_date", None),
        run_label=getattr(row, "run_label", None),
    )


def _simcash_debug_response(x_simcash_debug: str | None) -> bool:
    if settings.simcash_debug:
        return True
    if settings.debug and (x_simcash_debug or "").strip() == "1":
        return True
    return False


def _salary_components_snapshot(components_json: dict[str, Any] | None) -> dict[str, Any]:
    if not components_json or not isinstance(components_json, dict):
        return {"ctc_annual": None, "bonus_pct_of_ctc": None}
    return {
        "ctc_annual": components_json.get("ctc_annual"),
        "bonus_pct_of_ctc": components_json.get("bonus_pct_of_ctc"),
    }


def _validate_grade_band_mmm(*, min_annual: int, mid_annual: int, max_annual: int) -> None:
    if min_annual > mid_annual or mid_annual > max_annual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_annual, mid_annual, max_annual must satisfy min ≤ mid ≤ max",
        )


def _validate_org_grade_range(omin: int | None, omax: int | None) -> None:
    if omin is not None and omax is not None and omin > omax:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_position_grade_min must be ≤ org_position_grade_max",
        )


@router.get("/payroll/grade-bands/audit", response_model=list[GradeBandAuditOut])
def list_grade_band_audit(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=200, le=500),
) -> list[GradeBandAuditOut]:
    _user, _ = ctx
    q = (
        select(AuditTrailEntry, User)
        .outerjoin(User, AuditTrailEntry.user_id == User.id)
        .where(
            AuditTrailEntry.company_id == company_id,
            AuditTrailEntry.entity_type == "grade_band",
        )
        .order_by(AuditTrailEntry.timestamp.desc())
        .limit(limit)
    )
    rows = db.execute(q).all()
    out: list[GradeBandAuditOut] = []
    for entry, actor in rows:
        out.append(
            GradeBandAuditOut(
                id=entry.id,
                entity_id=entry.entity_id,
                action=entry.action,
                changes_json=entry.changes_json,
                user_id=entry.user_id,
                user_name=actor.name if actor else None,
                user_email=actor.email if actor else None,
                timestamp=entry.timestamp,
            )
        )
    return out


@router.get("/payroll/grade-bands", response_model=list[CompensationGradeBandOut])
def list_grade_bands(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompensationGradeBand]:
    _user, _ = ctx
    q = (
        select(CompensationGradeBand)
        .where(CompensationGradeBand.company_id == company_id)
        .order_by(CompensationGradeBand.band_code.asc(), CompensationGradeBand.effective_from.desc())
    )
    return list(db.execute(q).scalars().all())


@router.post("/payroll/grade-bands", response_model=CompensationGradeBandOut, status_code=status.HTTP_201_CREATED)
def create_grade_band(
    company_id: str,
    body: CompensationGradeBandCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationGradeBand:
    user, _ = ctx
    code = body.band_code.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="band_code is required")
    _validate_grade_band_mmm(min_annual=body.min_annual, mid_annual=body.mid_annual, max_annual=body.max_annual)
    _validate_org_grade_range(body.org_position_grade_min, body.org_position_grade_max)
    row = CompensationGradeBand(
        id=uuid_str(),
        company_id=company_id,
        band_code=code,
        display_name=body.display_name.strip() if body.display_name and body.display_name.strip() else None,
        min_annual=body.min_annual,
        mid_annual=body.mid_annual,
        max_annual=body.max_annual,
        currency_code=(body.currency_code or "INR").strip() or "INR",
        effective_from=body.effective_from.strip(),
        effective_to=body.effective_to.strip() if body.effective_to and body.effective_to.strip() else None,
        notes=body.notes.strip() if body.notes and body.notes.strip() else None,
        org_position_grade_min=body.org_position_grade_min,
        org_position_grade_max=body.org_position_grade_max,
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="grade_band",
        entity_id=row.id,
        action="create",
        changes_json={
            "band_code": row.band_code,
            "min_annual": row.min_annual,
            "mid_annual": row.mid_annual,
            "max_annual": row.max_annual,
            "currency_code": row.currency_code,
            "effective_from": row.effective_from,
            "effective_to": row.effective_to,
            "org_position_grade_min": row.org_position_grade_min,
            "org_position_grade_max": row.org_position_grade_max,
        },
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A band with this code and effective_from already exists for this company",
        ) from None
    db.refresh(row)
    return row


@router.patch("/payroll/grade-bands/{band_id}", response_model=CompensationGradeBandOut)
def update_grade_band(
    company_id: str,
    band_id: str,
    body: CompensationGradeBandUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationGradeBand:
    user, _ = ctx
    row = db.execute(
        select(CompensationGradeBand).where(
            CompensationGradeBand.id == band_id,
            CompensationGradeBand.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade band not found")
    data = body.model_dump(exclude_unset=True)
    old: dict[str, Any] = {
        "band_code": row.band_code,
        "display_name": row.display_name,
        "min_annual": row.min_annual,
        "mid_annual": row.mid_annual,
        "max_annual": row.max_annual,
        "currency_code": row.currency_code,
        "effective_from": row.effective_from,
        "effective_to": row.effective_to,
        "notes": row.notes,
        "org_position_grade_min": row.org_position_grade_min,
        "org_position_grade_max": row.org_position_grade_max,
    }
    if "band_code" in data and data["band_code"] is not None:
        c = str(data["band_code"]).strip()
        if not c:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="band_code cannot be empty")
        row.band_code = c
    if "display_name" in data:
        v = data["display_name"]
        row.display_name = v.strip() if isinstance(v, str) and v.strip() else None
    if "min_annual" in data and data["min_annual"] is not None:
        row.min_annual = data["min_annual"]
    if "mid_annual" in data and data["mid_annual"] is not None:
        row.mid_annual = data["mid_annual"]
    if "max_annual" in data and data["max_annual"] is not None:
        row.max_annual = data["max_annual"]
    if "currency_code" in data and data["currency_code"] is not None:
        row.currency_code = str(data["currency_code"]).strip() or "INR"
    if "effective_from" in data and data["effective_from"] is not None:
        row.effective_from = str(data["effective_from"]).strip()
    if "effective_to" in data:
        v = data["effective_to"]
        row.effective_to = v.strip() if isinstance(v, str) and v.strip() else None
    if "notes" in data:
        v = data["notes"]
        row.notes = v.strip() if isinstance(v, str) and v.strip() else None
    if "org_position_grade_min" in data:
        row.org_position_grade_min = data["org_position_grade_min"]
    if "org_position_grade_max" in data:
        row.org_position_grade_max = data["org_position_grade_max"]

    _validate_grade_band_mmm(min_annual=row.min_annual, mid_annual=row.mid_annual, max_annual=row.max_annual)
    _validate_org_grade_range(row.org_position_grade_min, row.org_position_grade_max)

    changes: dict[str, Any] = {}
    for k in old:
        if getattr(row, k) != old[k]:
            changes[k] = {"old": old[k], "new": getattr(row, k)}
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="grade_band",
        entity_id=row.id,
        action="update",
        changes_json=changes if changes else None,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A band with this code and effective_from already exists for this company",
        ) from None
    db.refresh(row)
    return row


@router.post("/payroll/salary-structures", response_model=SalaryStructureOut, status_code=status.HTTP_201_CREATED)
def create_salary_structure(
    company_id: str,
    body: SalaryStructureCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> SalaryStructure:
    user, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = SalaryStructure(
        id=uuid_str(),
        company_id=company_id,
        employee_id=body.employee_id,
        components_json=body.components_json,
        effective_from=body.effective_from,
    )
    db.add(row)
    snap = _salary_components_snapshot(body.components_json if isinstance(body.components_json, dict) else None)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="salary_structure",
        entity_id=row.id,
        action="create",
        changes_json={
            "employee_id": body.employee_id,
            "ctc_annual": snap.get("ctc_annual"),
            "bonus_pct_of_ctc": snap.get("bonus_pct_of_ctc"),
            "effective_from": body.effective_from,
        },
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/payroll/salary-structures", response_model=list[SalaryStructureOut])
def list_salary_structures(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[SalaryStructure]:
    user, membership = ctx
    q = select(SalaryStructure).where(SalaryStructure.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(SalaryStructure.employee_id == emp.id)
    elif employee_id:
        q = q.where(SalaryStructure.employee_id == employee_id)
    return list(db.execute(q.order_by(SalaryStructure.created_at.desc())).scalars().all())


@router.get("/payroll/salary-structures/audit", response_model=list[SalaryStructureAuditOut])
def list_salary_structure_audit(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=200, le=500),
) -> list[SalaryStructureAuditOut]:
    """Salary structure changes from audit_trail with actor name/email."""
    _user, _ = ctx
    q = (
        select(AuditTrailEntry, User)
        .outerjoin(User, AuditTrailEntry.user_id == User.id)
        .where(
            AuditTrailEntry.company_id == company_id,
            AuditTrailEntry.entity_type == "salary_structure",
        )
        .order_by(AuditTrailEntry.timestamp.desc())
        .limit(limit)
    )
    rows = db.execute(q).all()
    out: list[SalaryStructureAuditOut] = []
    for entry, actor in rows:
        out.append(
            SalaryStructureAuditOut(
                id=entry.id,
                entity_id=entry.entity_id,
                action=entry.action,
                changes_json=entry.changes_json,
                user_id=entry.user_id,
                user_name=actor.name if actor else None,
                user_email=actor.email if actor else None,
                timestamp=entry.timestamp,
            )
        )
    return out


@router.patch("/payroll/salary-structures/{structure_id}", response_model=SalaryStructureOut)
def update_salary_structure(
    company_id: str,
    structure_id: str,
    body: SalaryStructureUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> SalaryStructure:
    user, _ = ctx
    row = db.execute(
        select(SalaryStructure).where(
            SalaryStructure.id == structure_id,
            SalaryStructure.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found")
    data = body.model_dump(exclude_unset=True)
    old_cj = row.components_json if isinstance(row.components_json, dict) else {}
    old_eff = row.effective_from
    old_snap = _salary_components_snapshot(old_cj if old_cj else None)
    if "components_json" in data and isinstance(data["components_json"], dict):
        merged_cj = {**old_cj, **data["components_json"]}
    else:
        merged_cj = old_cj
    new_snap = _salary_components_snapshot(merged_cj if merged_cj else None)
    new_eff = data["effective_from"] if "effective_from" in data else old_eff

    audit_changes: dict[str, Any] = {"employee_id": row.employee_id}
    if "components_json" in data:
        for key in ("ctc_annual", "bonus_pct_of_ctc"):
            if old_snap.get(key) != new_snap.get(key):
                audit_changes[key] = {"old": old_snap.get(key), "new": new_snap.get(key)}
    if "effective_from" in data and old_eff != new_eff:
        audit_changes["effective_from"] = {"old": old_eff, "new": new_eff}

    for k, v in data.items():
        setattr(row, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="salary_structure",
        entity_id=structure_id,
        action="update",
        changes_json=audit_changes,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/payroll/pay-runs", response_model=PayRunOut, status_code=status.HTTP_201_CREATED)
def create_pay_run(
    company_id: str,
    body: PayRunCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_COMPANY_ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> PayRun:
    user, _ = ctx
    rk = body.run_kind if body.run_kind in ("regular", "off_cycle", "supplemental") else "regular"
    if body.department_id and rk == "regular":
        d = db.execute(
            select(Department).where(Department.id == body.department_id, Department.company_id == company_id)
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        dup = db.execute(
            select(PayRun).where(
                PayRun.company_id == company_id,
                PayRun.year == body.year,
                PayRun.month == body.month,
                PayRun.department_id == body.department_id,
                or_(PayRun.run_kind == "regular", PayRun.run_kind.is_(None)),
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pay run already exists for this month and department",
            )
    elif body.department_id:
        d = db.execute(
            select(Department).where(Department.id == body.department_id, Department.company_id == company_id)
        ).scalar_one_or_none()
        if d is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    if body.department_id:
        emp_count = db.execute(
            select(func.count())
            .select_from(Employee)
            .where(Employee.company_id == company_id, Employee.department_id == body.department_id)
        ).scalar_one()
    else:
        emp_count = db.execute(
            select(func.count()).select_from(Employee).where(Employee.company_id == company_id)
        ).scalar_one()
    if emp_count == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No active employees found for this pay run. Add employees first.",
        )

    row = PayRun(
        id=uuid_str(),
        company_id=company_id,
        department_id=body.department_id,
        month=body.month,
        year=body.year,
        status=body.status,
        run_kind=rk,
        pay_date=body.pay_date.strip() if body.pay_date and str(body.pay_date).strip() else None,
        run_label=body.run_label.strip() if body.run_label and str(body.run_label).strip() else None,
    )
    db.add(row)
    db.flush()
    if body.department_id:
        now = datetime.now(timezone.utc)
        emps = db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                Employee.department_id == body.department_id,
            )
        ).scalars().all()
        for emp in emps:
            db.add(
                PayRunEmployeeLine(
                    id=uuid_str(),
                    company_id=company_id,
                    pay_run_id=row.id,
                    employee_id=emp.id,
                    status=PAYROLL_STATUS_TO_BE_PROCESSED,
                    updated_at=now,
                )
            )
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="pay_run", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return _pay_run_to_out(db, company_id, row)


@router.get("/payroll/pay-runs", response_model=list[PayRunOut])
def list_pay_runs(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PayRunOut]:
    r = db.execute(
        select(PayRun).where(PayRun.company_id == company_id).order_by(PayRun.year.desc(), PayRun.month.desc())
    )
    rows = list(r.scalars().all())
    return [_pay_run_to_out(db, company_id, row) for row in rows]


@router.get("/payroll/pay-runs/period-overview", response_model=list[PayRunDepartmentOverviewOut])
def pay_run_period_overview(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    department_id: str | None = Query(None, description="Restrict to one department"),
    status_filter: str | None = Query(
        None,
        description="Filter rows: to_be_processed | payslip_generated | salary_released",
    ),
) -> list[PayRunDepartmentOverviewOut]:
    """Departments for a calendar month with per-employee payroll status for the matching pay run."""
    valid_sf = {
        PAYROLL_STATUS_TO_BE_PROCESSED,
        PAYROLL_STATUS_PAYSLIP_GENERATED,
        PAYROLL_STATUS_SALARY_RELEASED,
    }
    sf = status_filter if status_filter in valid_sf else None

    dq = select(Department).where(Department.company_id == company_id).order_by(Department.name)
    if department_id:
        dq = dq.where(Department.id == department_id)
    depts = list(db.execute(dq).scalars().all())

    out: list[PayRunDepartmentOverviewOut] = []
    for dept in depts:
        pr = db.execute(
            select(PayRun).where(
                PayRun.company_id == company_id,
                PayRun.year == year,
                PayRun.month == month,
                PayRun.department_id == dept.id,
                or_(PayRun.run_kind == "regular", PayRun.run_kind.is_(None)),
            )
        ).scalar_one_or_none()

        if pr is None:
            continue

        lines_all = list(
            db.execute(
                select(PayRunEmployeeLine).where(PayRunEmployeeLine.pay_run_id == pr.id)
            ).scalars().all()
        )
        all_released = len(lines_all) > 0 and all(
            ln.status == PAYROLL_STATUS_SALARY_RELEASED for ln in lines_all
        )
        dept_row_status = "payrun_closed" if all_released else "open"

        employees_out: list[PayRunEmployeeLineOut] = []
        for line in lines_all:
            if sf is not None and line.status != sf:
                continue
            emp = get_employee_by_id(db, company_id, line.employee_id)
            if emp is None:
                continue
            employees_out.append(
                PayRunEmployeeLineOut(
                    employee_id=emp.id,
                    employee_code=emp.employee_code,
                    full_name=_employee_display_name(emp),
                    email=_employee_work_email(db, emp),
                    payroll_status=line.status,
                )
            )

        out.append(
            PayRunDepartmentOverviewOut(
                department_id=dept.id,
                department_name=dept.name,
                pay_run_id=pr.id,
                department_pay_run_status=dept_row_status,
                employees=employees_out,
            )
        )
    return out


@router.post(
    "/payroll/pay-runs/{pay_run_id}/employees/{employee_id}/release-salary",
    response_model=PayRunEmployeeLineOut,
)
def release_employee_salary(
    company_id: str,
    pay_run_id: str,
    employee_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_HR_RELEASE))],
    db: Annotated[Session, Depends(get_db)],
) -> PayRunEmployeeLineOut:
    user, _ = ctx
    pr = db.execute(
        select(PayRun).where(PayRun.id == pay_run_id, PayRun.company_id == company_id)
    ).scalar_one_or_none()
    if pr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay run not found")
    line = db.execute(
        select(PayRunEmployeeLine).where(
            PayRunEmployeeLine.pay_run_id == pay_run_id,
            PayRunEmployeeLine.employee_id == employee_id,
            PayRunEmployeeLine.company_id == company_id,
        )
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll line not found")
    if line.status != PAYROLL_STATUS_PAYSLIP_GENERATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Salary can only be released after payslip is generated",
        )
    now = datetime.now(timezone.utc)
    line.status = PAYROLL_STATUS_SALARY_RELEASED
    line.updated_at = now
    emp = get_employee_by_id(db, company_id, employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="pay_run_employee_line",
        entity_id=line.id,
        action="release_salary",
        changes_json={"employee_id": employee_id, "pay_run_id": pay_run_id},
    )
    db.commit()
    return PayRunEmployeeLineOut(
        employee_id=emp.id,
        employee_code=emp.employee_code,
        full_name=_employee_display_name(emp),
        email=_employee_work_email(db, emp),
        payroll_status=line.status,
    )


@router.patch("/payroll/pay-runs/{pay_run_id}", response_model=PayRunOut)
def update_pay_run(
    company_id: str,
    pay_run_id: str,
    body: PayRunUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> PayRun:
    user, _ = ctx
    r = db.execute(select(PayRun).where(PayRun.id == pay_run_id, PayRun.company_id == company_id))
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay run not found")
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        row.status = data["status"]
        if data["status"] == "processed":
            row.processed_by = user.id
            row.processed_at = datetime.now(timezone.utc)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="pay_run", entity_id=pay_run_id, action="update", changes_json=data)
    db.commit()
    db.refresh(row)
    return _pay_run_to_out(db, company_id, row)


@router.post("/payroll/payslips", response_model=PayslipOut, status_code=status.HTTP_201_CREATED)
def create_payslip(
    company_id: str,
    body: PayslipCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_PAYSLIP_EDIT))],
    db: Annotated[Session, Depends(get_db)],
) -> Payslip:
    user, _ = ctx
    pr = db.execute(select(PayRun).where(PayRun.id == body.pay_run_id, PayRun.company_id == company_id)).scalar_one_or_none()
    if pr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay run not found")
    emp = get_employee_by_id(db, company_id, body.employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    rk = getattr(pr, "run_kind", None) or "regular"
    if pr.department_id is not None and emp.department_id != pr.department_id and rk == "regular":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee must belong to the pay run department",
        )
    validate_payslip_supplemental_vs_gross(
        gross=body.gross,
        earnings_json=body.earnings_json if isinstance(body.earnings_json, dict) else None,
    )
    existing = db.execute(
        select(Payslip).where(
            Payslip.pay_run_id == body.pay_run_id,
            Payslip.employee_id == body.employee_id,
            Payslip.company_id == company_id,
        )
    ).scalar_one_or_none()
    if existing:
        existing.gross = body.gross
        existing.earnings_json = body.earnings_json
        existing.deductions_json = body.deductions_json
        existing.net = body.net
        existing.pdf_url = body.pdf_url
        row = existing
        audit_action = "update"
    else:
        row = Payslip(
            id=uuid_str(),
            pay_run_id=body.pay_run_id,
            company_id=company_id,
            employee_id=body.employee_id,
            gross=body.gross,
            earnings_json=body.earnings_json,
            deductions_json=body.deductions_json,
            net=body.net,
            pdf_url=body.pdf_url,
        )
        db.add(row)
        audit_action = "create"
    db.flush()
    sync_ledger_entries_for_payslip(db, row)
    line = db.execute(
        select(PayRunEmployeeLine).where(
            PayRunEmployeeLine.pay_run_id == body.pay_run_id,
            PayRunEmployeeLine.employee_id == body.employee_id,
            PayRunEmployeeLine.company_id == company_id,
        )
    ).scalar_one_or_none()
    if line is None or line.status != PAYROLL_STATUS_SALARY_RELEASED:
        _upsert_payroll_line_status(
            db, company_id, body.pay_run_id, body.employee_id, PAYROLL_STATUS_PAYSLIP_GENERATED
        )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="payslip",
        entity_id=row.id,
        action=audit_action,
        changes_json={},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/payroll/payslips/{payslip_id}/ledger-entries", response_model=list[PayrollLedgerEntryOut])
def list_payslip_ledger_entries(
    company_id: str,
    payslip_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[PayrollLedgerEntry]:
    ps = db.execute(
        select(Payslip).where(Payslip.id == payslip_id, Payslip.company_id == company_id)
    ).scalar_one_or_none()
    if ps is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    return list_ledger_entries_for_payslip(db, company_id, payslip_id)


@router.get("/payroll/engine-expected", response_model=PayrollEngineExpectedOut)
def get_payroll_engine_expected(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str = Query(..., min_length=1),
    loan_recovery: float = Query(default=0.0, ge=0),
    leave_deduction: float = Query(default=0.0, ge=0),
    other_deductions: float = Query(default=0.0, ge=0),
) -> PayrollEngineExpectedOut:
    """Return engine-computed monthly SimCash values for UI watermark (training / verification)."""
    _, _ = ctx
    if get_employee_by_id(db, company_id, employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    st = db.execute(
        select(SalaryStructure)
        .where(
            SalaryStructure.company_id == company_id,
            SalaryStructure.employee_id == employee_id,
        )
        .order_by(SalaryStructure.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found for employee")
    try:
        ctc, bonus_pct = parse_salary_components(st.components_json)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    bd = compute_monthly_breakdown(
        ctc,
        bonus_pct,
        loan_recovery_monthly=loan_recovery,
        leave_deduction_monthly=leave_deduction,
        other_deductions_monthly=other_deductions,
    )
    expected = breakdown_to_submitted_map(bd)
    employer_expected = {
        "pf_employer": bd.pf_employer,
        "esi_employer": bd.esi_employer,
        "gratuity_employer": bd.gratuity_employer,
    }
    return PayrollEngineExpectedOut(expected=expected, employer_expected=employer_expected)


@router.post("/payroll/validate-calculation", response_model=PayrollValidateCalculationOut)
def validate_payroll_calculation(
    company_id: str,
    body: PayrollValidateCalculationIn,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    x_simcash_debug: Annotated[str | None, Header()] = None,
) -> PayrollValidateCalculationOut:
    _, _ = ctx
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    st = db.execute(
        select(SalaryStructure)
        .where(
            SalaryStructure.company_id == company_id,
            SalaryStructure.employee_id == body.employee_id,
        )
        .order_by(SalaryStructure.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found for employee")
    try:
        ctc, bonus_pct = parse_salary_components(st.components_json)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    norm = normalize_submitted_numbers(body.submitted)
    loan = float(norm.get("loan_recovery") or 0)
    leave = float(norm.get("leave_deduction") or 0)
    other = float(norm.get("other_deductions") or 0)
    bd = compute_monthly_breakdown(
        ctc,
        bonus_pct,
        loan_recovery_monthly=loan,
        leave_deduction_monthly=leave,
        other_deductions_monthly=other,
    )
    expected = breakdown_to_submitted_map(bd)
    cmp = compare_submitted(expected, norm)
    fields = {k: PayrollFieldValidation(ok=v) for k, v in cmp.items()}
    all_match = all(cmp.values())
    dbg = _simcash_debug_response(x_simcash_debug)
    return PayrollValidateCalculationOut(
        fields=fields,
        all_match=all_match,
        expected=expected if dbg else None,
        employer_expected=(
            {
                "pf_employer": bd.pf_employer,
                "esi_employer": bd.esi_employer,
                "gratuity_employer": bd.gratuity_employer,
            }
            if dbg
            else None
        ),
    )


def _reconciliation_expected_out_for_pay_run(db: Session, company_id: str, pay_run_id: str) -> PayrollReconciliationExpectedOut:
    pr = db.execute(select(PayRun).where(PayRun.id == pay_run_id, PayRun.company_id == company_id)).scalar_one_or_none()
    if pr is None:
        return PayrollReconciliationExpectedOut(eligible=False, message="Pay run not found.")
    lines = list(
        db.execute(
            select(PayRunEmployeeLine).where(
                PayRunEmployeeLine.pay_run_id == pay_run_id,
                PayRunEmployeeLine.company_id == company_id,
            )
        ).scalars().all()
    )
    if not lines:
        return PayrollReconciliationExpectedOut(eligible=False, message="No employees in this pay run.")
    if any(ln.status == PAYROLL_STATUS_TO_BE_PROCESSED for ln in lines):
        return PayrollReconciliationExpectedOut(
            eligible=False,
            message="Not all payslips have been generated yet. Complete individual payslips first.",
        )
    payslips = list(
        db.execute(select(Payslip).where(Payslip.pay_run_id == pay_run_id, Payslip.company_id == company_id)).scalars().all()
    )
    if len(payslips) != len(lines):
        return PayrollReconciliationExpectedOut(
            eligible=False,
            message="Not all payslips have been generated yet. Complete individual payslips first.",
        )
    headcount = len(payslips)
    total_gross = round(sum(float(p.gross) for p in payslips), 2)
    total_net = round(sum(float(p.net) for p in payslips), 2)
    total_deductions = round(sum(payslip_deductions_total(p.deductions_json) for p in payslips), 2)
    return PayrollReconciliationExpectedOut(
        eligible=True,
        message=None,
        headcount=headcount,
        total_gross=total_gross,
        total_deductions=total_deductions,
        total_net=total_net,
    )


@router.get("/payroll/reconciliation-expected", response_model=PayrollReconciliationExpectedOut)
def get_payroll_reconciliation_expected(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    pay_run_id: str = Query(..., min_length=1),
) -> PayrollReconciliationExpectedOut:
    """Return summed payslip totals for reconciliation practice (engine column)."""
    _, _ = ctx
    return _reconciliation_expected_out_for_pay_run(db, company_id, pay_run_id)


@router.post("/payroll/validate-reconciliation", response_model=PayrollValidateCalculationOut)
def validate_payroll_reconciliation(
    company_id: str,
    body: PayrollReconciliationValidateIn,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> PayrollValidateCalculationOut:
    """Compare learner-submitted roll-up totals to saved payslips (same tolerance as SimCash)."""
    _, _ = ctx
    out = _reconciliation_expected_out_for_pay_run(db, company_id, body.pay_run_id)
    if not out.eligible or out.headcount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=out.message or "Reconciliation is not available for this pay run.",
        )
    expected = {
        "headcount": float(out.headcount),
        "total_gross": float(out.total_gross or 0),
        "total_deductions": float(out.total_deductions or 0),
        "total_net": float(out.total_net or 0),
    }
    cmp = compare_reconciliation_submitted(expected, body.submitted)
    fields = {k: PayrollFieldValidation(ok=v) for k, v in cmp.items()}
    all_match = all(cmp.values())
    return PayrollValidateCalculationOut(fields=fields, all_match=all_match, expected=None, employer_expected=None)


@router.get("/payroll/payslips", response_model=list[PayslipOut])
def list_payslips(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
    pay_run_id: str | None = None,
) -> list[Payslip]:
    user, membership = ctx
    q = select(Payslip).where(Payslip.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(Payslip.employee_id == emp.id)
    elif employee_id:
        q = q.where(Payslip.employee_id == employee_id)
    if pay_run_id:
        q = q.where(Payslip.pay_run_id == pay_run_id)
    return list(db.execute(q.order_by(Payslip.created_at.desc())).scalars().all())


@router.post("/benefits/plans", response_model=BenefitsPlanOut, status_code=status.HTTP_201_CREATED)
def create_benefits_plan(
    company_id: str,
    body: BenefitsPlanCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_COMP))],
    db: Annotated[Session, Depends(get_db)],
) -> BenefitsPlan:
    user, _ = ctx
    details = dict(body.details_json or {})
    details["mandatory"] = body.mandatory
    row = BenefitsPlan(
        id=uuid_str(),
        company_id=company_id,
        name=body.name.strip(),
        type=body.type,
        details_json=details,
        enrollment_period=body.enrollment_period,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="benefits_plan", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/benefits/plans", response_model=list[BenefitsPlanOut])
def list_benefits_plans(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BenefitsPlan]:
    r = db.execute(select(BenefitsPlan).where(BenefitsPlan.company_id == company_id).order_by(BenefitsPlan.name))
    return list(r.scalars().all())


@router.patch("/benefits/plans/{plan_id}", response_model=BenefitsPlanOut)
def update_benefits_plan(
    company_id: str,
    plan_id: str,
    body: BenefitsPlanUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_COMP))],
    db: Annotated[Session, Depends(get_db)],
) -> BenefitsPlan:
    user, _ = ctx
    row = db.execute(select(BenefitsPlan).where(BenefitsPlan.id == plan_id, BenefitsPlan.company_id == company_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    changes: dict[str, Any] = {}
    if "name" in patch:
        new_name = str(patch["name"]).strip()
        changes["name"] = {"old": row.name, "new": new_name}
        row.name = new_name
    if "type" in patch:
        changes["type"] = {"old": row.type, "new": patch["type"]}
        row.type = patch["type"]
    if "details_json" in patch:
        changes["details_json"] = True
        row.details_json = patch["details_json"]
    if "mandatory" in patch and patch["mandatory"] is not None:
        d = dict(row.details_json or {})
        d["mandatory"] = patch["mandatory"]
        row.details_json = d
        changes["mandatory"] = {"new": patch["mandatory"]}
    if "enrollment_period" in patch:
        changes["enrollment_period"] = {"old": row.enrollment_period, "new": patch["enrollment_period"]}
        row.enrollment_period = patch["enrollment_period"]
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="benefits_plan",
        entity_id=row.id,
        action="update",
        changes_json=changes,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/benefits/enrollments", response_model=BenefitsEnrollmentOut, status_code=status.HTTP_201_CREATED)
def create_benefits_enrollment(
    company_id: str,
    body: BenefitsEnrollmentCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> BenefitsEnrollment:
    user, membership = ctx
    plan = db.execute(
        select(BenefitsPlan).where(BenefitsPlan.id == body.plan_id, BenefitsPlan.company_id == company_id)
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    target_employee_id = body.employee_id
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or emp.id != target_employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only enroll yourself")
    elif membership.role not in _COMP:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compensation role required to enroll others")
    if get_employee_by_id(db, company_id, target_employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    effective_status = (body.status or "active").strip().lower()
    if effective_status == "active":
        dup = db.execute(
            select(BenefitsEnrollment).where(
                BenefitsEnrollment.company_id == company_id,
                BenefitsEnrollment.plan_id == body.plan_id,
                BenefitsEnrollment.employee_id == target_employee_id,
                BenefitsEnrollment.status == "active",
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active enrollment already exists for this plan and employee",
            )
    row = BenefitsEnrollment(
        id=uuid_str(),
        plan_id=body.plan_id,
        company_id=company_id,
        employee_id=target_employee_id,
        dependents_json=body.dependents_json,
        status=effective_status,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="benefits_enrollment", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/benefits/enrollments", response_model=list[BenefitsEnrollmentOut])
def list_benefits_enrollments(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str | None = None,
) -> list[BenefitsEnrollment]:
    user, membership = ctx
    q = select(BenefitsEnrollment).where(BenefitsEnrollment.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(BenefitsEnrollment.employee_id == emp.id)
    elif employee_id:
        if membership.role not in _COMP:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compensation role required")
        q = q.where(BenefitsEnrollment.employee_id == employee_id)
    return list(db.execute(q.order_by(BenefitsEnrollment.created_at.desc())).scalars().all())


@router.get("/benefits/enrollment-summary", response_model=BenefitsEnrollmentSummaryOut)
def get_benefits_enrollment_summary(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> BenefitsEnrollmentSummaryOut:
    company_employee_count = int(
        db.execute(select(func.count()).select_from(Employee).where(Employee.company_id == company_id)).scalar_one()
    )
    employees_with_active_enrollment = int(
        db.execute(
            select(func.count(func.distinct(BenefitsEnrollment.employee_id))).where(
                BenefitsEnrollment.company_id == company_id,
                BenefitsEnrollment.status == "active",
            )
        ).scalar_one()
    )
    plans = db.execute(select(BenefitsPlan).where(BenefitsPlan.company_id == company_id).order_by(BenefitsPlan.name)).scalars().all()
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"active": 0, "cancelled": 0})
    agg = db.execute(
        select(BenefitsEnrollment.plan_id, BenefitsEnrollment.status, func.count(BenefitsEnrollment.id)).where(
            BenefitsEnrollment.company_id == company_id
        ).group_by(BenefitsEnrollment.plan_id, BenefitsEnrollment.status)
    ).all()
    for pid, st, n in agg:
        if st == "active":
            counts[pid]["active"] = int(n)
        elif st == "cancelled":
            counts[pid]["cancelled"] = int(n)
    plan_rows = [
        BenefitsPlanEnrollmentCountsOut(
            plan_id=p.id,
            plan_name=p.name,
            active_count=counts[p.id]["active"],
            cancelled_count=counts[p.id]["cancelled"],
        )
        for p in plans
    ]
    return BenefitsEnrollmentSummaryOut(
        company_employee_count=company_employee_count,
        employees_with_active_enrollment=employees_with_active_enrollment,
        plans=plan_rows,
    )


@router.patch("/benefits/enrollments/{enrollment_id}", response_model=BenefitsEnrollmentOut)
def update_benefits_enrollment(
    company_id: str,
    enrollment_id: str,
    body: BenefitsEnrollmentUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> BenefitsEnrollment:
    user, _ = ctx
    row = db.execute(
        select(BenefitsEnrollment).where(
            BenefitsEnrollment.id == enrollment_id,
            BenefitsEnrollment.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    changes: dict[str, Any] = {}
    if "status" in patch:
        changes["status"] = {"old": row.status, "new": patch["status"]}
        row.status = patch["status"]
    if "dependents_json" in patch:
        changes["dependents_json"] = True
        row.dependents_json = patch["dependents_json"]
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="benefits_enrollment",
        entity_id=row.id,
        action="update",
        changes_json=changes,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/engagement/surveys", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
def create_survey(
    company_id: str,
    body: SurveyCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SURVEY_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> Survey:
    user, _ = ctx
    row = Survey(
        id=uuid_str(),
        company_id=company_id,
        title=body.title.strip(),
        questions_json=body.questions_json,
        target_audience_json=body.target_audience_json,
        start_date=body.start_date,
        end_date=body.end_date,
        status=body.status,
        survey_type=body.survey_type,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="survey", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/engagement/survey-templates", response_model=list[SurveyTemplateOut])
def list_survey_templates(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
) -> list[SurveyTemplateOut]:
    _ = company_id
    return _survey_templates_catalog()


@router.get("/engagement/surveys", response_model=list[SurveyOut])
def list_surveys(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Survey]:
    user, membership = ctx
    today = date.today()
    active_with_end = db.execute(
        select(Survey).where(
            Survey.company_id == company_id,
            Survey.status == "active",
            Survey.end_date.isnot(None),
        )
    ).scalars().all()
    auto_closed = False
    for row in active_with_end:
        end_d = _parse_survey_calendar_date(row.end_date)
        if end_d is not None and today > end_d:
            row.status = "closed"
            auto_closed = True
            write_audit(
                db,
                company_id=company_id,
                user_id=user.id,
                entity_type="survey",
                entity_id=row.id,
                action="update",
                changes_json={"status": {"old": "active", "new": "closed"}, "reason": "auto_close_end_date_passed"},
            )
    if auto_closed:
        db.commit()

    q = select(Survey).where(Survey.company_id == company_id)
    if membership.role == "employee":
        q = q.where(Survey.status.in_(("active", "closed")))
    r = db.execute(q.order_by(Survey.created_at.desc()))
    return list(r.scalars().all())


@router.post("/engagement/survey-responses", response_model=SurveyResponseOut, status_code=status.HTTP_201_CREATED)
def create_survey_response(
    company_id: str,
    body: SurveyResponseCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SurveyResponse:
    user, membership = ctx
    s = db.execute(select(Survey).where(Survey.id == body.survey_id, Survey.company_id == company_id)).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None or emp.id != body.employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must respond as yourself")
        existing = db.execute(
            select(SurveyResponse).where(
                SurveyResponse.survey_id == body.survey_id,
                SurveyResponse.employee_id == body.employee_id,
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already submitted a response for this survey")
    elif membership.role not in _SURVEY_OPS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR or compensation role required to submit for others")
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = SurveyResponse(
        id=uuid_str(),
        survey_id=body.survey_id,
        company_id=company_id,
        employee_id=body.employee_id,
        answers_json=body.answers_json,
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="survey_response", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/engagement/survey-responses", response_model=list[SurveyResponseOut])
def list_survey_responses(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    survey_id: str | None = None,
) -> list[SurveyResponse]:
    user, membership = ctx
    q = select(SurveyResponse).where(SurveyResponse.company_id == company_id)
    if membership.role == "employee":
        emp = get_employee_for_user(db, company_id, user.id)
        if emp is None:
            return []
        q = q.where(SurveyResponse.employee_id == emp.id)
    elif membership.role not in _ENGAGEMENT_SURVEY_RESPONSE_REVIEWERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR or compensation role required to list all responses",
        )
    if survey_id:
        q = q.where(SurveyResponse.survey_id == survey_id)
    return list(db.execute(q.order_by(SurveyResponse.submitted_at.desc())).scalars().all())


@router.delete("/engagement/surveys/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_survey(
    company_id: str,
    survey_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SURVEY_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    row = db.execute(select(Survey).where(Survey.id == survey_id, Survey.company_id == company_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    if row.status != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft surveys can be deleted")
    db.delete(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="survey",
        entity_id=survey_id,
        action="delete",
        changes_json={},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/engagement/surveys/{survey_id}", response_model=SurveyOut)
def update_survey(
    company_id: str,
    survey_id: str,
    body: SurveyUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SURVEY_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> Survey:
    user, _ = ctx
    row = db.execute(select(Survey).where(Survey.id == survey_id, Survey.company_id == company_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    changes: dict[str, Any] = {}
    if body.title is not None:
        changes["title"] = {"old": row.title, "new": body.title.strip()}
        row.title = body.title.strip()
    if body.questions_json is not None:
        changes["questions_json"] = True
        row.questions_json = body.questions_json
    if body.target_audience_json is not None:
        changes["target_audience_json"] = True
        row.target_audience_json = body.target_audience_json
    if body.start_date is not None:
        changes["start_date"] = {"old": row.start_date, "new": body.start_date}
        row.start_date = body.start_date
    if body.end_date is not None:
        changes["end_date"] = {"old": row.end_date, "new": body.end_date}
        row.end_date = body.end_date
    if body.status is not None:
        changes["status"] = {"old": row.status, "new": body.status}
        row.status = body.status
    if body.survey_type is not None:
        changes["survey_type"] = {"old": row.survey_type, "new": body.survey_type}
        row.survey_type = body.survey_type
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="survey",
        entity_id=row.id,
        action="update",
        changes_json=changes,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post(
    "/engagement/surveys/{survey_id}/action-plans",
    response_model=SurveyActionPlanOut,
    status_code=status.HTTP_201_CREATED,
)
def create_survey_action_plan(
    company_id: str,
    survey_id: str,
    body: SurveyActionPlanCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SURVEY_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> SurveyActionPlan:
    user, _ = ctx
    s = db.execute(select(Survey).where(Survey.id == survey_id, Survey.company_id == company_id)).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    if body.assignee_employee_id and get_employee_by_id(db, company_id, body.assignee_employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee employee not found")
    row = SurveyActionPlan(
        id=uuid_str(),
        survey_id=survey_id,
        company_id=company_id,
        title=body.title.strip(),
        description=body.description,
        assignee_employee_id=body.assignee_employee_id,
        due_date=body.due_date,
        status=body.status or "open",
        created_by=user.id,
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="survey_action_plan",
        entity_id=row.id,
        action="create",
        changes_json={"survey_id": survey_id, "title": row.title},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/engagement/surveys/{survey_id}/action-plans", response_model=list[SurveyActionPlanOut])
def list_survey_action_plans(
    company_id: str,
    survey_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SurveyActionPlan]:
    s = db.execute(select(Survey).where(Survey.id == survey_id, Survey.company_id == company_id)).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    r = db.execute(
        select(SurveyActionPlan)
        .where(SurveyActionPlan.survey_id == survey_id, SurveyActionPlan.company_id == company_id)
        .order_by(SurveyActionPlan.created_at.desc())
    )
    return list(r.scalars().all())


@router.patch("/engagement/action-plans/{action_plan_id}", response_model=SurveyActionPlanOut)
def update_survey_action_plan(
    company_id: str,
    action_plan_id: str,
    body: SurveyActionPlanUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_ACTION_PLAN_PATCH_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> SurveyActionPlan:
    user, membership = ctx
    row = db.execute(
        select(SurveyActionPlan).where(
            SurveyActionPlan.id == action_plan_id,
            SurveyActionPlan.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action plan not found")
    if membership.role == "hr_ops":
        if body.title is not None or body.description is not None or body.assignee_employee_id is not None or body.due_date is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="HR Ops may only update action plan status",
            )
        if body.status is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status is required")
    changes: dict[str, Any] = {}
    if body.title is not None:
        changes["title"] = {"old": row.title, "new": body.title.strip()}
        row.title = body.title.strip()
    if body.description is not None:
        changes["description"] = True
        row.description = body.description
    if body.status is not None:
        changes["status"] = {"old": row.status, "new": body.status}
        row.status = body.status
    if body.due_date is not None:
        changes["due_date"] = {"old": row.due_date, "new": body.due_date}
        row.due_date = body.due_date
    if body.assignee_employee_id is not None:
        if body.assignee_employee_id and get_employee_by_id(db, company_id, body.assignee_employee_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee employee not found")
        changes["assignee_employee_id"] = {"old": row.assignee_employee_id, "new": body.assignee_employee_id}
        row.assignee_employee_id = body.assignee_employee_id or None
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="survey_action_plan",
        entity_id=row.id,
        action="update",
        changes_json=changes,
    )
    db.commit()
    db.refresh(row)
    return row
