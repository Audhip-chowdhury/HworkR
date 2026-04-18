from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SalaryStructure(Base):
    __tablename__ = "salary_structures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    components_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    effective_from: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayRun(Base):
    __tablename__ = "pay_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    department_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    processed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # regular | off_cycle | supplemental — off/supplemental skip calendar duplicate rules in API.
    run_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="regular")
    pay_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    run_label: Mapped[str | None] = mapped_column(String(255), nullable=True)


class PayRunEmployeeLine(Base):
    """Per-employee payroll status within a department-scoped pay run."""

    __tablename__ = "pay_run_employee_lines"
    __table_args__ = (UniqueConstraint("pay_run_id", "employee_id", name="uq_pay_run_employee_line"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    pay_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pay_runs.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    # to_be_processed | payslip_generated | salary_released
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Payslip(Base):
    __tablename__ = "payslips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    pay_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pay_runs.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    gross: Mapped[float] = mapped_column(Float, nullable=False)
    earnings_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    deductions_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    net: Mapped[float] = mapped_column(Float, nullable=False)
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BenefitsPlan(Base):
    __tablename__ = "benefits_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    enrollment_period: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BenefitsEnrollment(Base):
    __tablename__ = "benefits_enrollments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    plan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("benefits_plans.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    dependents_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, onupdate=func.now())


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    questions_json: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    target_audience_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    # pulse | standard | null (legacy)
    survey_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    survey_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    answers_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SurveyActionPlan(Base):
    """Follow-up action item created from survey results."""

    __tablename__ = "survey_action_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    survey_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee_employee_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # open | in_progress | done
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompensationGradeBand(Base):
    """Company-defined pay band by code (e.g. L6, G5).

    This is the canonical **compensation / salary range** row (min–mid–max annual).
    It is **not** the same as ``Position.grade`` (integer org-chart seniority on positions)
    or ``JobCatalogEntry.grade`` (optional job-family label); optional ``org_position_grade_*``
    fields document typical mapping to org position grades only.
    """

    __tablename__ = "compensation_grade_bands"
    __table_args__ = (
        UniqueConstraint("company_id", "band_code", "effective_from", name="uq_grade_band_company_code_eff"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    band_code: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    min_annual: Mapped[int] = mapped_column(Integer, nullable=False)
    mid_annual: Mapped[int] = mapped_column(Integer, nullable=False)
    max_annual: Mapped[int] = mapped_column(Integer, nullable=False)
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    effective_from: Mapped[str] = mapped_column(String(32), nullable=False)
    effective_to: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    org_position_grade_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    org_position_grade_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CompensationReviewCycle(Base):
    """Merit / increment planning cycle (budget, effective dating, proposal workflow)."""

    __tablename__ = "compensation_review_cycles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    fiscal_year: Mapped[str] = mapped_column(String(32), nullable=False)
    # draft | open | closed
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    budget_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    budget_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    effective_from_default: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CompensationReviewGuideline(Base):
    """Per–band-code merit guidelines within a review cycle."""

    __tablename__ = "compensation_review_guidelines"
    __table_args__ = (UniqueConstraint("cycle_id", "band_code", name="uq_review_guideline_cycle_band"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("compensation_review_cycles.id", ondelete="CASCADE"), index=True
    )
    band_code: Mapped[str] = mapped_column(String(32), nullable=False)
    min_increase_pct: Mapped[float] = mapped_column(Float, nullable=False)
    max_increase_pct: Mapped[float] = mapped_column(Float, nullable=False)
    merit_pool_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompensationReviewProposal(Base):
    """Employee increment proposal; lightweight status approvals (no workflow engine)."""

    __tablename__ = "compensation_review_proposals"
    __table_args__ = (UniqueConstraint("cycle_id", "employee_id", name="uq_review_proposal_cycle_emp"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("compensation_review_cycles.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    current_ctc_annual: Mapped[int] = mapped_column(Integer, nullable=False)
    proposed_ctc_annual: Mapped[int] = mapped_column(Integer, nullable=False)
    band_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    # draft | submitted | approved | rejected
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_structure_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("salary_structures.id", ondelete="SET NULL"), nullable=True
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PayrollLedgerEntry(Base):
    """Sub-ledger lines derived from payslip earnings (e.g. reimbursements)."""

    __tablename__ = "payroll_ledger_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    pay_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pay_runs.id", ondelete="CASCADE"), index=True
    )
    payslip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("payslips.id", ondelete="CASCADE"), index=True
    )
    entry_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
