import csv
import io
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func as sa_func, literal, select
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.base import uuid_str
from app.models.compensation_engagement import PayRun, Payslip
from app.models.employee import Employee
from app.models.hr_ops import LeaveBalance, LeaveRequest
from app.models.membership import CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.performance_learning import Course, TrainingAssignment, TrainingCompletion
from app.models.recruitment import Application, JobPosting, Offer
from app.models.user import User
from app.services.audit import write_audit

router = APIRouter(prefix="/companies/{company_id}/analytics", tags=["analytics"])

_ANALYTICS_ROLES = frozenset(
    {"company_admin", "talent_acquisition", "hr_ops", "ld_performance", "compensation_analytics"}
)

_SEPARATED_STATUSES = frozenset({"terminated", "offboarding", "inactive"})
_COMP_KEYS = ("ctc_annual_simcash", "ctc_annual", "annual_ctc", "base_salary_annual", "total_comp_annual")


def _parse_iso_date(s: str | None) -> date | None:
    if not s:
        return None
    raw = s.strip()[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _leave_calendar_days(start: str, end: str) -> int:
    sd = _parse_iso_date(start)
    ed = _parse_iso_date(end)
    if not sd or not ed:
        return 0
    return max(0, (ed - sd).days + 1)


def _offer_comp_amount(comp: dict[str, Any] | None) -> float | None:
    if not comp:
        return None
    for k in _COMP_KEYS:
        v = comp.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return None


@router.get("/dashboard")
def analytics_dashboard(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_ANALYTICS_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user, _mem = ctx
    total_employees = int(
        db.execute(select(sa_func.count()).select_from(Employee).where(Employee.company_id == company_id)).scalar_one()
    )
    active_employees = int(
        db.execute(
            select(sa_func.count())
            .select_from(Employee)
            .where(Employee.company_id == company_id, Employee.status == "active")
        ).scalar_one()
    )

    dept_names = {
        d.id: d.name
        for d in db.execute(select(Department).where(Department.company_id == company_id)).scalars().all()
    }
    dept_counts = db.execute(
        select(Employee.department_id, sa_func.count(Employee.id))
        .where(Employee.company_id == company_id)
        .group_by(Employee.department_id)
    ).all()
    headcount_by_department = [
        {
            "department_id": did or "",
            "department": dept_names.get(did, "Unassigned") if did else "Unassigned",
            "count": int(cnt or 0),
        }
        for did, cnt in dept_counts
    ]

    loc_names = {
        loc.id: loc.name
        for loc in db.execute(select(Location).where(Location.company_id == company_id)).scalars().all()
    }
    loc_counts = db.execute(
        select(Employee.location_id, sa_func.count(Employee.id))
        .where(Employee.company_id == company_id)
        .group_by(Employee.location_id)
    ).all()
    headcount_by_location = [
        {
            "location_id": lid or "",
            "location": loc_names.get(lid, "Unassigned") if lid else "Unassigned",
            "count": int(cnt or 0),
        }
        for lid, cnt in loc_counts
    ]

    grade_expr = sa_func.coalesce(JobCatalogEntry.grade, JobCatalogEntry.level, literal("Unassigned"))
    grade_counts = db.execute(
        select(grade_expr, sa_func.count(Employee.id))
        .select_from(Employee)
        .outerjoin(JobCatalogEntry, Employee.job_id == JobCatalogEntry.id)
        .where(Employee.company_id == company_id)
        .group_by(grade_expr)
    ).all()
    headcount_by_grade = [{"grade": str(g or "Unassigned"), "count": int(c or 0)} for g, c in grade_counts]

    status_rows = db.execute(
        select(Employee.status, sa_func.count(Employee.id))
        .where(Employee.company_id == company_id)
        .group_by(Employee.status)
    ).all()
    by_status: dict[str, int] = {str(s): int(c or 0) for s, c in status_rows}
    separated = sum(by_status.get(s, 0) for s in _SEPARATED_STATUSES)
    denom = active_employees + separated
    attrition_rate_percent = round((separated / denom) * 100, 2) if denom else None

    today = date.today()
    twelve_mo = today - timedelta(days=365)
    hire_month_counter: Counter[str] = Counter()
    hires_last_12 = 0
    for hd in db.execute(select(Employee.hire_date).where(Employee.company_id == company_id)).scalars().all():
        d = _parse_iso_date(hd)
        if d:
            hire_month_counter[d.strftime("%Y-%m")] += 1
            if d >= twelve_mo:
                hires_last_12 += 1
    sorted_months = sorted(hire_month_counter.keys())[-12:]
    new_hires_trend_monthly = [{"month": m, "count": hire_month_counter[m]} for m in sorted_months]

    gender_counter: Counter[str] = Counter()
    for row in db.execute(select(Employee.personal_info_json).where(Employee.company_id == company_id)).scalars().all():
        if not row or not isinstance(row, dict):
            continue
        g = row.get("gender") or row.get("Gender")
        if g is None or str(g).strip() == "":
            continue
        gender_counter[str(g).strip()] += 1
    diversity_gender = dict(gender_counter) if gender_counter else None

    open_postings = int(
        db.execute(
            select(sa_func.count()).select_from(JobPosting).where(JobPosting.company_id == company_id, JobPosting.status == "open")
        ).scalar_one()
    )
    applications = int(
        db.execute(select(sa_func.count()).select_from(Application).where(Application.company_id == company_id)).scalar_one()
    )
    offers = int(db.execute(select(sa_func.count()).select_from(Offer).where(Offer.company_id == company_id)).scalar_one())
    accepted_offers = int(
        db.execute(
            select(sa_func.count()).select_from(Offer).where(Offer.company_id == company_id, Offer.status == "accepted")
        ).scalar_one()
    )

    fills = db.execute(
        select(JobPosting.created_at, Offer.responded_at, Offer.sent_at, Offer.compensation_json)
        .select_from(Offer)
        .join(Application, Offer.application_id == Application.id)
        .join(JobPosting, Application.posting_id == JobPosting.id)
        .where(
            Offer.company_id == company_id,
            Offer.status == "accepted",
            JobPosting.company_id == company_id,
        )
    ).all()
    ttf_days: list[float] = []
    hire_costs: list[float] = []
    for created_at, responded_at, sent_at, comp_json in fills:
        end = responded_at or sent_at
        if created_at and end:
            delta = end - created_at
            ttf_days.append(delta.total_seconds() / 86400.0)
        amt = _offer_comp_amount(comp_json if isinstance(comp_json, dict) else None)
        if amt is not None:
            hire_costs.append(amt)
    avg_time_to_fill_days = round(sum(ttf_days) / len(ttf_days), 2) if ttf_days else None
    median_time_to_fill_days = None
    if ttf_days:
        srt = sorted(ttf_days)
        mid = len(srt) // 2
        median_time_to_fill_days = round(srt[mid] if len(srt) % 2 else (srt[mid - 1] + srt[mid]) / 2, 2)
    avg_cost_per_hire = round(sum(hire_costs) / len(hire_costs), 2) if hire_costs else None

    stage_rows = db.execute(
        select(Application.stage, sa_func.count(Application.id))
        .where(Application.company_id == company_id)
        .group_by(Application.stage)
    ).all()
    pipeline_by_stage = [{"stage": str(st or "unknown"), "count": int(n or 0)} for st, n in stage_rows]

    now_utc = datetime.now(timezone.utc)
    six_mo = now_utc - timedelta(days=186)
    app_month_counter: Counter[str] = Counter()
    for at in db.execute(select(Application.applied_at).where(Application.company_id == company_id)).scalars().all():
        if not at:
            continue
        dt = at.replace(tzinfo=timezone.utc) if at.tzinfo is None else at.astimezone(timezone.utc)
        if dt >= six_mo:
            app_month_counter[dt.strftime("%Y-%m")] += 1
    app_months_sorted = sorted(app_month_counter.keys())
    applications_trend_monthly = [{"month": m, "count": app_month_counter[m]} for m in app_months_sorted]

    pending_leave = int(
        db.execute(
            select(sa_func.count())
            .select_from(LeaveRequest)
            .where(LeaveRequest.company_id == company_id, LeaveRequest.status == "pending")
        ).scalar_one()
    )
    approved_leave = int(
        db.execute(
            select(sa_func.count())
            .select_from(LeaveRequest)
            .where(LeaveRequest.company_id == company_id, LeaveRequest.status == "approved")
        ).scalar_one()
    )

    leave_by_type: dict[str, dict[str, float | int]] = {}
    approved_rows = db.execute(
        select(LeaveRequest.type, LeaveRequest.start_date, LeaveRequest.end_date).where(
            LeaveRequest.company_id == company_id, LeaveRequest.status == "approved"
        )
    ).all()
    for lt, sd, ed in approved_rows:
        key = str(lt or "other")
        bucket = leave_by_type.setdefault(key, {"requests": 0, "approx_calendar_days": 0})
        bucket["requests"] = int(bucket["requests"]) + 1
        bucket["approx_calendar_days"] = float(bucket["approx_calendar_days"]) + float(_leave_calendar_days(sd, ed))
    leave_by_type_list = [
        {"type": k, "requests": int(v["requests"]), "approx_calendar_days": round(float(v["approx_calendar_days"]), 1)}
        for k, v in sorted(leave_by_type.items(), key=lambda x: x[0])
    ]

    current_year = today.year
    bal_rows = db.execute(
        select(LeaveBalance.type, sa_func.sum(LeaveBalance.balance)).where(
            LeaveBalance.company_id == company_id, LeaveBalance.year == current_year
        ).group_by(LeaveBalance.type)
    ).all()
    leave_balance_by_type = [
        {"type": str(t or "other"), "total_balance": round(float(s or 0), 2)} for t, s in sorted(bal_rows, key=lambda x: str(x[0] or ""))
    ]

    assignments = int(
        db.execute(
            select(sa_func.count()).select_from(TrainingAssignment).where(TrainingAssignment.company_id == company_id)
        ).scalar_one()
    )
    completions = int(
        db.execute(
            select(sa_func.count()).select_from(TrainingCompletion).where(TrainingCompletion.company_id == company_id)
        ).scalar_one()
    )
    training_rate = round((completions / assignments) * 100, 2) if assignments else None

    course_rows = db.execute(
        select(Course.title, sa_func.count(TrainingCompletion.id))
        .select_from(TrainingCompletion)
        .join(TrainingAssignment, TrainingCompletion.assignment_id == TrainingAssignment.id)
        .join(Course, TrainingAssignment.course_id == Course.id)
        .where(TrainingCompletion.company_id == company_id)
        .group_by(Course.title)
    ).all()
    completion_by_course = [{"course": str(title), "completions": int(cnt or 0)} for title, cnt in course_rows]

    latest_run = db.execute(
        select(PayRun)
        .where(PayRun.company_id == company_id)
        .order_by(PayRun.year.desc(), PayRun.month.desc())
        .limit(1)
    ).scalar_one_or_none()

    payroll_block: dict[str, Any] = {"latest_run": None, "totals": None, "earnings_breakdown": [], "deductions_breakdown": []}
    if latest_run:
        payroll_block["latest_run"] = {
            "id": latest_run.id,
            "year": latest_run.year,
            "month": latest_run.month,
            "status": latest_run.status,
            "run_label": latest_run.run_label,
            "run_kind": latest_run.run_kind,
        }
        slips = db.execute(select(Payslip).where(Payslip.pay_run_id == latest_run.id)).scalars().all()
        gross_sum = sum(float(s.gross) for s in slips)
        net_sum = sum(float(s.net) for s in slips)
        payroll_block["totals"] = {
            "gross": round(gross_sum, 2),
            "net": round(net_sum, 2),
            "payslip_count": len(slips),
        }
        earn_counter: Counter[str] = Counter()
        ded_counter: Counter[str] = Counter()
        for s in slips:
            if isinstance(s.earnings_json, dict):
                for k, v in s.earnings_json.items():
                    if isinstance(v, (int, float)):
                        earn_counter[str(k)] += float(v)
            if isinstance(s.deductions_json, dict):
                for k, v in s.deductions_json.items():
                    if isinstance(v, (int, float)):
                        ded_counter[str(k)] += float(v)
        payroll_block["earnings_breakdown"] = [
            {"component": k, "amount": round(v, 2)} for k, v in sorted(earn_counter.items(), key=lambda x: -x[1])
        ]
        payroll_block["deductions_breakdown"] = [
            {"component": k, "amount": round(v, 2)} for k, v in sorted(ded_counter.items(), key=lambda x: -x[1])
        ]

    return {
        "headcount": {
            "total": total_employees,
            "active": active_employees,
            "by_status": by_status,
            "by_department": headcount_by_department,
            "by_location": headcount_by_location,
            "by_grade": headcount_by_grade,
            "hires_last_12_months": hires_last_12,
            "new_hires_trend_monthly": new_hires_trend_monthly,
        },
        "attrition": {
            "separated_headcount": separated,
            "attrition_rate_percent": attrition_rate_percent,
            "note": "Separated = terminated, offboarding, or inactive. Rate = separated / (active + separated).",
        },
        "diversity": {"gender": diversity_gender, "note": "Derived from employee profile JSON when present."},
        "recruitment": {
            "open_postings": open_postings,
            "applications": applications,
            "offers": offers,
            "accepted_offers": accepted_offers,
            "avg_time_to_fill_days": avg_time_to_fill_days,
            "median_time_to_fill_days": median_time_to_fill_days,
            "avg_cost_per_hire": avg_cost_per_hire,
            "pipeline_by_stage": pipeline_by_stage,
            "applications_trend_monthly": applications_trend_monthly,
        },
        "leave": {
            "pending_requests": pending_leave,
            "approved_requests": approved_leave,
            "by_type": leave_by_type_list,
            "balance_by_type_year": leave_balance_by_type,
            "year": current_year,
        },
        "learning": {
            "training_assignments": assignments,
            "training_completions": completions,
            "completion_rate_percent": training_rate,
            "completion_by_course": completion_by_course,
        },
        "payroll": payroll_block,
    }


@router.get("/export/employees.csv")
def export_employees_csv(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_ANALYTICS_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user, _ = ctx
    rows = db.execute(select(Employee).where(Employee.company_id == company_id).order_by(Employee.employee_code)).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "employee_code",
            "user_id",
            "department_id",
            "job_id",
            "status",
            "hire_date",
        ]
    )
    for e in rows:
        w.writerow([e.id, e.employee_code, e.user_id or "", e.department_id or "", e.job_id or "", e.status, e.hire_date or ""])
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="data_export",
        entity_id=uuid_str(),
        action="download",
        changes_json={"export": "analytics/employees.csv"},
    )
    db.commit()
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="employees.csv"'},
    )
