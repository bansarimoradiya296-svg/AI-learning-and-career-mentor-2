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


from pydantic import BaseModel

class PortfolioAnalysisRequest(BaseModel):
    target_career: str
    experience_level: str
    current_skills: str
    num_projects: int
    linkedin_status: str
    github_status: str
    portfolio_status: str
    resume_status: str
    certification_status: str


@router.post("/portfolio-analyze")
async def analyze_portfolio(
    payload: PortfolioAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Leverages Gemini to analyze portfolio readiness inputs and output strengths, weaknesses,
    and priority improvements.
    """
    import google.generativeai as genai
    from app.core.config import settings
    import json
    import re

    # Ensure gemini API is configured
    genai.configure(api_key=settings.GEMINI_API_KEY)

    prompt = (
        f"You are an Expert Technical Recruiter and Portfolio Coach.\n"
        f"Analyze the candidate's portfolio details:\n"
        f"- Target Career: {payload.target_career}\n"
        f"- Experience Level: {payload.experience_level}\n"
        f"- Current Skills: {payload.current_skills}\n"
        f"- Number of Projects: {payload.num_projects}\n"
        f"- LinkedIn Status: {payload.linkedin_status}\n"
        f"- GitHub Status: {payload.github_status}\n"
        f"- Portfolio Status: {payload.portfolio_status}\n"
        f"- Resume Status: {payload.resume_status}\n"
        f"- Certification Status: {payload.certification_status}\n\n"
        f"Provide a structured assessment in JSON format with the following keys:\n"
        f'  "strengths": list of 3-4 strengths,\n'
        f'  "weaknesses": list of 3-4 weak areas,\n'
        f'  "missing_elements": list of 3-4 missing items,\n'
        f'  "priority_improvements": list of 3-4 priority actions (numbered),\n'
        f'  "recommended_projects": list of 2 project ideas suitable for target career,\n'
        f'  "linkedin_improvements": list of 2 improvements,\n'
        f'  "github_improvements": list of 2 improvements,\n'
        f'  "resume_improvements": list of 2 improvements,\n'
        f'  "portfolio_improvements": list of 2 improvements.\n\n'
        f"Return raw JSON text only. Do not include markdown formatting or comments."
    )

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        raw_text_clean = re.sub(r'//.*$', '', raw_text, flags=re.MULTILINE)
        result = json.loads(raw_text_clean)
    except Exception as e:
        print(f"Failed to call Gemini for portfolio analysis: {e}")
        # Build logical default/fallback response tailored to target career
        result = {
            "strengths": [
                f"Demonstrated interest in the {payload.target_career} domain",
                f"Has {payload.num_projects} project(s) listed on their profile",
                "Awareness of key baseline skills"
            ],
            "weaknesses": [
                f"Needs to align Github repository showcase with professional {payload.target_career} standards",
                "Descriptions could emphasize problem statements and metric achievements more",
                "LinkedIn presence may not be optimized for recruiter search visibility"
            ],
            "missing_elements": [
                "ATS-optimized resume keywords matching job descriptions",
                "Pinned high-quality GitHub repositories with clear documentation",
                "Clean system architecture diagrams in the project READMEs"
            ],
            "priority_improvements": [
                f"1. Tailor your GitHub repository README files for {payload.target_career} tech stack.",
                "2. Align LinkedIn headline and summary with target industry roles.",
                "3. Build a personal portfolio site that lists your projects with live links."
            ],
            "recommended_projects": [
                f"Project 1: Advanced {payload.target_career} Application showcasing API design or data modeling.",
                "Project 2: End-to-end full stack utility containing security headers and user authentication."
            ],
            "linkedin_improvements": [
                "Write a professional headline mentioning specific technical methodologies.",
                "Add an about section showcasing passion for building robust engineering solutions."
            ],
            "github_improvements": [
                "Create a profile README introducing your stack and repository highlights.",
                "Clean up legacy or blank repositories to keep your profile clean."
            ],
            "resume_improvements": [
                "Format resume cleanly using standard sections (Skills, Projects, Experience).",
                "Ensure technical terms align with target applicant screening systems."
            ],
            "portfolio_improvements": [
                "Add live deployment links alongside code repository references.",
                "Detail your exact role and contributions for team/collaborative projects."
            ]
        }

    return result
