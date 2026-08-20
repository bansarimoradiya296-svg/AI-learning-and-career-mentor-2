import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, status, Form, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User
from app.models.study import Document, Flashcard, Quiz, QuizResult, Question
from app.schemas.study import (
    DocumentResponse, FlashcardResponse, FlashcardCreateRequest,
    FlashcardReviewRequest, QuizResponse, QuizSubmitRequest, QuizResultResponse
)
from app.schemas.planner import (
    StudyPlanCreateRequest, StudyPlanResponse, StudyPlanItemUpdate, 
    AdaptPlanRequest, StudyPlanItemResponse
)
from app.services.ai_companion import AICompanionService
from app.security.permissions import get_current_user

router = APIRouter(prefix="/study", tags=["Study Companion"])

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    generate_short: bool = Form(False),
    generate_detailed: bool = Form(False),
    generate_notes: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Uploads a learning material (PDF, DOCX, PPTX, TXT) and triggers background vector indexing (RAG).
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    allowed_extensions = [
        ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".txt",
        ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"
    ]
    if file_ext not in allowed_extensions:
        raise BadRequestError(
            f"Unsupported file extension. Allowed: {', '.join([ext.upper().replace('.', '') for ext in allowed_extensions])}."
        )

    file_id = uuid.uuid4()
    saved_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    # Save to disk
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise BadRequestError(f"Failed to save file: {str(e)}")

    document = Document(
        id=file_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_path=file_path,
        file_type=file_ext.replace(".", ""),
        size_bytes=len(content),
        embedding_status="PROCESSING"
    )
    
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Trigger async ingestion
    ai_service = AICompanionService(db)
    background_tasks.add_task(
        ai_service.ingest_document, 
        document.id,
        generate_short,
        generate_detailed,
        generate_notes
    )

    return document


@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Lists all study documents uploaded by the current user.
    """
    result = await db.execute(
        select(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.post("/ask")
async def ask_ai_companion(
    query: str,
    document_ids: Optional[List[uuid.UUID]] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Asks the AI Study Companion a question based on uploaded context documents (RAG).
    """
    ai_service = AICompanionService(db)
    answer = await ai_service.ask_document_rag(
        user_id=current_user.id, 
        query=query,
        document_ids=document_ids
    )
    return {"query": query, "answer": answer}


@router.post("/mindmap")
async def generate_mindmap(
    topic: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates a hierarchical JSON concept mindmap for a topic."""
    ai_service = AICompanionService(db)
    mindmap = await ai_service.generate_mindmap(topic=topic, user_id=current_user.id)
    return mindmap


@router.post("/flashcards/generate", response_model=List[FlashcardResponse])
async def generate_flashcards(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates flashcards from an uploaded document."""
    ai_service = AICompanionService(db)
    cards = await ai_service.generate_flashcards(document_id=document_id, user_id=current_user.id)
    return cards


@router.get("/flashcards", response_model=List[FlashcardResponse])
async def list_flashcards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all flashcards registered to the student."""
    result = await db.execute(select(Flashcard).filter(Flashcard.user_id == current_user.id))
    return result.scalars().all()


@router.post("/flashcards/review")
async def review_flashcard(
    payload: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Applies the SuperMemo SM-2 Spaced Repetition algorithm based on user quality score (0-5).
    """
    result = await db.execute(select(Flashcard).filter(Flashcard.id == payload.flashcard_id))
    flashcard = result.scalars().first()
    if not flashcard or flashcard.user_id != current_user.id:
        raise NotFoundError("Flashcard not found")

    q = payload.rating
    if q < 0 or q > 5:
        raise BadRequestError("Rating must be an integer between 0 and 5.")

    # SM-2 Spaced Repetition calculation
    # Track repetitions internally or infer from interval
    repetitions = 0 if flashcard.interval_days <= 1 else 1

    if q >= 3:
        if repetitions == 0:
            flashcard.interval_days = 1
        elif repetitions == 1:
            flashcard.interval_days = 6
        else:
            flashcard.interval_days = int(flashcard.interval_days * flashcard.ease_factor)
    else:
        flashcard.interval_days = 1

    # Update ease factor
    flashcard.ease_factor = flashcard.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if flashcard.ease_factor < 1.3:
        flashcard.ease_factor = 1.3

    flashcard.next_review_at = datetime.utcnow() + timedelta(days=flashcard.interval_days)
    
    db.add(flashcard)
    await db.commit()
    return {"message": "Flashcard schedule updated", "next_review_at": flashcard.next_review_at}


@router.post("/quizzes/generate", response_model=QuizResponse)
async def generate_quiz(
    document_id: uuid.UUID,
    difficulty: str = "MEDIUM",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates multiple choice questions (Quiz) from a document."""
    ai_service = AICompanionService(db)
    quiz = await ai_service.generate_quiz(document_id=document_id, difficulty=difficulty)
    if not quiz:
        raise BadRequestError("Failed to generate quiz. Verify document structure.")
    return quiz


@router.get("/quizzes/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves a specific quiz by ID."""
    result = await db.execute(
        select(Quiz).filter(Quiz.id == quiz_id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise NotFoundError("Quiz not found")
    return quiz


@router.post("/quizzes/{quiz_id}/submit", response_model=QuizResultResponse)
async def submit_quiz(
    quiz_id: uuid.UUID,
    payload: QuizSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits student responses, calculates raw scores, and saves QuizResult logging.
    """
    result = await db.execute(select(Quiz).filter(Quiz.id == quiz_id))
    quiz = result.scalars().first()
    if not quiz:
        raise NotFoundError("Quiz not found")

    correct_answers = 0
    total_questions = len(quiz.questions)

    for question in quiz.questions:
        student_ans = payload.answers.get(str(question.id))
        if student_ans == question.correct_option:
            correct_answers += 1

    quiz_result = QuizResult(
        user_id=current_user.id,
        quiz_id=quiz.id,
        score=correct_answers,
        total_questions=total_questions,
        completed_at=datetime.utcnow()
    )
    db.add(quiz_result)
    await db.commit()
    await db.refresh(quiz_result)

    return quiz_result


@router.get("/weakness-analysis")
async def get_weakness_analysis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Analyzes recent quiz scores to compile study action recommendations."""
    ai_service = AICompanionService(db)
    analysis = await ai_service.analyze_weak_topics(user_id=current_user.id)
    return analysis


@router.post("/planner/extract-syllabus")
async def extract_syllabus(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Extracts structured topics and subtopics from an uploaded syllabus file.
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    allowed_extensions = [
        ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".txt",
        ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"
    ]
    if file_ext not in allowed_extensions:
        raise BadRequestError(f"Unsupported syllabus extension: {file_ext}")

    file_id = uuid.uuid4()
    saved_filename = f"syllabus_{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise BadRequestError(f"Failed to save syllabus file: {str(e)}")

    ai_service = AICompanionService(db)
    result_data = await ai_service.extract_syllabus_topics(file_path, file_ext)
    return {
        "filename": file.filename,
        "classification": result_data["classification"],
        "course_metadata": result_data["course_metadata"],
        "topics": result_data["topics"]
    }


@router.post("/planner/generate", response_model=StudyPlanResponse)
async def generate_plan(
    payload: StudyPlanCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates a personalized study plan and stores it in the database.
    """
    topics_list = [t.model_dump() for t in payload.topics]
    preferences_dict = payload.preferences.model_dump()
    weekly_avail = payload.preferences.weekly_availability

    ai_service = AICompanionService(db)
    study_plan = await ai_service.generate_study_schedule(
        user_id=current_user.id,
        title=payload.title,
        topics=topics_list,
        preferences=preferences_dict,
        weekly_availability=weekly_avail,
        target_date=payload.target_date
    )
    
    result = await db.execute(
        select(StudyPlan)
        .filter(StudyPlan.id == study_plan.id)
    )
    plan = result.scalars().first()
    
    items_res = await db.execute(
        select(StudyPlanItem)
        .filter(StudyPlanItem.plan_id == plan.id)
        .order_by(StudyPlanItem.sort_order.asc())
    )
    plan.items = items_res.scalars().all()
    
    return plan


@router.get("/planner/active", response_model=Optional[StudyPlanResponse])
async def get_active_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the currently active study plan and its schedule items.
    """
    result = await db.execute(
        select(StudyPlan)
        .filter(StudyPlan.user_id == current_user.id, StudyPlan.is_active == True)
    )
    plan = result.scalars().first()
    if not plan:
        return None

    items_res = await db.execute(
        select(StudyPlanItem)
        .filter(StudyPlanItem.plan_id == plan.id)
        .order_by(StudyPlanItem.sort_order.asc())
    )
    plan.items = items_res.scalars().all()
    return plan


@router.put("/planner/items/{item_id}", response_model=StudyPlanItemResponse)
async def update_plan_item(
    item_id: uuid.UUID,
    payload: StudyPlanItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates details like timing or completion status for a study session block.
    """
    result = await db.execute(
        select(StudyPlanItem)
        .filter(StudyPlanItem.id == item_id)
    )
    item = result.scalars().first()
    if not item:
        raise NotFoundError("Study plan item not found")

    plan_res = await db.execute(
        select(StudyPlan).filter(StudyPlan.id == item.plan_id)
    )
    plan = plan_res.scalars().first()
    if not plan or plan.user_id != current_user.id:
        raise BadRequestError("Permission denied.")

    if payload.completed is not None:
        item.completed = payload.completed
    if payload.your_time is not None:
        item.your_time = payload.your_time
    if payload.duration_minutes is not None:
        item.duration_minutes = payload.duration_minutes
    if payload.start_time is not None:
        item.start_time = payload.start_time
    if payload.end_time is not None:
        item.end_time = payload.end_time

    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/planner/adapt", response_model=StudyPlanResponse)
async def adapt_plan(
    payload: AdaptPlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Performs dynamic adaptive rescheduling of missed sessions.
    """
    plan_res = await db.execute(
        select(StudyPlan).filter(StudyPlan.user_id == current_user.id, StudyPlan.is_active == True)
    )
    plan = plan_res.scalars().first()
    if not plan:
        raise BadRequestError("No active study plan to adapt.")

    ai_service = AICompanionService(db)
    updated_plan = await ai_service.adapt_study_schedule(
        user_id=current_user.id,
        plan_id=plan.id,
        completed_item_ids=payload.completed_item_ids,
        missed_item_ids=payload.missed_item_ids
    )

    items_res = await db.execute(
        select(StudyPlanItem)
        .filter(StudyPlanItem.plan_id == updated_plan.id)
        .order_by(StudyPlanItem.sort_order.asc())
    )
    updated_plan.items = items_res.scalars().all()
    return updated_plan


@router.get("/planner/coach")
async def get_daily_coach_report(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    AI Pipeline Stage 5: Queries database for today's study progress and quiz scores,
    and returns a personalized progress report and next-day suggestions from the AI Coach.
    """
    # Import QuizResult model for scoring
    from app.models.study import QuizResult
    
    # 1. Get active study plan
    result = await db.execute(
        select(StudyPlan)
        .filter(StudyPlan.user_id == current_user.id, StudyPlan.is_active == True)
    )
    plan = result.scalars().first()
    if not plan:
        return {
            "learning_score": 0,
            "motivation": "No active study plan found. Create one above to let your AI Progress Coach guide you!",
            "tomorrow_plan": "Create your personalized AI study plan.",
            "weak_topics": [],
            "recommended_revision": [],
            "confidence_score": 0
        }
        
    # 2. Get sessions
    items_res = await db.execute(
        select(StudyPlanItem)
        .filter(StudyPlanItem.plan_id == plan.id)
        .order_by(StudyPlanItem.sort_order.asc())
    )
    items = items_res.scalars().all()
    if not items:
        return {
            "learning_score": 0,
            "motivation": "No schedule items found. Please generate your study schedule.",
            "tomorrow_plan": "Generate your daily schedule.",
            "weak_topics": [],
            "recommended_revision": [],
            "confidence_score": 0
        }
    
    # Calculate active day
    active_day = 1
    for it in items:
        if not it.completed and not it.is_break:
            active_day = it.day_number
            break
            
    today_items = [it for it in items if it.day_number == active_day]
    
    completed_items = [it for it in today_items if it.completed]
    skipped_items = [it for it in today_items if not it.completed and not it.is_break]
    
    completed_count = len(completed_items)
    skipped_count = len(skipped_items)
    
    completed_topics = [it.topic for it in completed_items]
    skipped_topics = [it.topic for it in skipped_items]
    
    study_hours = sum([it.duration_minutes for it in completed_items]) / 60.0
    
    # Get recent quiz scores for user
    quiz_res = await db.execute(
        select(QuizResult)
        .filter(QuizResult.user_id == current_user.id)
        .order_by(QuizResult.completed_at.desc())
        .limit(5)
    )
    recent_quizzes = quiz_res.scalars().all()
    if recent_quizzes:
        avg_quiz_score = int(sum([q.score / q.total_questions * 100 for q in recent_quizzes]) / len(recent_quizzes))
    else:
        avg_quiz_score = 75 # Default fallback
        
    ai_service = AICompanionService(db)
    report = await ai_service.generate_daily_coach_report(
        user_id=current_user.id,
        completed_count=completed_count,
        skipped_count=skipped_count,
        quiz_score=avg_quiz_score,
        study_hours=study_hours,
        completed_topics=completed_topics,
        skipped_sessions=skipped_topics
    )
    return report

