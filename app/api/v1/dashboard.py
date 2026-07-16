import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.auth import User
from app.models.study import QuizResult
from app.models.coding import CodingSubmission
from app.models.career import CareerGoal, Roadmap
from app.models.interview import InterviewSession
from app.security.permissions import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Student Dashboard"])


@router.get("/metrics")
async def get_student_dashboard_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Compiles learning telemetry for the student home tab:
    XP score, quizzes finished, challenges accepted, and overall job readiness.
    """
    # 1. Quizzes completed & average score
    quiz_stmt = select(QuizResult).filter(QuizResult.user_id == current_user.id)
    quiz_res = await db.execute(quiz_stmt)
    quizzes = quiz_res.scalars().all()
    
    quizzes_completed = len(quizzes)
    avg_quiz_score = 0.0
    total_xp = 0
    if quizzes_completed > 0:
        total_correct = sum(q.score for q in quizzes)
        total_questions = sum(q.total_questions for q in quizzes)
        if total_questions > 0:
            avg_quiz_score = round((total_correct / total_questions) * 100, 1)
        total_xp += total_correct * 20 # 20 XP per correct question

    # 2. Coding problems accepted
    code_stmt = (
        select(CodingSubmission)
        .filter(CodingSubmission.user_id == current_user.id, CodingSubmission.status == "ACCEPTED")
    )
    code_res = await db.execute(code_stmt)
    accepted_submissions = len(code_res.scalars().all())
    total_xp += accepted_submissions * 50 # 50 XP per accepted solution

    # 3. Active roadmap progress
    roadmap_stmt = (
        select(Roadmap)
        .join(CareerGoal)
        .filter(CareerGoal.user_id == current_user.id)
        .order_by(Roadmap.created_at.desc())
        .limit(1)
    )
    roadmap_res = await db.execute(roadmap_stmt)
    latest_roadmap = roadmap_res.scalars().first()
    roadmap_progress = latest_roadmap.completion_percentage if latest_roadmap else 0.0

    # 4. Mock Interviews completed
    int_stmt = select(InterviewSession).filter(InterviewSession.user_id == current_user.id, InterviewSession.status == "COMPLETED")
    int_res = await db.execute(int_stmt)
    interviews_completed = len(int_res.scalars().all())
    total_xp += interviews_completed * 100 # 100 XP per interview mock run

    # 5. Job readiness rating
    goal_stmt = select(CareerGoal).filter(CareerGoal.user_id == current_user.id).order_by(CareerGoal.roadmap_status.desc()).limit(1)
    goal_res = await db.execute(goal_stmt)
    latest_goal = goal_res.scalars().first()
    
    # Standard readiness score calculation if resume was parsed
    job_title = latest_goal.target_job_title if latest_goal else "Not Set"
    job_readiness = 65.0 if latest_goal else 0.0 # base rating placeholder

    return {
        "student_name": f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email,
        "total_xp": total_xp,
        "quizzes_completed": quizzes_completed,
        "average_quiz_score": avg_quiz_score,
        "coding_challenges_solved": accepted_submissions,
        "interviews_completed": interviews_completed,
        "roadmap_progress": roadmap_progress,
        "target_job_title": job_title,
        "job_readiness_score": job_readiness
    }
