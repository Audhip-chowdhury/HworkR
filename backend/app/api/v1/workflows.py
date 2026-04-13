from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path, require_company_roles_path
from app.database import get_db
from app.models.membership import CompanyMembership
from app.models.user import User
from app.models.workflow import WorkflowAction, WorkflowInstance, WorkflowTemplate
from app.schemas.shared_services import WorkflowTemplateOut
from app.schemas.workflow_runtime import (
    WorkflowActionBody,
    WorkflowActionOut,
    WorkflowInstanceCreate,
    WorkflowInstanceOut,
)
from app.services.audit import write_audit
from app.services.integration_hooks import publish_domain_event_post_commit
from app.services.workflow_engine import apply_workflow_action, create_instance

router = APIRouter(tags=["workflows"])

_START_ROLES = frozenset({"company_admin", "talent_acquisition", "hr_ops"})


@router.get(
    "/companies/{company_id}/workflow-templates",
    response_model=list[WorkflowTemplateOut],
)
def list_workflow_templates(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[WorkflowTemplate]:
    r = db.execute(
        select(WorkflowTemplate).where(WorkflowTemplate.company_id == company_id).order_by(WorkflowTemplate.name)
    )
    return list(r.scalars().all())


@router.post(
    "/companies/{company_id}/workflow-instances",
    response_model=WorkflowInstanceOut,
    status_code=status.HTTP_201_CREATED,
)
def start_workflow_instance(
    company_id: str,
    body: WorkflowInstanceCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_roles_path(_START_ROLES))],
    db: Annotated[Session, Depends(get_db)],
) -> WorkflowInstance:
    user, _ = ctx
    inst = create_instance(
        db,
        company_id=company_id,
        template_id=body.template_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        initiated_by=user.id,
    )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="workflow_instance",
        entity_id=inst.id,
        action="start",
        changes_json={"template_id": body.template_id},
    )
    db.commit()
    db.refresh(inst)
    publish_domain_event_post_commit(
        company_id=company_id,
        event_type="workflow.started",
        entity_type="workflow_instance",
        entity_id=inst.id,
        actor_user_id=user.id,
        data={"entity_type": body.entity_type, "entity_id": body.entity_id},
    )
    return inst


@router.get(
    "/companies/{company_id}/workflow-instances",
    response_model=list[WorkflowInstanceOut],
)
def list_workflow_instances(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    entity_type: str | None = None,
    entity_id: str | None = None,
    status_filter: str | None = None,
) -> list[WorkflowInstance]:
    q = select(WorkflowInstance).where(WorkflowInstance.company_id == company_id)
    if entity_type:
        q = q.where(WorkflowInstance.entity_type == entity_type)
    if entity_id:
        q = q.where(WorkflowInstance.entity_id == entity_id)
    if status_filter:
        q = q.where(WorkflowInstance.status == status_filter)
    r = db.execute(q.order_by(WorkflowInstance.initiated_at.desc()))
    return list(r.scalars().all())


@router.post(
    "/companies/{company_id}/workflow-instances/{instance_id}/actions",
    response_model=WorkflowInstanceOut,
)
def act_on_workflow_instance(
    company_id: str,
    instance_id: str,
    body: WorkflowActionBody,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> WorkflowInstance:
    user, _ = ctx
    inst, _tmpl = apply_workflow_action(
        db,
        company_id=company_id,
        instance_id=instance_id,
        actor_user_id=user.id,
        action=body.action,
        comments=body.comments,
    )
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="workflow_instance",
        entity_id=instance_id,
        action=body.action,
        changes_json={"status": inst.status},
    )
    db.commit()
    db.refresh(inst)
    if inst.status in ("approved", "rejected"):
        publish_domain_event_post_commit(
            company_id=company_id,
            event_type=f"workflow.{inst.status}",
            entity_type="workflow_instance",
            entity_id=inst.id,
            actor_user_id=user.id,
            data={"entity_type": inst.entity_type, "entity_id": inst.entity_id},
        )
    return inst


@router.get(
    "/companies/{company_id}/workflow-instances/{instance_id}/actions",
    response_model=list[WorkflowActionOut],
)
def list_workflow_instance_actions(
    company_id: str,
    instance_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[WorkflowAction]:
    inst = db.execute(
        select(WorkflowInstance).where(
            WorkflowInstance.id == instance_id,
            WorkflowInstance.company_id == company_id,
        )
    ).scalar_one_or_none()
    if inst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow instance not found")
    r = db.execute(
        select(WorkflowAction)
        .where(WorkflowAction.instance_id == instance_id)
        .order_by(WorkflowAction.acted_at.asc())
    )
    return list(r.scalars().all())
