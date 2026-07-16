import os
import uuid
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, status
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
from app.services.ai_companion import AICompanionService
from app.security.permissions import get_current_user

router = APIRouter(prefix="/study", tags=["Study Companion"])

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Uploads a learning material (PDF, DOCX, PPTX, TXT) and triggers background vector indexing (RAG).
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".pdf", ".docx", ".pptx", ".txt"]:
        raise BadRequestError("Unsupported file extension. Allowed: PDF, DOCX, PPTX, TXT.")

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
    background_tasks.add_task(ai_service.ingest_document, document)

    return document


@router.post("/ask")
async def ask_ai_companion(
    query: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Asks the AI Study Companion a question based on uploaded context documents (RAG).
    """
    ai_service = AICompanionService(db)
    answer = await ai_service.ask_document_rag(user_id=current_user.id, query=query)
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
