"""R-REQ-COMP-01, R-PROC-HOLE-01, and offer C-PAY-BAND-01."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.org import JobCatalogEntry
from app.models.recruitment import Application, Interview, JobPosting, Offer, Requisition
from app.services.scoring_engine.comp_amounts import (
    annual_from_comp_dict,
    comp_accuracy_vs_band,
    min_max_from_salary_band_json,
)
from app.services.scoring_engine.core import factors_at


def requisition_completeness_factors(req: Requisition) -> dict[str, float]:
    """
    R-REQ-COMP-01: requisition should reference job, department, and hiring criteria.
    """
    c = 100.0
    if not req.job_id:
        c = min(c, 55.0)
    if not req.department_id:
        c = min(c, 72.0)
    hc = req.hiring_criteria_json
    if hc is None or not isinstance(hc, dict):
        c = min(c, 60.0)
    else:
        skills = hc.get("skills")
        n_skills = len(skills) if isinstance(skills, list) else 0
        exp = str(hc.get("experience") or "").strip()
        edu = str(hc.get("education") or "").strip()
        if n_skills == 0 and not exp and not edu:
            c = min(c, 58.0)
    return factors_at(
        completeness=c,
        accuracy=100.0,
        timeliness=100.0,
        process_adherence=100.0,
    )


def job_posting_completeness_factors(post: JobPosting) -> dict[str, float]:
    """
    R-REQ-COMP-01: posting / job ad text and application deadline.
    """
    c = 100.0
    d = (post.description or "").strip()
    r = (post.requirements or "").strip()
    if not d:
        c = min(c, 50.0)
    if not r:
        c = min(c, 60.0)
    if not (post.deadline or "").strip():
        c = min(c, 55.0)
    if post.posted and (not d or not (post.deadline or "").strip()):
        c = min(c, 40.0)
    return factors_at(
        completeness=c,
        accuracy=100.0,
        timeliness=100.0,
        process_adherence=100.0,
    )


def offer_compensation_factors(
    db: Session,
    *,
    offer: Offer,
) -> tuple[dict[str, float], bool]:
    """C-PAY-BAND-01: offer CTC vs job catalog salary band. Second value = critical_failure (very low accuracy)."""
    amount = annual_from_comp_dict(offer.compensation_json if isinstance(offer.compensation_json, dict) else None)
    app = db.get(Application, offer.application_id)
    if app is None:
        f = factors_at(accuracy=90.0, completeness=95.0 if amount else 70.0, timeliness=100.0, process_adherence=100.0)
        return f, False
    posting = db.get(JobPosting, app.posting_id)
    if not posting or not posting.requisition_id:
        f = factors_at(accuracy=90.0, completeness=100.0, timeliness=100.0, process_adherence=100.0)
        return f, False
    req = db.get(Requisition, posting.requisition_id)
    if not req or not req.job_id:
        f = factors_at(accuracy=90.0, completeness=100.0, timeliness=100.0, process_adherence=100.0)
        return f, False
    job = db.execute(
        select(JobCatalogEntry).where(
            JobCatalogEntry.id == req.job_id, JobCatalogEntry.company_id == offer.company_id
        )
    ).scalar_one_or_none()
    if not job:
        f = factors_at(accuracy=90.0, timeliness=100.0, process_adherence=100.0, completeness=100.0)
        return f, False
    lo, hi = min_max_from_salary_band_json(job.salary_band_json if isinstance(job.salary_band_json, dict) else None)
    acc = comp_accuracy_vs_band(amount=amount, min_annual=lo, max_annual=hi)
    comp = 100.0 if amount is not None else 68.0
    critical = acc < 40.0
    f = factors_at(
        completeness=comp,
        accuracy=acc,
        timeliness=100.0,
        process_adherence=100.0,
    )
    return f, critical


def application_process_nudge_factors(
    db: Session,
    *,
    company_id: str,
    application: Application,
) -> dict[str, float]:
    """
    R-PROC-HOLE-01: small penalty when late-stage but interviews/feedback look thin.
    """
    p = 100.0
    c = 100.0
    st = (application.stage or "").lower()
    n_inv = int(
        db.execute(
            select(func.count(Interview.id)).where(
                Interview.application_id == application.id,
                Interview.company_id == company_id,
                Interview.status != "cancelled",
            )
        ).scalar()
        or 0
    )
    if st in ("interview", "assessment", "offer", "hired") and n_inv == 0:
        p = min(p, 88.0)
        c = min(c, 90.0)
    if n_inv > 0:
        rows = db.execute(
            select(Interview).where(Interview.application_id == application.id, Interview.company_id == company_id)
        ).scalars().all()
        any_feedback = any((inv.feedback_json not in (None, {}, [])) for inv in rows)
        if st in ("offer", "hired") and not any_feedback:
            p = min(p, 86.0)
    return factors_at(
        completeness=c,
        accuracy=100.0,
        timeliness=100.0,
        process_adherence=p,
    )
