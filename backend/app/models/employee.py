from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Employee(Base):
    """Minimal employee record for Phase 0 pool seeding."""

    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    employee_code: Mapped[str] = mapped_column(String(64), nullable=False)
    department_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_catalog.id"), nullable=True)
    manager_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    location_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("locations.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    hire_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    personal_info_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    documents_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    onboarding_checklist_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
