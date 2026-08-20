import uuid
from typing import List
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core import database
from app.core.exceptions import NotFoundError, BadRequestError, AuthError
from app.models.auth import User
from app.models.interview import InterviewSession, InterviewMessage, InterviewReport, PortfolioProject
from app.schemas.interview import InterviewSessionResponse, InterviewSessionRequest, InterviewReportResponse
from app.schemas.portfolio import PortfolioProjectRequest, PortfolioProjectResponse
from app.services.interview_coach import InterviewCoachService
from app.security.permissions import get_current_user
from app.security.auth_handler import decode_access_token

router = APIRouter(prefix="/interview", tags=["Interview Simulator"])


@router.post("/sessions", response_model=InterviewSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_interview_session(
    payload: InterviewSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new mock interview session and initializes greeting logic."""
    coach = InterviewCoachService(db)
    session = await coach.create_session(user_id=current_user.id, interview_type=payload.type)
    
    # Generate the opening question
    await coach.generate_first_question(session)
    await db.commit()

    # Load complete relations
    stmt = (
        select(InterviewSession)
        .filter(InterviewSession.id == session.id)
        .options(
            selectinload(InterviewSession.messages),
            selectinload(InterviewSession.report)
        )
    )
    result = await db.execute(stmt)
    return result.scalars().first()


@router.get("/sessions", response_model=List[InterviewSessionResponse])
async def list_interview_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all previous mock interview sessions for this student."""
    stmt = (
        select(InterviewSession)
        .filter(InterviewSession.user_id == current_user.id)
        .options(selectinload(InterviewSession.messages), selectinload(InterviewSession.report))
        .order_by(InterviewSession.started_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=InterviewSessionResponse)
async def get_session_details(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves the dialogue history and grading details of a specific interview session."""
    stmt = (
        select(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .options(selectinload(InterviewSession.messages), selectinload(InterviewSession.report))
    )
    result = await db.execute(stmt)
    session = result.scalars().first()
    if not session:
        raise NotFoundError("Interview session not found")
    return session


@router.websocket("/ws/{session_id}")
async def interview_websocket(
    websocket: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(None),
    difficulty: str = Query("MEDIUM"),
    duration: int = Query(30),
    language: str = Query("ENGLISH")
):
    """
    WebSocket endpoint handling real-time interview discussions.
    Verifies JWT token, loads session logs, and streams dynamic interviewer questions.
    """
    await websocket.accept()
    
    # 1. Authorize connection
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return

    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise AuthError("Invalid payload")
        user_uuid = uuid.UUID(user_id_str)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid authorization token")
        return

    # Use a thread-safe / transaction-safe async session wrapper for WebSocket scope
    async with database.AsyncSessionLocal() as db:
        coach = InterviewCoachService(db)
        
        # Load session details
        stmt = select(InterviewSession).filter(InterviewSession.id == session_id, InterviewSession.user_id == user_uuid)
        result = await db.execute(stmt)
        session = result.scalars().first()
        
        if not session or session.status != "ACTIVE":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Active interview session not found")
            return

        # Fetch current conversation history to ensure welcome greeting has run
        msg_stmt = (
            select(InterviewMessage)
            .filter(InterviewMessage.session_id == session_id)
            .order_by(InterviewMessage.created_at)
        )
        msg_result = await db.execute(msg_stmt)
        messages = msg_result.scalars().all()
        
        # If no messages, seed greeting
        if not messages:
            greeting = await coach.generate_first_question(session, difficulty=difficulty, language=language)
            await db.commit()
            await websocket.send_json({"sender": "INTERVIEWER", "text": greeting})
        else:
            # Send current history to UI
            for msg in messages:
                await websocket.send_json({"sender": msg.sender_role, "text": msg.text_content})

        try:
            while True:
                # Wait for user input
                data = await websocket.receive_text()
                
                # Check for command indicators
                if data.strip() == "/end":
                    # End session & calculate report card
                    await websocket.send_json({"sender": "SYSTEM", "text": "Ending interview session and compiling evaluation reports..."})
                    report = await coach.generate_evaluation_report(session_id)
                    await db.commit()
                    
                    # Return final scores
                    await websocket.send_json({
                        "sender": "REPORT",
                        "text": "Report compiled",
                        "report": {
                            "technical_score": report.technical_score,
                            "communication_score": report.communication_score,
                            "confidence_score": report.confidence_score,
                            "overall_score": report.overall_score,
                            "evaluation_summary": report.evaluation_summary
                        }
                    })
                    break
                
                # Process response and yield next question
                next_question = await coach.process_response_and_ask_next(
                    session,
                    student_response=data,
                    difficulty=difficulty,
                    language=language
                )
                await db.commit()
                
                await websocket.send_json({"sender": "INTERVIEWER", "text": next_question})
                
        except WebSocketDisconnect:
            print(f"WebSocket interview disconnect logged for session: {session_id}")
        except Exception as e:
            await websocket.send_json({"sender": "SYSTEM", "text": f"An error occurred: {str(e)}"})
        finally:
            # Force connection close
            try:
                await websocket.close()
            except Exception:
                pass


@router.get("/portfolio", response_model=List[PortfolioProjectResponse])
async def list_portfolio_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all analyzed portfolio projects for the student."""
    stmt = select(PortfolioProject).filter(PortfolioProject.user_id == current_user.id).order_by(PortfolioProject.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/portfolio", response_model=PortfolioProjectResponse, status_code=status.HTTP_201_CREATED)
async def add_portfolio_project(
    payload: PortfolioProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Evaluates a new portfolio project using AI and saves it."""
    coach = InterviewCoachService(db)
    score, feedback = await coach.evaluate_portfolio_project(
        title=payload.title,
        tech_stack=payload.tech_stack,
        description=payload.description
    )
    
    project = PortfolioProject(
        user_id=current_user.id,
        title=payload.title,
        tech_stack=payload.tech_stack,
        description=payload.description,
        github_url=payload.github_url,
        score=score,
        feedback=feedback
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/portfolio/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes a portfolio project from the system."""
    stmt = select(PortfolioProject).filter(PortfolioProject.id == project_id, PortfolioProject.user_id == current_user.id)
    result = await db.execute(stmt)
    project = result.scalars().first()
    if not project:
        raise NotFoundError("Portfolio project not found")
    await db.delete(project)
    await db.commit()
    return
