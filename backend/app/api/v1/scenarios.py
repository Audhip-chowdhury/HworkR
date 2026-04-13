from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_company_roles_path
from app.database import get_db
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.scenario import ScenarioGenerateRequest, ScenarioRunOut
from app.services.audit import write_audit
from app.services.scenario_generator import run_scenario

router = APIRouter(prefix="/companies/{company_id}/scenarios", tags=["scenarios"])

_SCENARIO_ROLES = frozenset({"company_admin", "hr_ops", "ld_performance"})


@router.post("/generate", response_model=ScenarioRunOut, status_code=status.HTTP_201_CREATED)
def generate_scenario(
    company_id: str,
    body: ScenarioGenerateRequest,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_SCENARIO_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    user, _ = ctx
    cfg: dict[str, Any] = {
        "create_leave_request": body.create_leave_request,
        "create_job_application": body.create_job_application,
        "posting_id": body.posting_id,
        "candidate_user_id": body.candidate_user_id,
        "create_inbox_task_for_hr": body.create_inbox_task_for_hr,
        "notes": body.notes,
    }
    run, _result = run_scenario(db, company_id=company_id, actor_user_id=user.id, config=cfg)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="scenario_run",
        entity_id=run.id,
        action="generate",
        changes_json=cfg,
    )
    db.commit()
    db.refresh(run)
    return run
