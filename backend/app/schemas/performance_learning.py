from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReviewCycleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    start_date: str | None = None
    end_date: str | None = None
    status: str = Field(default="draft", max_length=32)


class ReviewCycleOut(BaseModel):
    id: str
    company_id: str
    name: str
    type: str | None
    start_date: str | None
    end_date: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GoalCreate(BaseModel):
    employee_id: str
    cycle_id: str | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    target: str | None = None
    progress: int = Field(default=0, ge=0, le=100)
    status: str = Field(default="active", max_length=32)


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    target: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, max_length=32)
    cycle_id: str | None = None


class GoalOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    cycle_id: str | None
    title: str
    description: str | None
    target: str | None
    progress: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssessmentCreate(BaseModel):
    employee_id: str
    cycle_id: str | None = None
    type: str = Field(min_length=1, max_length=64)
    assessor_id: str | None = None
    ratings_json: dict[str, Any] | None = None
    comments: str | None = None


class AssessmentOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    cycle_id: str | None
    type: str
    assessor_id: str | None
    ratings_json: dict[str, Any] | None
    comments: str | None
    submitted_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PipCreate(BaseModel):
    employee_id: str
    reason: str | None = None
    plan_json: dict[str, Any] | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str = Field(default="active", max_length=32)


class PipOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    reason: str | None
    plan_json: dict[str, Any] | None
    start_date: str | None
    end_date: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category: str | None = None
    duration: str | None = None
    prerequisites_json: Any | None = None
    content_url: str | None = Field(default=None, description="YouTube video URL")
    mandatory: bool = False
    points: float = Field(default=0.0, ge=0)
    due_date: str | None = Field(default=None, description="ISO date (YYYY-MM-DD) — assigned to all employees")


class CourseOut(BaseModel):
    id: str
    company_id: str
    title: str
    category: str | None
    duration: str | None
    prerequisites_json: Any | None
    content_url: str | None
    mandatory: bool
    points: float
    due_date: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainingAssignmentCreate(BaseModel):
    employee_id: str
    course_id: str
    due_date: str | None = None
    status: str = Field(default="assigned", max_length=32)


class TrainingAssignmentOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    course_id: str
    assigned_by: str | None
    due_date: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainingAssignmentEnrichedOut(BaseModel):
    """Assignment with course details and completion summary for UI tables."""

    id: str
    company_id: str
    employee_id: str
    course_id: str
    assigned_by: str | None
    due_date: str | None
    status: str
    created_at: datetime
    course_title: str
    course_points: float
    youtube_url: str | None
    completion_score: float | None = None
    completed_at: datetime | None = None
    display_status: str
    overdue_before_due: bool = False


class CourseEmployeeScoreRow(BaseModel):
    employee_id: str
    employee_code: str | None
    display_name: str
    score: float
    status_label: str
    overdue_before_due: bool
    didnt_attend: bool


class LearningEmployeeSuggestion(BaseModel):
    employee_id: str
    label: str


class TrainingCompletionCreate(BaseModel):
    assignment_id: str
    score: float | None = None
    certificate_url: str | None = None


class TrainingCompletionOut(BaseModel):
    id: str
    assignment_id: str
    company_id: str
    completed_at: datetime
    score: float | None
    certificate_url: str | None

    model_config = {"from_attributes": True}


class SkillProfileUpsert(BaseModel):
    skills_json: dict[str, Any]


class SkillProfileOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    skills_json: dict[str, Any] | None
    updated_at: datetime

    model_config = {"from_attributes": True}
