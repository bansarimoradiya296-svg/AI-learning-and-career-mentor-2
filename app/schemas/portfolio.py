import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PortfolioProjectRequest(BaseModel):
    title: str
    tech_stack: str
    description: str
    github_url: Optional[str] = None


class PortfolioProjectResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    tech_stack: str
    description: str
    github_url: Optional[str] = None
    score: float
    feedback: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
