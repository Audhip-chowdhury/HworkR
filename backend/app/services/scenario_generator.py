from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.hr_ops import LeaveRequest
from app.models.inbox import InboxTask
from app.models.recruitment import Application, JobPosting
from app.models.scenario import ScenarioRun
from app.services.employee_helpers import get_employee_for_user


def run_scenario(
    db: Session,
    *,
    company_id: str,
    actor_user_id: str,
    config: dict[str, Any],
) -> tuple[ScenarioRun, dict[str, Any]]:
    result: dict[str, Any] = {"created": {}}

    emp = get_employee_for_user(db, company_id, actor_user_id)
    if config.get("create_leave_request") and emp:
        lr = LeaveRequest(
            id=uuid_str(),
            company_id=company_id,
            employee_id=emp.id,
            type="scenario",
            start_date="2099-01-01",
            end_date="2099-01-02",
            reason="Synthetic scenario leave (training)",
            status="pending",
        )
        db.add(lr)
        result["created"]["leave_request_id"] = lr.id

    if config.get("create_job_application"):
        posting_id = config.get("posting_id")
        cand = config.get("candidate_user_id") or actor_user_id
        if posting_id:
            posting = db.get(JobPosting, posting_id)
            if posting and posting.company_id == company_id and posting.status == "open":
                app = Application(
                    id=uuid_str(),
                    posting_id=posting_id,
                    company_id=company_id,
                    candidate_user_id=cand,
                    resume_url=None,
                    status="active",
                    stage="applied",
                )
                db.add(app)
                result["created"]["application_id"] = app.id

    if config.get("create_inbox_task_for_hr"):
        task = InboxTask(
            id=uuid_str(),
            company_id=company_id,
            user_id=actor_user_id,
            type="scenario",
            title="Scenario: review pending HR practice items",
            entity_type="scenario",
            entity_id=None,
            priority="normal",
            status="open",
            due_at=None,
            context_json={"source": "scenario_generator"},
        )
        db.add(task)
        result["created"]["inbox_task_id"] = task.id

    run = ScenarioRun(
        id=uuid_str(),
        company_id=company_id,
        config_json=config,
        status="completed",
        result_json=result,
        created_by=actor_user_id,
        notes=config.get("notes"),
    )
    db.add(run)
    db.flush()
    return run, result
