"""Merit / increment review cycles (budget, guidelines, proposals, apply to salary structures)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.compensation_engagement import (
    CompensationReviewCycle,
    CompensationReviewGuideline,
    CompensationReviewProposal,
    SalaryStructure,
)
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.compensation_engagement import (
    CompensationReviewBudgetSummaryOut,
    CompensationReviewCycleCreate,
    CompensationReviewCycleOut,
    CompensationReviewCycleUpdate,
    CompensationReviewGuidelineCreate,
    CompensationReviewGuidelineOut,
    CompensationReviewGuidelineUpdate,
    CompensationReviewProposalCreate,
    CompensationReviewProposalOut,
    CompensationReviewProposalUpdate,
)
from app.services.audit import write_audit
from app.services.employee_helpers import get_employee_by_id
from app.services.simcash_engine import parse_salary_components

router = APIRouter(prefix="/companies/{company_id}/compensation", tags=["compensation-review"])

_PAYROLL_OPS = frozenset({"company_admin", "compensation_analytics", "hr_ops"})


def _cycle_or_404(db: Session, company_id: str, cycle_id: str) -> CompensationReviewCycle:
    row = db.execute(
        select(CompensationReviewCycle).where(
            CompensationReviewCycle.id == cycle_id,
            CompensationReviewCycle.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review cycle not found")
    return row


def _latest_salary_structure(db: Session, company_id: str, employee_id: str) -> SalaryStructure | None:
    return db.execute(
        select(SalaryStructure)
        .where(SalaryStructure.company_id == company_id, SalaryStructure.employee_id == employee_id)
        .order_by(SalaryStructure.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _current_ctc_annual(st: SalaryStructure | None) -> int:
    if st is None or not isinstance(st.components_json, dict):
        return 0
    raw = st.components_json.get("ctc_annual")
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return 0


def _proposal_or_404(db: Session, cycle_id: str, proposal_id: str) -> CompensationReviewProposal:
    row = db.execute(
        select(CompensationReviewProposal).where(
            CompensationReviewProposal.id == proposal_id,
            CompensationReviewProposal.cycle_id == cycle_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return row


@router.get("/review-cycles", response_model=list[CompensationReviewCycleOut])
def list_review_cycles(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompensationReviewCycle]:
    q = (
        select(CompensationReviewCycle)
        .where(CompensationReviewCycle.company_id == company_id)
        .order_by(CompensationReviewCycle.created_at.desc())
    )
    return list(db.execute(q).scalars().all())


@router.post("/review-cycles", response_model=CompensationReviewCycleOut, status_code=status.HTTP_201_CREATED)
def create_review_cycle(
    company_id: str,
    body: CompensationReviewCycleCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewCycle:
    user, _ = ctx
    row = CompensationReviewCycle(
        id=uuid_str(),
        company_id=company_id,
        label=body.label.strip(),
        fiscal_year=body.fiscal_year.strip(),
        state=body.state,
        budget_amount=body.budget_amount,
        budget_currency=(body.budget_currency or "INR").strip() or "INR",
        effective_from_default=body.effective_from_default.strip() if body.effective_from_default else None,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_cycle",
        entity_id=row.id,
        action="create",
        changes_json={"label": row.label, "fiscal_year": row.fiscal_year},
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/review-cycles/{cycle_id}", response_model=CompensationReviewCycleOut)
def update_review_cycle(
    company_id: str,
    cycle_id: str,
    body: CompensationReviewCycleUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewCycle:
    user, _ = ctx
    row = _cycle_or_404(db, company_id, cycle_id)
    data = body.model_dump(exclude_unset=True)
    changes: dict[str, Any] = {}
    for k, v in data.items():
        if v is None and k in ("notes", "effective_from_default", "budget_amount"):
            old = getattr(row, k)
            setattr(row, k, None)
            if old is not None:
                changes[k] = {"old": old, "new": None}
        elif v is not None:
            if k == "label":
                v = str(v).strip()
            if k == "fiscal_year":
                v = str(v).strip()
            if k == "budget_currency":
                v = str(v).strip() or "INR"
            old = getattr(row, k)
            setattr(row, k, v)
            if old != v:
                changes[k] = {"old": old, "new": v}
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_cycle",
        entity_id=cycle_id,
        action="update",
        changes_json=changes or None,
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/review-cycles/{cycle_id}/guidelines", response_model=list[CompensationReviewGuidelineOut])
def list_guidelines(
    company_id: str,
    cycle_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompensationReviewGuideline]:
    _cycle_or_404(db, company_id, cycle_id)
    q = (
        select(CompensationReviewGuideline)
        .where(CompensationReviewGuideline.cycle_id == cycle_id)
        .order_by(CompensationReviewGuideline.band_code)
    )
    return list(db.execute(q).scalars().all())


@router.post("/review-cycles/{cycle_id}/guidelines", response_model=CompensationReviewGuidelineOut, status_code=status.HTTP_201_CREATED)
def create_guideline(
    company_id: str,
    cycle_id: str,
    body: CompensationReviewGuidelineCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewGuideline:
    user, _ = ctx
    _cycle_or_404(db, company_id, cycle_id)
    if body.min_increase_pct > body.max_increase_pct:
        raise HTTPException(status_code=400, detail="min_increase_pct must be ≤ max_increase_pct")
    row = CompensationReviewGuideline(
        id=uuid_str(),
        cycle_id=cycle_id,
        band_code=body.band_code.strip(),
        min_increase_pct=body.min_increase_pct,
        max_increase_pct=body.max_increase_pct,
        merit_pool_weight=body.merit_pool_weight,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_guideline",
        entity_id=row.id,
        action="create",
        changes_json={"cycle_id": cycle_id, "band_code": row.band_code},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Guideline for this band already exists in the cycle") from None
    db.refresh(row)
    return row


@router.patch("/review-cycles/{cycle_id}/guidelines/{guideline_id}", response_model=CompensationReviewGuidelineOut)
def update_guideline(
    company_id: str,
    cycle_id: str,
    guideline_id: str,
    body: CompensationReviewGuidelineUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewGuideline:
    user, _ = ctx
    _cycle_or_404(db, company_id, cycle_id)
    row = db.execute(
        select(CompensationReviewGuideline).where(
            CompensationReviewGuideline.id == guideline_id,
            CompensationReviewGuideline.cycle_id == cycle_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Guideline not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            setattr(row, k, v)
    if row.min_increase_pct > row.max_increase_pct:
        raise HTTPException(status_code=400, detail="min_increase_pct must be ≤ max_increase_pct")
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_guideline",
        entity_id=guideline_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/review-cycles/{cycle_id}/guidelines/{guideline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guideline(
    company_id: str,
    cycle_id: str,
    guideline_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    _cycle_or_404(db, company_id, cycle_id)
    row = db.execute(
        select(CompensationReviewGuideline).where(
            CompensationReviewGuideline.id == guideline_id,
            CompensationReviewGuideline.cycle_id == cycle_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Guideline not found")
    db.delete(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_guideline",
        entity_id=guideline_id,
        action="delete",
        changes_json=None,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/review-cycles/{cycle_id}/proposals", response_model=list[CompensationReviewProposalOut])
def list_proposals(
    company_id: str,
    cycle_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompensationReviewProposal]:
    _cycle_or_404(db, company_id, cycle_id)
    q = select(CompensationReviewProposal).where(CompensationReviewProposal.cycle_id == cycle_id)
    return list(db.execute(q).scalars().all())


@router.post("/review-cycles/{cycle_id}/proposals", response_model=CompensationReviewProposalOut, status_code=status.HTTP_201_CREATED)
def create_proposal(
    company_id: str,
    cycle_id: str,
    body: CompensationReviewProposalCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewProposal:
    user, _ = ctx
    cy = _cycle_or_404(db, company_id, cycle_id)
    if cy.state == "closed":
        raise HTTPException(status_code=400, detail="Cannot add proposals to a closed cycle")
    if get_employee_by_id(db, company_id, body.employee_id) is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    st = _latest_salary_structure(db, company_id, body.employee_id)
    cur = _current_ctc_annual(st)
    row = CompensationReviewProposal(
        id=uuid_str(),
        cycle_id=cycle_id,
        employee_id=body.employee_id,
        current_ctc_annual=cur,
        proposed_ctc_annual=body.proposed_ctc_annual,
        band_code=body.band_code.strip() if body.band_code and body.band_code.strip() else None,
        justification=body.justification.strip() if body.justification else None,
        status="draft",
    )
    db.add(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_proposal",
        entity_id=row.id,
        action="create",
        changes_json={"employee_id": body.employee_id},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A proposal already exists for this employee in the cycle") from None
    db.refresh(row)
    return row


@router.patch("/review-cycles/{cycle_id}/proposals/{proposal_id}", response_model=CompensationReviewProposalOut)
def update_proposal(
    company_id: str,
    cycle_id: str,
    proposal_id: str,
    body: CompensationReviewProposalUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewProposal:
    user, _ = ctx
    _cycle_or_404(db, company_id, cycle_id)
    row = _proposal_or_404(db, cycle_id, proposal_id)
    if row.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Only draft or rejected proposals can be edited")
    data = body.model_dump(exclude_unset=True)
    if "proposed_ctc_annual" in data and data["proposed_ctc_annual"] is not None:
        row.proposed_ctc_annual = int(data["proposed_ctc_annual"])
    if "band_code" in data:
        v = data["band_code"]
        row.band_code = v.strip() if isinstance(v, str) and v.strip() else None
    if "justification" in data:
        v = data["justification"]
        row.justification = v.strip() if isinstance(v, str) and v.strip() else None
    if row.status == "rejected":
        row.status = "draft"
        row.rejected_reason = None
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_proposal",
        entity_id=proposal_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/review-cycles/{cycle_id}/proposals/{proposal_id}/submit", response_model=CompensationReviewProposalOut)
def submit_proposal(
    company_id: str,
    cycle_id: str,
    proposal_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewProposal:
    user, _ = ctx
    cy = _cycle_or_404(db, company_id, cycle_id)
    if cy.state != "open":
        raise HTTPException(status_code=400, detail="Cycle must be open to submit proposals")
    row = _proposal_or_404(db, cycle_id, proposal_id)
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft proposals can be submitted")
    row.status = "submitted"
    row.submitted_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_proposal",
        entity_id=proposal_id,
        action="submit",
        changes_json=None,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/review-cycles/{cycle_id}/proposals/{proposal_id}/approve", response_model=CompensationReviewProposalOut)
def approve_proposal(
    company_id: str,
    cycle_id: str,
    proposal_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewProposal:
    user, _ = ctx
    cy = _cycle_or_404(db, company_id, cycle_id)
    if cy.state == "closed":
        raise HTTPException(status_code=400, detail="Cannot approve in a closed cycle")
    row = _proposal_or_404(db, cycle_id, proposal_id)
    if row.status != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted proposals can be approved")
    row.status = "approved"
    row.approved_by_user_id = user.id
    row.approved_at = datetime.now(timezone.utc)
    row.rejected_reason = None
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_proposal",
        entity_id=proposal_id,
        action="approve",
        changes_json=None,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/review-cycles/{cycle_id}/proposals/{proposal_id}/reject", response_model=CompensationReviewProposalOut)
def reject_proposal(
    company_id: str,
    cycle_id: str,
    proposal_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
    reason: str | None = Query(default=None, max_length=2000),
) -> CompensationReviewProposal:
    user, _ = ctx
    cy = _cycle_or_404(db, company_id, cycle_id)
    if cy.state == "closed":
        raise HTTPException(status_code=400, detail="Cannot reject in a closed cycle")
    row = _proposal_or_404(db, cycle_id, proposal_id)
    if row.status != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted proposals can be rejected")
    row.status = "rejected"
    row.rejected_reason = (reason or "").strip() or "Rejected"
    row.approved_by_user_id = None
    row.approved_at = None
    row.submitted_at = None
    row.updated_at = datetime.now(timezone.utc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="compensation_review_proposal",
        entity_id=proposal_id,
        action="reject",
        changes_json={"reason": row.rejected_reason},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/review-cycles/{cycle_id}/budget-summary", response_model=CompensationReviewBudgetSummaryOut)
def budget_summary(
    company_id: str,
    cycle_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> CompensationReviewBudgetSummaryOut:
    cy = _cycle_or_404(db, company_id, cycle_id)
    props = list(
        db.execute(select(CompensationReviewProposal).where(CompensationReviewProposal.cycle_id == cycle_id)).scalars().all()
    )
    approved_total = 0.0
    submitted_total = 0.0
    approved_count = 0
    submitted_pending = 0
    for p in props:
        delta = float(p.proposed_ctc_annual - p.current_ctc_annual)
        if p.status == "approved":
            approved_total += max(delta, 0.0)
            approved_count += 1
        elif p.status == "submitted":
            submitted_total += max(delta, 0.0)
            submitted_pending += 1
    return CompensationReviewBudgetSummaryOut(
        cycle_id=cycle_id,
        budget_amount=cy.budget_amount,
        budget_currency=cy.budget_currency,
        approved_increase_total=approved_total,
        submitted_increase_total=submitted_total,
        approved_count=approved_count,
        submitted_pending_count=submitted_pending,
    )


@router.post("/review-cycles/{cycle_id}/apply-approved", response_model=dict[str, Any])
def apply_approved_proposals(
    company_id: str,
    cycle_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_PAYROLL_OPS))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Create new SalaryStructure rows for approved proposals not yet applied."""
    user, _ = ctx
    cy = _cycle_or_404(db, company_id, cycle_id)
    eff = cy.effective_from_default
    if not eff or not str(eff).strip():
        raise HTTPException(
            status_code=400,
            detail="Set effective_from_default on the cycle before applying approved proposals",
        )
    eff_s = str(eff).strip()
    props = list(
        db.execute(
            select(CompensationReviewProposal).where(
                CompensationReviewProposal.cycle_id == cycle_id,
                CompensationReviewProposal.status == "approved",
                CompensationReviewProposal.applied_at.is_(None),
            )
        ).scalars().all()
    )
    applied_ids: list[str] = []
    for p in props:
        st = _latest_salary_structure(db, company_id, p.employee_id)
        if st is None:
            continue
        try:
            _, bonus_pct = parse_salary_components(st.components_json)
        except ValueError:
            bonus_pct = 0.0625
        cj = dict(st.components_json) if isinstance(st.components_json, dict) else {}
        cj["ctc_annual"] = float(p.proposed_ctc_annual)
        cj["bonus_pct_of_ctc"] = float(bonus_pct)
        new_row = SalaryStructure(
            id=uuid_str(),
            company_id=company_id,
            employee_id=p.employee_id,
            components_json=cj,
            effective_from=eff_s,
        )
        db.add(new_row)
        db.flush()
        p.applied_structure_id = new_row.id
        p.applied_at = datetime.now(timezone.utc)
        p.updated_at = datetime.now(timezone.utc)
        applied_ids.append(new_row.id)
        write_audit(
            db,
            company_id=company_id,
            user_id=user.id,
            entity_type="compensation_review_proposal",
            entity_id=p.id,
            action="apply_salary",
            changes_json={"new_structure_id": new_row.id, "effective_from": eff_s},
        )
    db.commit()
    return {"applied_structure_ids": applied_ids, "count": len(applied_ids)}
