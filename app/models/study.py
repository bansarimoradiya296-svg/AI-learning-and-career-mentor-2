import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import ForeignKey, String, Integer, Boolean, DateTime, Text, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g., pdf, docx, pptx, txt
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding_status: Mapped[str] = mapped_column(String(50), default="PENDING") # PENDING, PROCESSING, SUCCESS, FAILED
    short_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detailed_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exam_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    document_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_scanned: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="documents")
    flashcards: Mapped[List["Flashcard"]] = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    deck_id: Mapped[Optional[uuid.UUID]] = mapped_column(String(36), nullable=True)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    hint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    card_type: Mapped[str] = mapped_column(String(100), default="CONCEPT")
    difficulty: Mapped[str] = mapped_column(String(50), default="MEDIUM")
    topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    concept: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="DOCUMENT")
    memory_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="NEW")
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # SuperMemo SM-2 spaced repetition variables
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="flashcards")
    document: Mapped[Optional[Document]] = relationship("Document", back_populates="flashcards")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    topics: Mapped[List["Topic"]] = relationship("Topic", back_populates="course", cascade="all, delete-orphan")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    course: Mapped[Course] = relationship("Course", back_populates="topics")
    chapters: Mapped[List["Chapter"]] = relationship("Chapter", back_populates="topic", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    topic: Mapped[Topic] = relationship("Topic", back_populates="chapters")
    quizzes: Mapped[List["Quiz"]] = relationship("Quiz", back_populates="chapter", cascade="all, delete-orphan")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(50), default="MEDIUM") # EASY, MEDIUM, HARD
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    chapter: Mapped[Optional[Chapter]] = relationship("Chapter", back_populates="quizzes")
    questions: Mapped[List["Question"]] = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    results: Mapped[List["QuizResult"]] = relationship("QuizResult", back_populates="quiz", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict] = mapped_column(JSON, nullable=False) # JSON list of choices, e.g., ["A", "B", "C", "D"]
    correct_option: Mapped[str] = mapped_column(String(10), nullable=False) # Index or string matching the correct choice
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    quiz: Mapped[Quiz] = relationship("Quiz", back_populates="questions")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="quiz_results")
    quiz: Mapped[Quiz] = relationship("Quiz", back_populates="results")


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    target_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    plan_duration: Mapped[str] = mapped_column(String(50), default="1 Week") 
    daily_hours: Mapped[float] = mapped_column(Float, default=2.0)
    start_time: Mapped[str] = mapped_column(String(50), default="06:00 AM")
    end_time: Mapped[str] = mapped_column(String(50), default="10:00 PM")
    study_goal: Mapped[str] = mapped_column(String(255), default="Master Subject")
    break_preference: Mapped[str] = mapped_column(String(255), default="15 min break after 1 hour")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    summary_stats: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    credits: Mapped[Optional[int]] = mapped_column(Integer, default=4)
    exam_pattern: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    internal_marks: Mapped[Optional[int]] = mapped_column(Integer, default=30)
    external_marks: Mapped[Optional[int]] = mapped_column(Integer, default=70)
    learning_outcomes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    recommended_books: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    references: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    estimated_total_topics: Mapped[Optional[int]] = mapped_column(Integer, default=35)

    # Relationships
    user: Mapped["User"] = relationship("User")
    items: Mapped[List["StudyPlanItem"]] = relationship("StudyPlanItem", back_populates="plan", cascade="all, delete-orphan")


class StudyPlanItem(Base):
    __tablename__ = "study_plan_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date_str: Mapped[str] = mapped_column(String(100), nullable=False) 
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    subtopics: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_time: Mapped[str] = mapped_column(String(50), nullable=False) 
    end_time: Mapped[str] = mapped_column(String(50), nullable=False) 
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    priority: Mapped[str] = mapped_column(String(50), default="Medium") 
    knowledge_level: Mapped[str] = mapped_column(String(50), default="Not Known") 
    ai_suggested_time: Mapped[str] = mapped_column(String(50), default="1h 30m")
    your_time: Mapped[str] = mapped_column(String(50), default="1h 30m")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_break: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    objective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_outcome: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    session_type: Mapped[Optional[str]] = mapped_column(String(50), default="Learning")
    practice_duration: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    revision_duration: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    quiz_duration: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    importance: Mapped[Optional[int]] = mapped_column(Integer, default=50)
    weightage: Mapped[Optional[str]] = mapped_column(String(50), default="Medium")
    hands_on: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    coding_required: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)

    # Relationships
    plan: Mapped[StudyPlan] = relationship("StudyPlan", back_populates="items")


class MindMap(Base):
    __tablename__ = "mind_maps"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), default="TOPIC") # TOPIC, TEXT, FILE, NOTE
    source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nodes_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    layout_type: Mapped[str] = mapped_column(String(50), default="tree")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User")


class PlannerProfile(Base):
    """Stores per-user study planner configuration: daily hours, preferences, and subjects with performance data."""
    __tablename__ = "planner_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    daily_hours: Mapped[float] = mapped_column(Float, default=2.0)
    preferred_study_time: Mapped[str] = mapped_column(String(50), default="Evening")  # Morning, Afternoon, Evening, Night
    study_goal: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    subjects: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # [{name, marks, weak_topics[], strong_topics[], exam_date, priority}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User")


class PlannerActivity(Base):
    """Individual scheduled study activity for the smart calendar."""
    __tablename__ = "planner_activities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    calendar_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)  # HH:MM
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)  # HH:MM
    planned_duration_min: Mapped[int] = mapped_column(Integer, default=60)
    actual_duration_min: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[str] = mapped_column(String(20), default="Medium")  # High, Medium, Low
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, completed, missed, rescheduled
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)  # True after "Set This Plan"
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User")


class PlannerGoal(Base):
    """Student learning goals with progress tracking."""
    __tablename__ = "planner_goals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0 to 100.0
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User")


class PlannerStreak(Base):
    """Tracks consecutive study days, total study time, and Pomodoro sessions."""
    __tablename__ = "planner_streaks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    total_study_minutes: Mapped[int] = mapped_column(Integer, default=0)
    total_pomodoro_sessions: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User")

