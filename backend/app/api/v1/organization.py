from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    require_company_admin_path,
    require_company_membership_path,
    require_platform_admin,
)
from app.core.security import get_password_hash
from app.database import get_db
from app.models.base import uuid_str
from app.models.company import Company
from app.models.employee import Employee
from app.models.membership import MEMBERSHIP_ROLES, CompanyMembership
from app.models.org import Department, JobCatalogEntry, Location
from app.models.org_role import DepartmentOrgRole, OrgRole
from app.models.position import Position
from app.models.user import User
from app.schemas.company import (
    CompanyOut,
    CompanyUpdate,
    MemberInviteRequest,
    MemberRoleUpdate,
    MembershipOut,
)
from app.schemas.position import PositionCreate, PositionOut, PositionUpdate
from app.schemas.org import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentOrgRolesOut,
    JobCatalogCreate,
    JobCatalogOut,
    LocationCreate,
    LocationOut,
    OrgRoleCreate,
    OrgRoleMappingCreate,
    OrgRoleOut,
    OrgRoleUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/companies", tags=["organization"])


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Company:
    r = db.execute(select(Company).where(Company.id == company_id))
    c = r.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return c


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    body: CompanyUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Company:
    user, _ = ctx
    r = db.execute(select(Company).where(Company.id == company_id))
    c = r.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="company",
        entity_id=company_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(c)
    return c


@router.get("/{company_id}/members", response_model=list[MembershipOut])
def list_members(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[CompanyMembership]:
    r = db.execute(select(CompanyMembership).where(CompanyMembership.company_id == company_id))
    return list(r.scalars().all())


@router.post("/{company_id}/members/invite", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
def invite_member(
    company_id: str,
    body: MemberInviteRequest,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CompanyMembership:
    admin_user, _ = ctx
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    if body.role not in MEMBERSHIP_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    r = db.execute(select(User).where(User.email == email))
    target = r.scalar_one_or_none()
    if target is None:
        if not body.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="password is required when inviting a new user",
            )
        display_name = (body.name or email.split("@")[0]).strip() or email
        target = User(
            id=uuid_str(),
            email=email,
            password_hash=get_password_hash(body.password),
            name=display_name,
            is_platform_admin=False,
        )
        db.add(target)
        db.flush()

    existing_m = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == target.id,
            CompanyMembership.status == "active",
        )
    ).scalar_one_or_none()
    if existing_m:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already an active member")

    m = CompanyMembership(
        id=uuid_str(),
        user_id=target.id,
        company_id=company_id,
        role=body.role,
        status="active",
        modules_access_json=None,
    )
    db.add(m)
    write_audit(
        db,
        company_id=company_id,
        user_id=admin_user.id,
        entity_type="company_membership",
        entity_id=m.id,
        action="invite",
        changes_json={"user_id": target.id, "role": body.role},
    )
    db.commit()
    db.refresh(m)
    return m


@router.patch("/{company_id}/members/{target_user_id}/role", response_model=MembershipOut)
def update_member_role(
    company_id: str,
    target_user_id: str,
    body: MemberRoleUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CompanyMembership:
    admin_user, _ = ctx
    if body.role not in MEMBERSHIP_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    r = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == target_user_id,
            CompanyMembership.status == "active",
        )
    )
    m = r.scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    m.role = body.role
    write_audit(
        db,
        company_id=company_id,
        user_id=admin_user.id,
        entity_type="company_membership",
        entity_id=m.id,
        action="role_update",
        changes_json={"role": body.role},
    )
    db.commit()
    db.refresh(m)
    return m


@router.post("/{company_id}/members/{target_user_id}/deactivate", response_model=MembershipOut)
def deactivate_member(
    company_id: str,
    target_user_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> CompanyMembership:
    admin_user, _ = ctx
    r = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == target_user_id,
            CompanyMembership.status == "active",
        )
    )
    m = r.scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    m.status = "inactive"
    write_audit(
        db,
        company_id=company_id,
        user_id=admin_user.id,
        entity_type="company_membership",
        entity_id=m.id,
        action="deactivate",
        changes_json={},
    )
    db.commit()
    db.refresh(m)
    return m


@router.get("/{company_id}/departments", response_model=list[DepartmentOut])
def list_departments(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Department]:
    r = db.execute(
        select(Department).where(Department.company_id == company_id).order_by(Department.name)
    )
    return list(r.scalars().all())


@router.post(
    "/{company_id}/departments",
    response_model=DepartmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    company_id: str,
    body: DepartmentCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Department:
    user, _ = ctx
    d = Department(
        id=uuid_str(),
        company_id=company_id,
        name=body.name,
        parent_id=body.parent_id,
        head_employee_id=body.head_employee_id,
        level=body.level,
    )
    db.add(d)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="department",
        entity_id=d.id,
        action="create",
        changes_json={"name": body.name},
    )
    db.commit()
    db.refresh(d)
    return d


@router.get("/{company_id}/locations", response_model=list[LocationOut])
def list_locations(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Location]:
    r = db.execute(
        select(Location).where(Location.company_id == company_id).order_by(Location.name)
    )
    return list(r.scalars().all())


@router.post(
    "/{company_id}/locations",
    response_model=LocationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_location(
    company_id: str,
    body: LocationCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> Location:
    user, _ = ctx
    loc = Location(
        id=uuid_str(),
        company_id=company_id,
        name=body.name,
        address=body.address,
        timezone=body.timezone,
        country=body.country,
    )
    db.add(loc)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="location",
        entity_id=loc.id,
        action="create",
        changes_json={"name": body.name},
    )
    db.commit()
    db.refresh(loc)
    return loc


@router.get("/{company_id}/job-catalog", response_model=list[JobCatalogOut])
def list_job_catalog(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[JobCatalogEntry]:
    r = db.execute(
        select(JobCatalogEntry)
        .where(JobCatalogEntry.company_id == company_id)
        .order_by(JobCatalogEntry.title)
    )
    return list(r.scalars().all())


@router.post(
    "/{company_id}/job-catalog",
    response_model=JobCatalogOut,
    status_code=status.HTTP_201_CREATED,
)
def create_job_catalog_entry(
    company_id: str,
    body: JobCatalogCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> JobCatalogEntry:
    user, _ = ctx
    j = JobCatalogEntry(
        id=uuid_str(),
        company_id=company_id,
        title=body.title,
        family=body.family,
        level=body.level,
        grade=body.grade,
        salary_band_json=body.salary_band_json,
    )
    db.add(j)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="job_catalog",
        entity_id=j.id,
        action="create",
        changes_json={"title": body.title},
    )
    db.commit()
    db.refresh(j)
    return j


def _get_department_for_company(
    db: Session, company_id: str, department_id: str
) -> Department:
    r = db.execute(
        select(Department).where(Department.id == department_id, Department.company_id == company_id)
    )
    d = r.scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return d


def _get_org_role_for_company(db: Session, company_id: str, org_role_id: str) -> OrgRole:
    r = db.execute(select(OrgRole).where(OrgRole.id == org_role_id, OrgRole.company_id == company_id))
    role = r.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org role not found")
    return role


# --- Company org roles (custom titles per tenant) ---


@router.get("/{company_id}/org-roles", response_model=list[OrgRoleOut])
def list_org_roles(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrgRole]:
    r = db.execute(select(OrgRole).where(OrgRole.company_id == company_id).order_by(OrgRole.name))
    return list(r.scalars().all())


@router.post(
    "/{company_id}/org-roles",
    response_model=OrgRoleOut,
    status_code=status.HTTP_201_CREATED,
)
def create_org_role(
    company_id: str,
    body: OrgRoleCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> OrgRole:
    user, _ = ctx
    role = OrgRole(id=uuid_str(), company_id=company_id, name=body.name, description=body.description)
    db.add(role)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="org_role",
        entity_id=role.id,
        action="create",
        changes_json={"name": body.name},
    )
    db.commit()
    db.refresh(role)
    return role


@router.patch("/{company_id}/org-roles/{org_role_id}", response_model=OrgRoleOut)
def update_org_role(
    company_id: str,
    org_role_id: str,
    body: OrgRoleUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> OrgRole:
    user, _ = ctx
    role = _get_org_role_for_company(db, company_id, org_role_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(role, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="org_role",
        entity_id=org_role_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{company_id}/org-roles/{org_role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_org_role(
    company_id: str,
    org_role_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user, _ = ctx
    role = _get_org_role_for_company(db, company_id, org_role_id)
    db.delete(role)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="org_role",
        entity_id=org_role_id,
        action="delete",
        changes_json={},
    )
    db.commit()


@router.get(
    "/{company_id}/departments-with-org-roles",
    response_model=list[DepartmentOrgRolesOut],
)
def list_departments_with_org_roles(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
) -> list[DepartmentOrgRolesOut]:
    dr = db.execute(
        select(Department).where(Department.company_id == company_id).order_by(Department.name)
    )
    depts = list(dr.scalars().all())
    out: list[DepartmentOrgRolesOut] = []
    for d in depts:
        q = (
            select(OrgRole)
            .join(DepartmentOrgRole, DepartmentOrgRole.org_role_id == OrgRole.id)
            .where(DepartmentOrgRole.department_id == d.id)
            .order_by(OrgRole.name)
        )
        roles = list(db.execute(q).scalars().all())
        out.append(
            DepartmentOrgRolesOut(
                department_id=d.id,
                department_name=d.name,
                org_roles=[OrgRoleOut.model_validate(x) for x in roles],
            )
        )
    return out


@router.post(
    "/{company_id}/departments/{department_id}/org-roles",
    response_model=DepartmentOrgRolesOut,
    status_code=status.HTTP_201_CREATED,
)
def map_org_role_to_department(
    company_id: str,
    department_id: str,
    body: OrgRoleMappingCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> DepartmentOrgRolesOut:
    user, _ = ctx
    _get_department_for_company(db, company_id, department_id)
    _get_org_role_for_company(db, company_id, body.org_role_id)
    row = DepartmentOrgRole(id=uuid_str(), department_id=department_id, org_role_id=body.org_role_id)
    db.add(row)
    try:
        write_audit(
            db,
            company_id=company_id,
            user_id=user.id,
            entity_type="department_org_role",
            entity_id=row.id,
            action="create",
            changes_json={"department_id": department_id, "org_role_id": body.org_role_id},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This role is already mapped to this department",
        ) from None
    d = _get_department_for_company(db, company_id, department_id)
    q = (
        select(OrgRole)
        .join(DepartmentOrgRole, DepartmentOrgRole.org_role_id == OrgRole.id)
        .where(DepartmentOrgRole.department_id == department_id)
        .order_by(OrgRole.name)
    )
    roles = list(db.execute(q).scalars().all())
    return DepartmentOrgRolesOut(
        department_id=d.id,
        department_name=d.name,
        org_roles=[OrgRoleOut.model_validate(x) for x in roles],
    )


@router.delete(
    "/{company_id}/departments/{department_id}/org-roles/{org_role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unmap_org_role_from_department(
    company_id: str,
    department_id: str,
    org_role_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user, _ = ctx
    _get_department_for_company(db, company_id, department_id)
    _get_org_role_for_company(db, company_id, org_role_id)
    r = db.execute(
        select(DepartmentOrgRole).where(
            DepartmentOrgRole.department_id == department_id,
            DepartmentOrgRole.org_role_id == org_role_id,
        )
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mapping not found")
    db.delete(row)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="department_org_role",
        entity_id=row.id,
        action="delete",
        changes_json={"department_id": department_id, "org_role_id": org_role_id},
    )
    db.commit()


# --- Positions (org chart: grade, reporting, C-suite / temporary buckets) ---


def _position_to_out(p: Position) -> PositionOut:
    dn: str | None = None
    if p.department_id and p.department is not None:
        dn = p.department.name
    return PositionOut(
        id=p.id,
        company_id=p.company_id,
        name=p.name,
        department_id=p.department_id,
        department_name=dn,
        bucket=p.bucket,
        grade=p.grade,
        reports_to_id=p.reports_to_id,
        works_with_id=p.works_with_id,
        created_at=p.created_at,
    )


def _validate_position_placement(department_id: str | None, bucket: str) -> None:
    if department_id:
        if bucket != "none":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="When a department is selected, bucket must be none",
            )
    elif bucket not in ("c_suite", "temporary"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="For positions not in a department, bucket must be c_suite or temporary",
        )


def _would_create_reporting_cycle(
    db: Session,
    company_id: str,
    position_id: str | None,
    reports_to_id: str | None,
) -> bool:
    if reports_to_id is None:
        return False
    if position_id and reports_to_id == position_id:
        return True
    cur: str | None = reports_to_id
    visited: set[str] = set()
    while cur:
        if position_id and cur == position_id:
            return True
        if cur in visited:
            return False
        visited.add(cur)
        r = db.execute(select(Position).where(Position.id == cur, Position.company_id == company_id))
        parent = r.scalar_one_or_none()
        if parent is None:
            break
        cur = parent.reports_to_id
    return False


def _get_position_for_company(db: Session, company_id: str, position_id: str) -> Position:
    r = db.execute(
        select(Position)
        .options(joinedload(Position.department))
        .where(Position.id == position_id, Position.company_id == company_id)
    )
    p = r.unique().scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")
    return p


@router.get("/{company_id}/positions", response_model=list[PositionOut])
def list_positions(
    company_id: str,
    _: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    db: Annotated[Session, Depends(get_db)],
    department_id: str | None = None,
) -> list[PositionOut]:
    q = (
        select(Position)
        .options(joinedload(Position.department))
        .where(Position.company_id == company_id)
    )
    if department_id:
        q = q.where(Position.department_id == department_id)
    r = db.execute(q.order_by(Position.grade, Position.name))
    rows = r.unique().scalars().all()
    return [_position_to_out(p) for p in rows]


@router.post(
    "/{company_id}/positions",
    response_model=PositionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_position(
    company_id: str,
    body: PositionCreate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> PositionOut:
    user, _ = ctx
    _validate_position_placement(body.department_id, body.bucket)
    if body.department_id:
        _get_department_for_company(db, company_id, body.department_id)
    if body.reports_to_id:
        _get_position_for_company(db, company_id, body.reports_to_id)
        if _would_create_reporting_cycle(db, company_id, None, body.reports_to_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reporting line would create a cycle",
            )
    if body.works_with_id:
        _get_position_for_company(db, company_id, body.works_with_id)

    pos = Position(
        id=uuid_str(),
        company_id=company_id,
        name=body.name.strip(),
        department_id=body.department_id,
        bucket=body.bucket,
        grade=body.grade,
        reports_to_id=body.reports_to_id,
        works_with_id=body.works_with_id,
    )
    db.add(pos)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="position",
        entity_id=pos.id,
        action="create",
        changes_json={"name": body.name},
    )
    db.commit()
    db.refresh(pos)
    r2 = db.execute(
        select(Position)
        .options(joinedload(Position.department))
        .where(Position.id == pos.id)
    )
    return _position_to_out(r2.unique().scalar_one())


@router.patch("/{company_id}/positions/{position_id}", response_model=PositionOut)
def update_position(
    company_id: str,
    position_id: str,
    body: PositionUpdate,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> PositionOut:
    user, _ = ctx
    pos = _get_position_for_company(db, company_id, position_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = str(data["name"]).strip()

    merged_dep = pos.department_id
    merged_bucket = pos.bucket
    if "department_id" in data:
        merged_dep = data["department_id"]
    if "bucket" in data:
        merged_bucket = data["bucket"]
    _validate_position_placement(merged_dep, merged_bucket)

    if merged_dep:
        _get_department_for_company(db, company_id, merged_dep)

    new_reports = pos.reports_to_id
    if "reports_to_id" in data:
        new_reports = data["reports_to_id"]
        if new_reports:
            _get_position_for_company(db, company_id, new_reports)
        if _would_create_reporting_cycle(db, company_id, pos.id, new_reports):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reporting line would create a cycle",
            )

    if "works_with_id" in data and data["works_with_id"]:
        _get_position_for_company(db, company_id, data["works_with_id"])
        if data["works_with_id"] == pos.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A position cannot work with itself",
            )

    if "reports_to_id" in data and data["reports_to_id"] == pos.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A position cannot report to itself",
        )

    for k, v in data.items():
        setattr(pos, k, v)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="position",
        entity_id=position_id,
        action="update",
        changes_json=data,
    )
    db.commit()
    db.refresh(pos)
    r2 = db.execute(
        select(Position)
        .options(joinedload(Position.department))
        .where(Position.id == pos.id)
    )
    return _position_to_out(r2.unique().scalar_one())


@router.delete("/{company_id}/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_position(
    company_id: str,
    position_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user, _ = ctx
    pos = _get_position_for_company(db, company_id, position_id)
    db.delete(pos)
    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="position",
        entity_id=position_id,
        action="delete",
        changes_json={},
    )
    db.commit()


class SeedDemoResponse(BaseModel):
    department_id: str
    location_id: str
    job_id: str
    employee_ids: list[str]
    message: str


@router.post("/{company_id}/seed-demo", response_model=SeedDemoResponse)
def seed_demo_data(
    company_id: str,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_admin_path)],
    db: Annotated[Session, Depends(get_db)],
) -> SeedDemoResponse:
    user, _ = ctx
    r = db.execute(select(Company).where(Company.id == company_id))
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    dept = Department(
        id=uuid_str(),
        company_id=company_id,
        name="General",
        parent_id=None,
        head_employee_id=None,
        level=0,
    )
    loc = Location(
        id=uuid_str(),
        company_id=company_id,
        name="Headquarters",
        address=None,
        timezone="UTC",
        country=None,
    )
    job = JobCatalogEntry(
        id=uuid_str(),
        company_id=company_id,
        title="Associate",
        family="Operations",
        level="L1",
        grade="G3",
        salary_band_json={"min": 60000, "max": 90000, "currency": "₹S"},
    )
    db.add_all([dept, loc, job])
    db.flush()

    employees: list[Employee] = []
    for i, code in enumerate(["EMP-001", "EMP-002"]):
        e = Employee(
            id=uuid_str(),
            company_id=company_id,
            user_id=None,
            employee_code=code,
            department_id=dept.id,
            job_id=job.id,
            manager_id=None,
            location_id=loc.id,
            status="active",
            hire_date="2026-01-01",
            personal_info_json={"display_name": f"Demo Employee {i + 1}"},
            documents_json={},
        )
        employees.append(e)
        db.add(e)

    write_audit(
        db,
        company_id=company_id,
        user_id=user.id,
        entity_type="company",
        entity_id=company_id,
        action="seed_demo",
        changes_json={"employees": len(employees)},
    )
    db.commit()
    return SeedDemoResponse(
        department_id=dept.id,
        location_id=loc.id,
        job_id=job.id,
        employee_ids=[e.id for e in employees],
        message="Demo department, location, job, and 2 employees created.",
    )


class DeleteCompanyResponse(BaseModel):
    ok: bool


@router.delete("/{company_id}", response_model=DeleteCompanyResponse)
def delete_company(
    company_id: str,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> DeleteCompanyResponse:
    r = db.execute(select(Company).where(Company.id == company_id))
    c = r.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    db.delete(c)
    db.commit()
    return DeleteCompanyResponse(ok=True)
