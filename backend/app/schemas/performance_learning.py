from datetime import datetime
from typing import Any, Self

from pydantic import BaseModel, Field, field_validator, model_validator


class ReviewCycleKpiDefinitionIn(BaseModel):
    goal_key: str = Field(min_length=1, max_length=64)
    goal_description: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=255)
    weight_percent: int | None = Field(default=None, ge=0, le=100)


class ReviewCycleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    start_date: str | None = None
    end_date: str | None = None
    goals_deadline: str | None = Field(default=None, max_length=32)
    status: str = Field(default="draft", max_length=32)
    kpi_definitions: list[ReviewCycleKpiDefinitionIn] | None = None

    @model_validator(mode="after")
    def require_deadline_when_kpis(self) -> Self:
        kpis = self.kpi_definitions or []
        if len(kpis) > 0 and not (self.goals_deadline and self.goals_deadline.strip()):
            raise ValueError("goals_deadline is required when KPI definitions are included")
        return self


class ReviewCycleOut(BaseModel):
    id: str
    company_id: str
    name: str
    type: str | None
    start_date: str | None
    end_date: str | None
    goals_deadline: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewCycleKpiDefinitionOut(BaseModel):
    id: str
    company_id: str
    review_cycle_id: str
    goal_key: str
    goal_description: str
    category: str | None
    weight_percent: int | None
    created_at: datetime
    updated_at: datetime

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
    actual_achievement: str | None = None
    manager_rating: int | None = None
    manager_comment: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, max_length=32)
    cycle_id: str | None = None

    @field_validator("manager_rating")
    @classmethod
    def manager_rating_range(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if not 1 <= v <= 5:
            raise ValueError("manager_rating must be between 1 and 5")
        return v


class GoalOut(BaseModel):
    id: str
    company_id: str
    employee_id: str
    cycle_id: str | None
    kpi_definition_id: str | None
    title: str
    description: str | None
    target: str | None
    actual_achievement: str | None
    manager_rating: int | None
    manager_comment: str | None
    progress: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeCycleGoalRowOut(BaseModel):
    kpi_definition: ReviewCycleKpiDefinitionOut
    goal: GoalOut


class EmployeeMyCycleGoalsGroupOut(BaseModel):
    cycle: ReviewCycleOut
    rows: list[EmployeeCycleGoalRowOut]
    submitted_at: datetime | None = None


class MyCycleGoalSubmitItem(BaseModel):
    goal_id: str = Field(min_length=1, max_length=36)
    description: str = ""
    target: str = ""
    actual_achievement: str = ""

    @field_validator("description", "target", "actual_achievement", mode="before")
    @classmethod
    def strip_nonempty(cls, v: object) -> str:
        if not isinstance(v, str):
            raise TypeError("expected string")
        s = v.strip()
        if not s:
            raise ValueError("must not be empty")
        return s


class SubmitMyCycleGoalsBody(BaseModel):
    goals: list[MyCycleGoalSubmitItem]


class SubmitMyCycleGoalsResponse(BaseModel):
    review_cycle_id: str
    submitted_at: datetime
    message: str = "Your response has been recorded."


class PeerReviewCycleCardOut(BaseModel):
    cycle: ReviewCycleOut
    peer_nominations_submitted_at: datetime | None = None
    selected_reviewer_employee_ids: list[str] = Field(default_factory=list)


class SubmitPeerReviewNominationsBody(BaseModel):
    reviewer_employee_ids: list[str] = Field(min_length=1, max_length=3)

    @field_validator("reviewer_employee_ids")
    @classmethod
    def unique_nonempty_ids(cls, v: list[str]) -> list[str]:
        ids = [str(x).strip() for x in v if str(x).strip()]
        if not ids:
            raise ValueError("At least one reviewer_employee_id is required")
        if len(ids) > 3:
            raise ValueError("At most 3 peer reviewers are allowed")
        if len(ids) != len(set(ids)):
            raise ValueError("reviewer_employee_ids must be unique")
        return ids


class SubmitPeerReviewNominationsResponse(BaseModel):
    review_cycle_id: str
    submitted_at: datetime
    reviewers_notified: int


class PeerReviewPendingRequestOut(BaseModel):
    review_cycle_id: str
    cycle_name: str
    subject_employee_id: str
    subject_display_name: str
    subject_display_email: str


class SubmitPeerReviewFeedbackBody(BaseModel):
    subject_employee_id: str = Field(min_length=1, max_length=36)
    strengths: str = Field(min_length=1)
    improvements: str = Field(min_length=1)
    additional_feedback: str | None = None

    @field_validator("strengths", "improvements")
    @classmethod
    def strip_required_text(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("must not be empty")
        return s

    @field_validator("additional_feedback")
    @classmethod
    def optional_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class SubmitPeerReviewFeedbackResponse(BaseModel):
    review_cycle_id: str
    subject_employee_id: str
    message: str = "Peer feedback saved."


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
    notify_employee: bool = False


class PipAtRiskEmployeeOut(BaseModel):
    """Employees whose average manager KPI goal rating is below the configured threshold."""

    employee_id: str
    employee_display_name: str
    employee_display_email: str
    employee_code: str
    avg_manager_rating: float
    manager_rated_goal_count: int
    review_cycle_id: str | None = None


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
    content_url: str | None = None
    mandatory: bool = False


class CourseOut(BaseModel):
    id: str
    company_id: str
    title: str
    category: str | None
    duration: str | None
    prerequisites_json: Any | None
    content_url: str | None
    mandatory: bool
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


class GoalCycleEmployeeTrackingOut(BaseModel):
    """HR console: one row per employee in the goals program for a review cycle."""

    employee_id: str
    employee_display_name: str
    employee_display_email: str
    employee_code: str
    manager_employee_id: str | None = None
    manager_display_name: str | None = None
    goals_submitted: bool
    goals_submitted_at: datetime | None = None
    kpi_goal_count: int
    manager_rated_goal_count: int
    manager_review_status: str
    avg_manager_rating: float | None = None
    nominated_peer_count: int = 0
    nominated_peer_display_names: list[str] = Field(default_factory=list)
    peer_reviews_received_count: int = 0
    peer_reviewer_display_names: list[str] = Field(default_factory=list)


class GoalCycleTrackingOut(BaseModel):
    review_cycle: ReviewCycleOut
    rows: list[GoalCycleEmployeeTrackingOut]
