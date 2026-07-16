import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    file_type: str
    size_bytes: int
    embedding_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FlashcardCreateRequest(BaseModel):
    front: str
    back: str
    document_id: Optional[uuid.UUID] = None


class FlashcardReviewRequest(BaseModel):
    flashcard_id: uuid.UUID
    rating: int # Spaced repetition quality rating: 0-5


class FlashcardResponse(BaseModel):
    id: uuid.UUID
    front: str
    back: str
    next_review_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionResponse(BaseModel):
    id: uuid.UUID
    question_text: str
    options: List[str]
    explanation: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class QuizResponse(BaseModel):
    id: uuid.UUID
    title: str
    difficulty: str
    questions: List[QuestionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class QuizSubmitRequest(BaseModel):
    answers: dict # Mapping of Question ID -> Option selected, e.g., {"uuid-123": "A"}


class QuizResultResponse(BaseModel):
    id: uuid.UUID
    quiz_id: uuid.UUID
    score: int
    total_questions: int
    duration_seconds: Optional[float] = None
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChapterResponse(BaseModel):
    id: uuid.UUID
    title: str
    content_markdown: Optional[str] = None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class TopicResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    chapters: List[ChapterResponse] = []

    model_config = ConfigDict(from_attributes=True)


class CourseResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    topics: List[TopicResponse] = []

    model_config = ConfigDict(from_attributes=True)
