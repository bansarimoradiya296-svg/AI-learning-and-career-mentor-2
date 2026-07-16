import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import ForeignKey, String, Text, DateTime, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="TECHNICAL") # TECHNICAL, HR, BEHAVIORAL, CODING
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE") # ACTIVE, COMPLETED
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="interview_sessions")
    messages: Mapped[List["InterviewMessage"]] = relationship(
        "InterviewMessage", back_populates="session", cascade="all, delete-orphan", order_by="InterviewMessage.created_at"
    )
    report: Mapped[Optional["InterviewReport"]] = relationship(
        "InterviewReport", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)
    sender_role: Mapped[str] = mapped_column(String(50), nullable=False) # INTERVIEWER, STUDENT
    text_content: Mapped[str] = mapped_column(Text, nullable=False)
    audio_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True) # If student speaks response
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    session: Mapped[InterviewSession] = relationship("InterviewSession", back_populates="messages")


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)
    communication_score: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    technical_score: Mapped[float] = mapped_column(Float, default=0.0)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    evaluation_summary: Mapped[dict] = mapped_column(JSON, nullable=False) # Structure detailing improvements, strengths, weak points
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    session: Mapped[InterviewSession] = relationship("InterviewSession", back_populates="report")
