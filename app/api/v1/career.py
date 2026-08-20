import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from pydantic import BaseModel
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
        .order_by(CareerGoal.created_at.desc())
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


# ── Phase Status Update ───────────────────────────────────────────────────────

class PhaseStatusUpdate(BaseModel):
    phase_num: int      # 1-based phase number
    phase_status: str   # "upcoming" | "inprogress" | "completed"


@router.patch("/roadmaps/{roadmap_id}/phase-status", response_model=RoadmapResponse)
async def update_phase_status(
    roadmap_id: uuid.UUID,
    payload: PhaseStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the status of a specific phase in a roadmap and recalculates completion percentage."""
    stmt = select(Roadmap).filter(Roadmap.id == roadmap_id)
    result = await db.execute(stmt)
    roadmap = result.scalars().first()
    if not roadmap:
        raise NotFoundError("Roadmap not found")

    allowed = {"upcoming", "inprogress", "completed"}
    if payload.phase_status not in allowed:
        raise BadRequestError(f"Invalid status. Allowed: {allowed}")

    # Update the target phase status inside JSON
    import copy
    structure = copy.deepcopy(roadmap.structure)
    phases = structure.get("phases", [])
    for phase in phases:
        if phase.get("phase_num") == payload.phase_num:
            phase["status"] = payload.phase_status
            break

    structure["phases"] = phases

    # Recalculate completion percentage
    total = len(phases)
    completed_count = sum(1 for p in phases if p.get("status") == "completed")
    inprogress_count = sum(1 for p in phases if p.get("status") == "inprogress")
    completion = 0.0
    if total > 0:
        completion = round(((completed_count + inprogress_count * 0.5) / total) * 100, 1)

    from sqlalchemy.orm.attributes import flag_modified
    roadmap.structure = structure
    flag_modified(roadmap, "structure")
    roadmap.completion_percentage = completion

    await db.commit()
    await db.refresh(roadmap)
    return roadmap
