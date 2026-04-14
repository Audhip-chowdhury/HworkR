from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.config import settings
from app.database import get_db
from app.models.base import uuid_str
from app.models.compensation_engagement import (
    BenefitsEnrollment,
    BenefitsPlan,
    PayRun,
    Payslip,
    SalaryStructure,
    Survey,
    SurveyResponse,
)
from app.models.membership import CompanyMembership
from app.models.org import Department
from app.models.user import User
from app.schemas.compensation_engagement import (
    BenefitsEnrollmentCreate,
    BenefitsEnrollmentOut,
    BenefitsPlanCreate,
    BenefitsPlanOut,
    PayRunCreate,
    PayRunOut,
    PayRunUpdate,
    PayrollEngineExpectedOut,
    PayrollFieldValidation,
    PayrollValidateCalculationIn,
    PayrollValidateCalculationOut,
    PayslipCreate,
    PayslipOut,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
    SurveyCreate,
    SurveyOut,
    SurveyResponseCreate,
    SurveyResponseOut,
)
from app.services.audit import write_audit
from app.services.employee_helpers import get_employee_by_id, get_employee_for_user
from app.services.simcash_engine import (
    breakdown_to_submitted_map,
    compare_submitted,
    compute_monthly_breakdown,
    normalize_submitted_numbers,
    parse_salary_components,
)

router = APIRouter(prefix="/companies/{company_id}", tags=["compensation-engagement"])

_COMP = frozenset({"company_admin", "compensation_analytics"})
# Payroll operations (structures, runs, payslips, SimCash engine) — include HR ops who run payroll but not full comp analytics.
_PAYROLL_OPS = frozenset({"company_admin", "compensation_analytics", "hr_ops"})


def _department_name_for_pay_run(db: Session, company_id: str, department_id: str | None) -> str | None:
    if not department_id:
        return None
    d = db.execute(
        select(Department).where(Department.id == department_id, Department.company_id == company_id)
    ).scalar_one_or_none()
    return d.name if d else None


def _pay_run_to_out(db: Session, company_id: str, row: PayRun) -> PayRunOut:
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
    )


def _simcash_debug_response(x_simcash_debug: str | None) -> bool:
    if settings.simcash_debug:
        return True
    if settings.debug and (x_simcash_debug or "").strip() == "1":
        return True
    return False


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
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="salary_structure", entity_id=row.id, action="create", changes_json={})
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
    for k, v in data.items():
        setattr(row, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="salary_structure",
        entity_id=structure_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/payroll/pay-runs", response_model=PayRunOut, status_code=status.HTTP_201_CREATED)
def create_pay_run(
    company_id: str,
    body: PayRunCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> PayRun:
    user, _ = ctx
    if body.department_id:
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
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pay run already exists for this month and department",
            )
    row = PayRun(
        id=uuid_str(),
        company_id=company_id,
        department_id=body.department_id,
        month=body.month,
        year=body.year,
        status=body.status,
    )
    db.add(row)
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
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> Payslip:
    user, _ = ctx
    pr = db.execute(select(PayRun).where(PayRun.id == body.pay_run_id, PayRun.company_id == company_id)).scalar_one_or_none()
    if pr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay run not found")
    emp = get_employee_by_id(db, company_id, body.employee_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if pr.department_id is not None and emp.department_id != pr.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee must belong to the pay run department",
        )
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
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="payslip", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/payroll/engine-expected", response_model=PayrollEngineExpectedOut)
def get_payroll_engine_expected(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    employee_id: str = Query(..., min_length=1),
    loan_recovery: float = Query(default=0.0, ge=0),
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
    other = float(norm.get("other_deductions") or 0)
    bd = compute_monthly_breakdown(
        ctc,
        bonus_pct,
        loan_recovery_monthly=loan,
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
    row = BenefitsPlan(
        id=uuid_str(),
        company_id=company_id,
        name=body.name.strip(),
        type=body.type,
        details_json=body.details_json,
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
    row = BenefitsEnrollment(
        id=uuid_str(),
        plan_id=body.plan_id,
        company_id=company_id,
        employee_id=target_employee_id,
        dependents_json=body.dependents_json,
        status=body.status,
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


@router.post("/engagement/surveys", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
def create_survey(
    company_id: str,
    body: SurveyCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_COMP))],
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
    )
    db.add(row)
    write_audit(db, company_id=company_id, user_id=user.id, entity_type="survey", entity_id=row.id, action="create", changes_json={})
    db.commit()
    db.refresh(row)
    return row


@router.get("/engagement/surveys", response_model=list[SurveyOut])
def list_surveys(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Survey]:
    r = db.execute(select(Survey).where(Survey.company_id == company_id).order_by(Survey.created_at.desc()))
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
    elif membership.role not in _COMP:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compensation role required to submit for others")
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
    elif membership.role not in _COMP:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compensation role required to list all responses",
        )
    if survey_id:
        q = q.where(SurveyResponse.survey_id == survey_id)
    return list(db.execute(q.order_by(SurveyResponse.submitted_at.desc())).scalars().all())
