from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReviewCycle(Base):
    __tablename__ = "review_cycles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("review_cycles.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target: Mapped[str | None] = mapped_column(String(512), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("review_cycles.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    assessor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    ratings_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Pip(Base):
    __tablename__ = "pips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duration: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prerequisites_json: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    content_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    mandatory: Mapped[bool] = mapped_column(default=False, nullable=False)
    points: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrainingAssignment(Base):
    __tablename__ = "training_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    assigned_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="assigned", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrainingCompletion(Base):
    __tablename__ = "training_completions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("training_assignments.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    certificate_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)


class SkillProfile(Base):
    __tablename__ = "skill_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    skills_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
