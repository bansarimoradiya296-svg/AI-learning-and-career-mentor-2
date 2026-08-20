import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class CareerGoalRequest(BaseModel):
    target_job_title: str
    current_skills: List[str]


class RecommendedProjectResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    skills_gained: List[str]
    repo_template_url: Optional[str] = None
    complexity: str

    model_config = ConfigDict(from_attributes=True)


class CertificationResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    exam_code: Optional[str] = None
    url: Optional[str] = None
    value_score: float

    model_config = ConfigDict(from_attributes=True)


class RoadmapResponse(BaseModel):
    id: uuid.UUID
    structure: dict # Complete timeline nodes
    completion_percentage: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CareerGoalResponse(BaseModel):
    id: uuid.UUID
    target_job_title: str
    current_skills: List[str]
    target_skills: List[str]
    job_readiness_score: float = 0.0
    roadmap_status: str
    roadmaps: List[RoadmapResponse] = []
    projects: List[RecommendedProjectResponse] = []
    certifications: List[CertificationResponse] = []

    model_config = ConfigDict(from_attributes=True)
