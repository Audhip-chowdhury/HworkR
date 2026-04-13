"""Company-specific organizational roles (job titles / positions), mapped to departments."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OrgRole(Base):
    """A role defined by the company (e.g. Senior Recruiter, HRBP). Not the HworkR practice track."""

    __tablename__ = "org_roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DepartmentOrgRole(Base):
    """Maps org roles to departments (many roles per department)."""

    __tablename__ = "department_org_roles"
    __table_args__ = (UniqueConstraint("department_id", "org_role_id", name="uq_department_org_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    department_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="CASCADE"), index=True
    )
    org_role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("org_roles.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
