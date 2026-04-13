from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import uuid_str
from app.models.membership import CompanyMembership
from app.models.recruitment import Requisition
from app.models.workflow import WorkflowAction, WorkflowInstance, WorkflowTemplate


def _steps_list(steps_json: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(steps_json, list):
        return steps_json
    if isinstance(steps_json, dict) and "steps" in steps_json:
        raw = steps_json["steps"]
        return raw if isinstance(raw, list) else []
    return []


def ensure_default_recruitment_template(db: Session, company_id: str) -> WorkflowTemplate:
    r = db.execute(
        select(WorkflowTemplate).where(
            WorkflowTemplate.company_id == company_id,
            WorkflowTemplate.module == "recruitment",
        )
    )
    existing = r.scalars().first()
    if existing:
        return existing
    t = WorkflowTemplate(
        id=uuid_str(),
        company_id=company_id,
        name="Default requisition approval",
        module="recruitment",
        steps_json=[
            {"name": "company_admin_approval", "approver_role": "company_admin"},
        ],
        conditions_json=None,
    )
    db.add(t)
    db.flush()
    return t


def create_instance(
    db: Session,
    *,
    company_id: str,
    template_id: str,
    entity_type: str,
    entity_id: str,
    initiated_by: str | None,
) -> WorkflowInstance:
    t = db.execute(
        select(WorkflowTemplate).where(
            WorkflowTemplate.id == template_id,
            WorkflowTemplate.company_id == company_id,
        )
    ).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow template not found")
    inst = WorkflowInstance(
        id=uuid_str(),
        template_id=template_id,
        company_id=company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        current_step=0,
        status="active",
        initiated_by=initiated_by,
    )
    db.add(inst)
    db.flush()
    return inst


def _get_membership_role(db: Session, company_id: str, user_id: str) -> str | None:
    r = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    )
    m = r.scalar_one_or_none()
    return m.role if m else None


def apply_workflow_action(
    db: Session,
    *,
    company_id: str,
    instance_id: str,
    actor_user_id: str,
    action: str,
    comments: str | None = None,
) -> tuple[WorkflowInstance, WorkflowTemplate]:
    inst = db.execute(
        select(WorkflowInstance).where(
            WorkflowInstance.id == instance_id,
            WorkflowInstance.company_id == company_id,
        )
    ).scalar_one_or_none()
    if inst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow instance not found")
    if inst.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow is not active")

    tmpl = db.execute(select(WorkflowTemplate).where(WorkflowTemplate.id == inst.template_id)).scalar_one()
    steps = _steps_list(tmpl.steps_json)
    if not steps:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template has no steps")

    step_idx = inst.current_step
    if step_idx >= len(steps):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow already completed")

    step_def = steps[step_idx]
    required_role = (step_def.get("approver_role") or step_def.get("role") or "").strip()
    actor_role = _get_membership_role(db, company_id, actor_user_id)
    if required_role and actor_role != required_role and actor_role != "company_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Approver role required: {required_role}",
        )

    if action not in ("approve", "reject"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="action must be approve or reject")

    wa = WorkflowAction(
        id=uuid_str(),
        instance_id=inst.id,
        step=step_idx,
        actor_id=actor_user_id,
        action=action,
        comments=comments,
    )
    db.add(wa)

    if action == "reject":
        inst.status = "rejected"
        inst.current_step = step_idx
    else:
        if step_idx + 1 >= len(steps):
            inst.status = "approved"
            inst.current_step = len(steps)
        else:
            inst.current_step = step_idx + 1

    if inst.status in ("approved", "rejected"):
        sync_entity_after_workflow(db, inst)

    db.flush()
    return inst, tmpl


def sync_entity_after_workflow(db: Session, inst: WorkflowInstance) -> None:
    """Apply terminal workflow status to linked domain entity (best-effort)."""
    if inst.status == "approved" and inst.entity_type == "requisition":
        req = db.execute(
            select(Requisition).where(
                Requisition.id == inst.entity_id,
                Requisition.company_id == inst.company_id,
            )
        ).scalar_one_or_none()
        if req:
            req.status = "approved"
    elif inst.status == "rejected" and inst.entity_type == "requisition":
        req = db.execute(
            select(Requisition).where(
                Requisition.id == inst.entity_id,
                Requisition.company_id == inst.company_id,
            )
        ).scalar_one_or_none()
        if req:
            req.status = "rejected"
