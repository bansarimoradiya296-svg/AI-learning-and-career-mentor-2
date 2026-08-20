"""
Study Planner API endpoints — /api/v1/planner

Full CRUD for planner profile, plan generation, activity management,
Pomodoro tracking, goals, streak, analytics, and AI recommendations.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User
from app.models.study import PlannerProfile, PlannerActivity, PlannerGoal
from app.schemas.study_planner import (
    PlannerProfileCreate, PlannerProfileResponse,
    GeneratePlanRequest, PlannerActivityResponse,
    ActivityUpdateRequest, ActivityCreate,
    PlannerGoalCreate, PlannerGoalResponse, PlannerGoalUpdate,
    PlannerStreakResponse, PomodoroCompleteRequest,
    ProductivityAnalyticsResponse
)
from app.services.study_planner_service import StudyPlannerService
from app.security.permissions import get_current_user

router = APIRouter(prefix="/planner", tags=["Study Planner"])


# ─── Profile ────────────────────────────────────────────────

@router.post("/profile", response_model=PlannerProfileResponse, status_code=status.HTTP_200_OK)
async def save_planner_profile(
    payload: PlannerProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates or updates the student's planner profile (subjects, hours, preferences)."""
    result = await db.execute(
        select(PlannerProfile).filter(PlannerProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    subjects_data = [s.model_dump() for s in payload.subjects]

    if profile:
        profile.daily_hours = payload.daily_hours
        profile.preferred_study_time = payload.preferred_study_time
        profile.study_goal = payload.study_goal
        profile.subjects = subjects_data
    else:
        profile = PlannerProfile(
            user_id=current_user.id,
            daily_hours=payload.daily_hours,
            preferred_study_time=payload.preferred_study_time,
            study_goal=payload.study_goal,
            subjects=subjects_data
        )
        db.add(profile)

    await db.flush()
    await db.refresh(profile)
    return profile


@router.get("/profile", response_model=PlannerProfileResponse)
async def get_planner_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns the student's saved planner profile."""
    result = await db.execute(
        select(PlannerProfile).filter(PlannerProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()
    if not profile:
        raise NotFoundError("No planner profile found. Please set up your study profile first.")
    return profile


# ─── Plan Generation ────────────────────────────────────────

@router.post("/generate", response_model=List[PlannerActivityResponse])
async def generate_study_plan(
    payload: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates a personalized study plan (today or week) based on the student's profile."""
    result = await db.execute(
        select(PlannerProfile).filter(PlannerProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()
    if not profile:
        raise BadRequestError("No planner profile found. Please save your profile first.")
    if not profile.subjects:
        raise BadRequestError("No subjects configured. Please add at least one subject to your profile.")

    service = StudyPlannerService(db)
    activities = await service.generate_plan(
        user_id=current_user.id,
        profile=profile,
        scope=payload.plan_scope,
        force=payload.force_regenerate
    )
    return activities


@router.post("/set-plan")
async def set_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Confirms the generated plan — activities appear on the smart calendar."""
    service = StudyPlannerService(db)
    count = await service.confirm_plan(current_user.id)
    return {"status": "confirmed", "activities_confirmed": count}


# ─── Activities CRUD ────────────────────────────────────────

@router.get("/activities", response_model=List[PlannerActivityResponse])
async def list_activities(
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all planned activities, optionally filtered by date range."""
    service = StudyPlannerService(db)
    return await service.get_activities(current_user.id, date_from, date_to)


@router.put("/activities/{activity_id}", response_model=PlannerActivityResponse)
async def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates an activity — mark complete, missed, reschedule, or adjust time."""
    service = StudyPlannerService(db)
    activity = await service.update_activity(
        current_user.id, activity_id, payload.model_dump(exclude_none=True)
    )
    if not activity:
        raise NotFoundError("Activity not found")
    return activity


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes an activity from the calendar."""
    service = StudyPlannerService(db)
    deleted = await service.delete_activity(current_user.id, activity_id)
    if not deleted:
        raise NotFoundError("Activity not found")


@router.post("/activities", response_model=PlannerActivityResponse, status_code=status.HTTP_201_CREATED)
async def add_activity(
    payload: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Adds a new custom activity to the calendar."""
    service = StudyPlannerService(db)
    activity = await service.add_custom_activity(current_user.id, payload.model_dump())
    return activity


# ─── Pomodoro ───────────────────────────────────────────────

@router.post("/pomodoro/complete")
async def complete_pomodoro(
    payload: PomodoroCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Records a completed Pomodoro study session."""
    service = StudyPlannerService(db)
    result = await service.record_pomodoro(
        user_id=current_user.id,
        subject=payload.subject,
        duration_minutes=payload.duration_minutes,
        activity_id=payload.activity_id
    )
    return result


# ─── Goals ──────────────────────────────────────────────────

@router.post("/goals", response_model=PlannerGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    payload: PlannerGoalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new learning goal."""
    service = StudyPlannerService(db)
    goal = await service.create_goal(current_user.id, payload.model_dump())
    return goal


@router.get("/goals", response_model=List[PlannerGoalResponse])
async def list_goals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all student goals."""
    service = StudyPlannerService(db)
    return await service.get_goals(current_user.id)


@router.put("/goals/{goal_id}", response_model=PlannerGoalResponse)
async def update_goal(
    goal_id: uuid.UUID,
    payload: PlannerGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates goal progress."""
    service = StudyPlannerService(db)
    goal = await service.update_goal(current_user.id, goal_id, payload.model_dump(exclude_none=True))
    if not goal:
        raise NotFoundError("Goal not found")
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes a goal."""
    service = StudyPlannerService(db)
    deleted = await service.delete_goal(current_user.id, goal_id)
    if not deleted:
        raise NotFoundError("Goal not found")


# ─── Streak ─────────────────────────────────────────────────

@router.get("/streak")
async def get_streak(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns learning streak data."""
    service = StudyPlannerService(db)
    return await service.get_streak(current_user.id)


# ─── Analytics ──────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns comprehensive productivity analytics."""
    service = StudyPlannerService(db)
    return await service.get_analytics(current_user.id)


# ─── Recommendations ───────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns AI-powered personalized study recommendations."""
    service = StudyPlannerService(db)
    recs = await service.get_recommendations(current_user.id)
    return {"recommendations": recs}
