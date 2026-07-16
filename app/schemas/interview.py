import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class InterviewSessionRequest(BaseModel):
    type: str # TECHNICAL, HR, BEHAVIORAL, CODING


class InterviewMessageResponse(BaseModel):
    id: uuid.UUID
    sender_role: str # INTERVIEWER, STUDENT
    text_content: str
    audio_path: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterviewReportResponse(BaseModel):
    id: uuid.UUID
    communication_score: float
    confidence_score: float
    technical_score: float
    overall_score: float
    evaluation_summary: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterviewSessionResponse(BaseModel):
    id: uuid.UUID
    type: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    messages: List[InterviewMessageResponse] = []
    report: Optional[InterviewReportResponse] = None

    model_config = ConfigDict(from_attributes=True)
