import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User
from app.models.career import CareerGoal, Roadmap
from app.schemas.career import CareerGoalResponse, RoadmapResponse
from app.services.career_mentor import CareerMentorService
from app.security.permissions import get_current_user

router = APIRouter(prefix="/career", tags=["Career Mentor"])

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/analyze", response_model=CareerGoalResponse, status_code=status.HTTP_201_CREATED)
async def analyze_resume_and_set_profile(
    target_job_title: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ingests resume document, compares it against target role qualifications,
    builds recommended projects/certifications, and initiates learning roadmaps.
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".pdf", ".docx", ".txt"]:
        raise BadRequestError("Unsupported resume format. Allowed: PDF, DOCX, TXT.")

    file_id = uuid.uuid4()
    saved_filename = f"resume_{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise BadRequestError(f"Failed to save resume: {str(e)}")

    mentor_service = CareerMentorService(db)
    goal = await mentor_service.analyze_resume_and_set_goal(
        file_path=file_path,
        file_type=file_ext.replace(".", ""),
        target_job_title=target_job_title,
        user_id=current_user.id
    )
    
    # Commit changes
    await db.commit()
    
    # Reload goal with relationships
    stmt = (
        select(CareerGoal)
        .filter(CareerGoal.id == goal.id)
        .options(
            selectinload(CareerGoal.roadmaps),
            selectinload(CareerGoal.projects),
            selectinload(CareerGoal.certifications)
        )
    )
    res = await db.execute(stmt)
    loaded_goal = res.scalars().first()
    return loaded_goal


@router.get("/goals", response_model=List[CareerGoalResponse])
async def list_career_goals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves list of active career profiles and recommendations for the student."""
    stmt = (
        select(CareerGoal)
        .filter(CareerGoal.user_id == current_user.id)
        .options(
            selectinload(CareerGoal.roadmaps),
            selectinload(CareerGoal.projects),
            selectinload(CareerGoal.certifications)
        )
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/roadmaps/{roadmap_id}", response_model=RoadmapResponse)
async def get_roadmap(
    roadmap_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves details of a specific training roadmap."""
    stmt = select(Roadmap).filter(Roadmap.id == roadmap_id)
    result = await db.execute(stmt)
    roadmap = result.scalars().first()
    if not roadmap:
        raise NotFoundError("Roadmap not found")
    return roadmap
