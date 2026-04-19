from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class SalaryStructureCreate(BaseModel):
    employee_id: str
    components_json: dict[str, Any] | None = None
    effective_from: str | None = None


class SalaryStructureUpdate(BaseModel):
    components_json: dict[str, Any] | None = None
    effective_from: str | None = None


class SalaryStructureOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    components_json: dict[str, Any] | None
    effective_from: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SalaryStructureAuditOut(BaseModel):
    """Audit trail row for salary structure create/update (from audit_trail + users join)."""

    id: str
    entity_id: str
    action: str
    changes_json: dict[str, Any] | None
    user_id: str | None
    user_name: str | None
    user_email: str | None
    timestamp: datetime


class PayRunCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)
    status: str = Field(default="draft", max_length=32)
    department_id: str | None = None
    run_kind: Literal["regular", "off_cycle", "supplemental"] = "regular"
    pay_date: str | None = Field(default=None, max_length=32)
    run_label: str | None = Field(default=None, max_length=255)


class PayRunUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)


class PayRunOut(BaseModel):
    id: str
    company_id: str
    department_id: str | None = None
    department_name: str | None = None
    month: int
    year: int
    status: str
    processed_by: str | None
    processed_at: datetime | None
    created_at: datetime
    run_kind: str = "regular"
    pay_date: str | None = None
    run_label: str | None = None


class PayRunEmployeeLineOut(BaseModel):
    employee_id: str
    employee_code: str
    full_name: str
    email: str | None = None
    payroll_status: str


class PayRunDepartmentOverviewOut(BaseModel):
    department_id: str
    department_name: str
    pay_run_id: str | None = None
    """open: at least one employee not salary_released; payrun_closed: all released."""
    department_pay_run_status: str
    employees: list[PayRunEmployeeLineOut]


class PayslipCreate(BaseModel):
    pay_run_id: str
    employee_id: str
    gross: float = Field(ge=0)
    earnings_json: dict[str, Any] | None = None
    deductions_json: dict[str, Any] | None = None
    net: float = Field(ge=0)
    pdf_url: str | None = None


class PayslipOut(BaseModel):
    id: str
    pay_run_id: str
    company_id: str
    employee_id: str
    gross: float
    earnings_json: dict[str, Any] | None
    deductions_json: dict[str, Any] | None
    net: float
    pdf_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayrollValidateCalculationIn(BaseModel):
    employee_id: str
    pay_run_id: str | None = None
    submitted: dict[str, Any]


class PayrollFieldValidation(BaseModel):
    ok: bool


class PayrollValidateCalculationOut(BaseModel):
    fields: dict[str, PayrollFieldValidation]
    all_match: bool
    expected: dict[str, float] | None = None
    employer_expected: dict[str, float] | None = None


class PayrollEngineExpectedOut(BaseModel):
    """Monthly SimCash figures from engine (preview / watermark); no user submission required."""

    expected: dict[str, float]
    employer_expected: dict[str, float]


class PayrollReconciliationExpectedOut(BaseModel):
    """Totals from saved payslips for a pay run; eligible=False when worksheet should not be shown."""

    eligible: bool
    message: str | None = None
    headcount: int | None = None
    total_gross: float | None = None
    total_deductions: float | None = None
    total_net: float | None = None


class PayrollReconciliationValidateIn(BaseModel):
    pay_run_id: str = Field(min_length=1)
    submitted: dict[str, Any]


class BenefitsPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    details_json: dict[str, Any] | None = None
    enrollment_period: str | None = None
    mandatory: bool = False


class BenefitsPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    details_json: dict[str, Any] | None = None
    enrollment_period: str | None = None
    mandatory: bool | None = None


class BenefitsPlanOut(BaseModel):
    id: str
    company_id: str
    name: str
    type: str | None
    details_json: dict[str, Any] | None
    enrollment_period: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BenefitsEnrollmentCreate(BaseModel):
    plan_id: str
    employee_id: str
    dependents_json: dict[str, Any] | None = None
    status: str = Field(default="active", max_length=32)


class BenefitsEnrollmentUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    dependents_json: dict[str, Any] | None = None


class BenefitsEnrollmentOut(BaseModel):
    id: str
    plan_id: str
    company_id: str
    employee_id: str
    dependents_json: dict[str, Any] | None
    status: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class BenefitsPlanEnrollmentCountsOut(BaseModel):
    plan_id: str
    plan_name: str
    active_count: int
    cancelled_count: int


class BenefitsEnrollmentSummaryOut(BaseModel):
    company_employee_count: int
    """Distinct employees with at least one active enrollment in this company."""
    employees_with_active_enrollment: int
    plans: list[BenefitsPlanEnrollmentCountsOut]


class SurveyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    questions_json: Any | None = None
    target_audience_json: dict[str, Any] | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str = Field(default="draft", max_length=32)
    survey_type: str | None = Field(default=None, max_length=32)


class SurveyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    questions_json: Any | None = None
    target_audience_json: dict[str, Any] | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str | None = Field(default=None, max_length=32)
    survey_type: str | None = Field(default=None, max_length=32)


class SurveyOut(BaseModel):
    id: str
    company_id: str
    title: str
    questions_json: Any | None
    target_audience_json: dict[str, Any] | None
    start_date: str | None
    end_date: str | None
    status: str
    survey_type: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SurveyTemplateQuestionOut(BaseModel):
    id: str
    text: str
    type: Literal["rating_1_5", "yes_no", "text"]
    required: bool = False


class SurveyTemplateOut(BaseModel):
    id: str
    title: str
    survey_type: str | None
    questions: list[SurveyTemplateQuestionOut]


ParticipantScope = Literal["all", "department", "grade", "individual"]


class SurveyActionPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    assignee_employee_id: str | None = None
    owner_department_id: str
    participant_scope: ParticipantScope = "all"
    participant_filter_json: dict[str, Any] | None = None
    due_date: str | None = Field(default=None, max_length=32)
    status: str = Field(default="open", max_length=32)

    @model_validator(mode="after")
    def validate_participant_filter(self) -> "SurveyActionPlanCreate":
        scope = self.participant_scope
        fj = self.participant_filter_json or {}
        if scope == "all":
            return self
        if scope == "department":
            ids = fj.get("department_ids")
            if not isinstance(ids, list) or not all(isinstance(x, str) and x.strip() for x in ids):
                raise ValueError("participant_filter_json.department_ids must be a non-empty list of ids")
            if len(ids) == 0:
                raise ValueError("participant_filter_json.department_ids cannot be empty")
        elif scope == "grade":
            grades = fj.get("grades")
            if not isinstance(grades, list) or not grades:
                raise ValueError("participant_filter_json.grades must be a non-empty list of integers")
            if not all(isinstance(g, int) for g in grades):
                raise ValueError("participant_filter_json.grades must be integers")
        elif scope == "individual":
            eids = fj.get("employee_ids")
            if not isinstance(eids, list) or not eids:
                raise ValueError("participant_filter_json.employee_ids must be a non-empty list")
            if not all(isinstance(x, str) and x.strip() for x in eids):
                raise ValueError("participant_filter_json.employee_ids must be string ids")
        return self


class SurveyActionPlanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    assignee_employee_id: str | None = None
    owner_department_id: str | None = None
    participant_scope: ParticipantScope | None = None
    participant_filter_json: dict[str, Any] | None = None
    due_date: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def validate_participant_filter(self) -> "SurveyActionPlanUpdate":
        scope = self.participant_scope
        if scope is None:
            return self
        fj = self.participant_filter_json if self.participant_filter_json is not None else {}
        if scope == "all":
            return self
        if scope == "department":
            ids = fj.get("department_ids")
            if not isinstance(ids, list) or not all(isinstance(x, str) and x.strip() for x in ids):
                raise ValueError("participant_filter_json.department_ids must be a non-empty list of ids")
            if len(ids) == 0:
                raise ValueError("participant_filter_json.department_ids cannot be empty")
        elif scope == "grade":
            grades = fj.get("grades")
            if not isinstance(grades, list) or not grades:
                raise ValueError("participant_filter_json.grades must be a non-empty list of integers")
            if not all(isinstance(g, int) for g in grades):
                raise ValueError("participant_filter_json.grades must be integers")
        elif scope == "individual":
            eids = fj.get("employee_ids")
            if not isinstance(eids, list) or not eids:
                raise ValueError("participant_filter_json.employee_ids must be a non-empty list")
            if not all(isinstance(x, str) and x.strip() for x in eids):
                raise ValueError("participant_filter_json.employee_ids must be string ids")
        return self


class SurveyActionPlanOut(BaseModel):
    id: str
    survey_id: str
    company_id: str
    title: str
    description: str | None
    assignee_employee_id: str | None
    owner_department_id: str | None
    participant_scope: str
    participant_filter_json: dict[str, Any] | None
    due_date: str | None
    status: str
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SurveyResponseCreate(BaseModel):
    survey_id: str
    employee_id: str
    answers_json: dict[str, Any] | None = None


class SurveyResponseOut(BaseModel):
    id: str
    survey_id: str
    company_id: str
    employee_id: str
    answers_json: dict[str, Any] | None
    submitted_at: datetime

    model_config = {"from_attributes": True}


class CompensationGradeBandCreate(BaseModel):
    band_code: str = Field(min_length=1, max_length=32)
    display_name: str | None = Field(default=None, max_length=255)
    min_annual: int = Field(ge=0)
    mid_annual: int = Field(ge=0)
    max_annual: int = Field(ge=0)
    currency_code: str = Field(default="INR", max_length=8)
    effective_from: str = Field(min_length=8, max_length=32)
    effective_to: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    org_position_grade_min: int | None = Field(default=None, ge=0, le=999999)
    org_position_grade_max: int | None = Field(default=None, ge=0, le=999999)


class CompensationGradeBandUpdate(BaseModel):
    band_code: str | None = Field(default=None, min_length=1, max_length=32)
    display_name: str | None = Field(default=None, max_length=255)
    min_annual: int | None = Field(default=None, ge=0)
    mid_annual: int | None = Field(default=None, ge=0)
    max_annual: int | None = Field(default=None, ge=0)
    currency_code: str | None = Field(default=None, max_length=8)
    effective_from: str | None = Field(default=None, max_length=32)
    effective_to: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    org_position_grade_min: int | None = Field(default=None, ge=0, le=999999)
    org_position_grade_max: int | None = Field(default=None, ge=0, le=999999)


class CompensationGradeBandOut(BaseModel):
    id: str
    company_id: str
    band_code: str
    display_name: str | None
    min_annual: int
    mid_annual: int
    max_annual: int
    currency_code: str
    effective_from: str
    effective_to: str | None
    notes: str | None
    org_position_grade_min: int | None
    org_position_grade_max: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GradeBandAuditOut(BaseModel):
    id: str
    entity_id: str
    action: str
    changes_json: dict[str, Any] | None
    user_id: str | None
    user_name: str | None
    user_email: str | None
    timestamp: datetime


# --- Compensation review (merit / increment planning) ---


class CompensationReviewCycleCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    fiscal_year: str = Field(min_length=2, max_length=32)
    state: Literal["draft", "open", "closed"] = "draft"
    budget_amount: float | None = Field(default=None, ge=0)
    budget_currency: str = Field(default="INR", max_length=8)
    effective_from_default: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class CompensationReviewCycleUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    fiscal_year: str | None = Field(default=None, max_length=32)
    state: Literal["draft", "open", "closed"] | None = None
    budget_amount: float | None = Field(default=None, ge=0)
    budget_currency: str | None = Field(default=None, max_length=8)
    effective_from_default: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class CompensationReviewCycleOut(BaseModel):
    id: str
    company_id: str
    label: str
    fiscal_year: str
    state: str
    budget_amount: float | None
    budget_currency: str
    effective_from_default: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompensationReviewGuidelineCreate(BaseModel):
    band_code: str = Field(min_length=1, max_length=32)
    min_increase_pct: float = Field(ge=0, le=100)
    max_increase_pct: float = Field(ge=0, le=100)
    merit_pool_weight: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = None


class CompensationReviewGuidelineUpdate(BaseModel):
    min_increase_pct: float | None = Field(default=None, ge=0, le=100)
    max_increase_pct: float | None = Field(default=None, ge=0, le=100)
    merit_pool_weight: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = None


class CompensationReviewGuidelineOut(BaseModel):
    id: str
    cycle_id: str
    band_code: str
    min_increase_pct: float
    max_increase_pct: float
    merit_pool_weight: float | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CompensationReviewProposalCreate(BaseModel):
    employee_id: str
    proposed_ctc_annual: int = Field(ge=0)
    band_code: str | None = Field(default=None, max_length=32)
    justification: str | None = None


class CompensationReviewProposalUpdate(BaseModel):
    proposed_ctc_annual: int | None = Field(default=None, ge=0)
    band_code: str | None = Field(default=None, max_length=32)
    justification: str | None = None


class CompensationReviewProposalOut(BaseModel):
    id: str
    cycle_id: str
    employee_id: str
    current_ctc_annual: int
    proposed_ctc_annual: int
    band_code: str | None
    justification: str | None
    status: str
    submitted_at: datetime | None
    approved_by_user_id: str | None
    approved_at: datetime | None
    rejected_reason: str | None
    applied_structure_id: str | None
    applied_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompensationReviewBudgetSummaryOut(BaseModel):
    cycle_id: str
    budget_amount: float | None
    budget_currency: str
    approved_increase_total: float
    submitted_increase_total: float
    approved_count: int
    submitted_pending_count: int


class PayrollLedgerEntryOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    pay_run_id: str
    payslip_id: str
    entry_kind: str
    direction: str
    amount: float
    currency_code: str
    metadata_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
