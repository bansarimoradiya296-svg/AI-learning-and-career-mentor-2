import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, Text, DateTime, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CodingProblem(Base):
    __tablename__ = "coding_problems"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(50), nullable=False) # EASY, MEDIUM, HARD
    test_cases: Mapped[dict] = mapped_column(JSON, nullable=False) # e.g. [{"input": "5", "expected": "120"}]
    starter_code: Mapped[dict] = mapped_column(JSON, nullable=False) # e.g. {"python": "def solve(n):\n    pass"}

    # Relationships
    submissions: Mapped[list["CodingSubmission"]] = relationship(
        "CodingSubmission", back_populates="problem", cascade="all, delete-orphan"
    )


class CodingSubmission(Base):
    __tablename__ = "coding_submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    problem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coding_problems.id", ondelete="CASCADE"), nullable=False)
    code_content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(50), nullable=False) # python, javascript, java, cpp, c, sql
    status: Mapped[str] = mapped_column(String(50), nullable=False) # ACCEPTED, WRONG_ANSWER, RUNTIME_ERROR, COMPILE_ERROR, PENDING
    execution_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    validation_results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # logs/outputs
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="coding_submissions")
    problem: Mapped[CodingProblem] = relationship("CodingProblem", back_populates="submissions")
