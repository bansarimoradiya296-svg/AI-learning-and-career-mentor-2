import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import ForeignKey, String, Text, DateTime, Float, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CareerGoal(Base):
    __tablename__ = "career_goals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    current_skills: Mapped[dict] = mapped_column(JSON, default=list) # e.g. ["Python", "HTML"]
    target_skills: Mapped[dict] = mapped_column(JSON, default=list) # e.g. ["FastAPI", "Docker", "ChromaDB"]
    roadmap_status: Mapped[str] = mapped_column(String(50), default="NOT_STARTED") # NOT_STARTED, GENERATING, READY, ARCHIVED

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="career_goals")
    roadmaps: Mapped[List["Roadmap"]] = relationship("Roadmap", back_populates="career_goal", cascade="all, delete-orphan")
    projects: Mapped[List["RecommendedProject"]] = relationship("RecommendedProject", back_populates="career_goal", cascade="all, delete-orphan")
    certifications: Mapped[List["Certification"]] = relationship("Certification", back_populates="career_goal", cascade="all, delete-orphan")


class Roadmap(Base):
    __tablename__ = "roadmaps"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    career_goal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("career_goals.id", ondelete="CASCADE"), nullable=False)
    
    # Structure holds a JSON graph/tree of milestones
    # E.g., [{"id": 1, "title": "Learn FastAPI Basics", "status": "IN_PROGRESS", "chapters": [...]}]
    structure: Mapped[dict] = mapped_column(JSON, nullable=False)
    completion_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    career_goal: Mapped[CareerGoal] = relationship("CareerGoal", back_populates="roadmaps")


class RecommendedProject(Base):
    __tablename__ = "recommended_projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    career_goal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("career_goals.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    skills_gained: Mapped[dict] = mapped_column(JSON, default=list)
    repo_template_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    complexity: Mapped[str] = mapped_column(String(50), default="MEDIUM") # BEGINNER, MEDIUM, ADVANCED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    career_goal: Mapped[CareerGoal] = relationship("CareerGoal", back_populates="projects")


class Certification(Base):
    __tablename__ = "certifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    career_goal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("career_goals.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. AWS, Microsoft, Cisco
    exam_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    value_score: Mapped[float] = mapped_column(Float, default=5.0) # Scale of 1 to 10 based on market value

    # Relationships
    career_goal: Mapped[CareerGoal] = relationship("CareerGoal", back_populates="certifications")
