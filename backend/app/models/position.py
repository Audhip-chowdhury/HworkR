"""Org chart positions: department-scoped or C-suite / temporary buckets; grade and reporting lines."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.org import Department


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # When department_id is set: bucket must be "none". Otherwise: "c_suite" or "temporary".
    bucket: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    # Lower grade = more senior (1 = top of chart within a sibling group).
    grade: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    reports_to_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("positions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    works_with_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("positions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    department: Mapped["Department | None"] = relationship("Department", foreign_keys=[department_id])
