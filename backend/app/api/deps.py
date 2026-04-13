from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models.membership import CompanyMembership
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user_optional(
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    uid = payload["sub"]
    r = db.execute(select(User).where(User.id == uid))
    return r.scalar_one_or_none()


def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_platform_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin required")
    return user


def require_company_membership_path(
    company_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> tuple[User, CompanyMembership]:
    r = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
        )
    )
    m = r.scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this company")
    return user, m


def require_company_admin_path(
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
) -> tuple[User, CompanyMembership]:
    user, m = ctx
    if m.role != "company_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company admin required")
    return user, m


def require_company_roles_path(allowed_roles: set[str]):
    def _require_roles(
        ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    ) -> tuple[User, CompanyMembership]:
        user, membership = ctx
        if membership.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these roles is required: {', '.join(sorted(allowed_roles))}",
            )
        return user, membership

    return _require_roles


def require_eligible_company_registration_submitter(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Logged-in user who may submit a new company registration (not platform admin, no company yet)."""
    if user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admins manage requests from the platform console",
        )
    r = db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    if r.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already belong to a company",
        )
    return user
