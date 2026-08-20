import uuid
from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    file_type: str
    size_bytes: int
    embedding_status: str
    short_summary: Optional[str] = None
    detailed_summary: Optional[str] = None
    exam_notes: Optional[str] = None
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


# Planner Schemas
class TopicInput(BaseModel):
    title: str
    subtopics: List[str] = []


class PreferencesInput(BaseModel):
    daily_hours: float = 2.0
    study_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    preferred_time_of_day: str = "Evening"
    weekly_availability: Optional[dict] = None


class StudyPlanCreateRequest(BaseModel):
    title: str
    topics: List[TopicInput]
    preferences: PreferencesInput
    target_date: Optional[str] = None


class StudyPlanItemResponse(BaseModel):
    id: uuid.UUID
    day_number: int
    topic: str
    subtopic: Optional[str] = None
    task_description: str
    duration_minutes: int
    completed: bool
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    your_time: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StudyPlanResponse(BaseModel):
    id: uuid.UUID
    title: str
    is_active: bool
    created_at: datetime
    items: List[StudyPlanItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class StudyPlanItemUpdate(BaseModel):
    completed: Optional[bool] = None
    your_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class AdaptPlanRequest(BaseModel):
    completed_item_ids: List[uuid.UUID] = []
    missed_item_ids: List[uuid.UUID] = []


class MindMapGenerateRequest(BaseModel):
    source_type: str = "TOPIC" # TOPIC, TEXT, FILE, NOTE
    topic: Optional[str] = None
    text: Optional[str] = None
    document_id: Optional[Any] = None


class MindMapExpandRequest(BaseModel):
    concept_name: str
    parent_context: Optional[str] = None


class MindMapExplainRequest(BaseModel):
    concept_name: str
    mode: str = "Simple Explanation" # Simple Explanation, Detailed Explanation, Exam Explanation, Real-World Example, Technical Explanation
    context: Optional[str] = None


class MindMapSaveRequest(BaseModel):
    id: Optional[uuid.UUID] = None
    title: str
    source_type: str = "TOPIC"
    source_id: Optional[str] = None
    nodes_data: dict
    layout_type: str = "tree"


class MindMapResponse(BaseModel):
    id: uuid.UUID
    title: str
    source_type: str
    source_id: Optional[str] = None
    nodes_data: dict
    layout_type: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

