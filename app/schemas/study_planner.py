import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ─── Profile Schemas ────────────────────────────────────────

class SubjectInput(BaseModel):
    name: str
    marks: float = Field(0.0, ge=0, le=100)
    weak_topics: List[str] = []
    strong_topics: List[str] = []
    exam_date: Optional[str] = None  # YYYY-MM-DD
    priority: int = Field(5, ge=1, le=10)


class PlannerProfileCreate(BaseModel):
    daily_hours: float = Field(2.0, ge=0.5, le=16)
    preferred_study_time: str = "Evening"  # Morning, Afternoon, Evening, Night
    study_goal: Optional[str] = None
    subjects: List[SubjectInput] = []


class PlannerProfileResponse(BaseModel):
    id: uuid.UUID
    daily_hours: float
    preferred_study_time: str
    study_goal: Optional[str] = None
    subjects: Optional[list] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Plan Generation Schemas ────────────────────────────────

class GeneratePlanRequest(BaseModel):
    plan_scope: str = "today"  # today, week
    force_regenerate: bool = False


class ActivityCreate(BaseModel):
    calendar_date: str  # YYYY-MM-DD
    subject: str
    topic: str
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    planned_duration_min: int = 60
    priority: str = "Medium"


# ─── Activity Schemas ───────────────────────────────────────

class PlannerActivityResponse(BaseModel):
    id: uuid.UUID
    calendar_date: str
    subject: str
    topic: str
    start_time: str
    end_time: str
    planned_duration_min: int
    actual_duration_min: int
    priority: str
    status: str
    is_confirmed: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ActivityUpdateRequest(BaseModel):
    status: Optional[str] = None  # completed, missed, pending
    actual_duration_min: Optional[int] = None
    calendar_date: Optional[str] = None  # For reschedule
    start_time: Optional[str] = None
    end_time: Optional[str] = None


# ─── Goal Schemas ───────────────────────────────────────────

class PlannerGoalCreate(BaseModel):
    name: str
    target_date: Optional[str] = None  # YYYY-MM-DD
    total_tasks: int = Field(0, ge=0)


class PlannerGoalResponse(BaseModel):
    id: uuid.UUID
    name: str
    target_date: Optional[str] = None
    total_tasks: int
    completed_tasks: int
    progress: float
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PlannerGoalUpdate(BaseModel):
    completed_tasks: Optional[int] = None
    total_tasks: Optional[int] = None
    status: Optional[str] = None


# ─── Streak Schemas ─────────────────────────────────────────

class PlannerStreakResponse(BaseModel):
    current_streak: int = 0
    longest_streak: int = 0
    last_active_date: Optional[str] = None
    total_study_minutes: int = 0
    total_pomodoro_sessions: int = 0

    model_config = ConfigDict(from_attributes=True)


# ─── Pomodoro Schemas ───────────────────────────────────────

class PomodoroCompleteRequest(BaseModel):
    activity_id: Optional[uuid.UUID] = None
    subject: str
    duration_minutes: int = 25


# ─── Analytics Schemas ──────────────────────────────────────

class ProductivityAnalyticsResponse(BaseModel):
    total_planned_hours: float = 0.0
    total_actual_hours: float = 0.0
    completed_tasks: int = 0
    missed_tasks: int = 0
    pending_tasks: int = 0
    completion_percentage: float = 0.0
    most_studied_subject: Optional[str] = None
    weakest_subject: Optional[str] = None
    productivity_score: float = 0.0
    weekly_progress: list = []  # [{day, planned_min, actual_min}]
