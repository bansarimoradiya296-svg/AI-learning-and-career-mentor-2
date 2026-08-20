import uuid
from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict


class CodingProblemResponse(BaseModel):
    id: uuid.UUID
    title: str
    description_markdown: str
    difficulty: str
    starter_code: dict

    model_config = ConfigDict(from_attributes=True)


class CodingSubmissionRequest(BaseModel):
    code_content: str
    language: str # python, javascript, java, cpp, c, sql


class CodingSubmissionResponse(BaseModel):
    id: uuid.UUID
    problem_id: uuid.UUID
    language: str
    status: str # ACCEPTED, WRONG_ANSWER, RUNTIME_ERROR, COMPILE_ERROR
    execution_time: Optional[float] = None
    validation_results: Optional[dict] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CodingChatRequest(BaseModel):
    message: str
    history: List[Dict] = []


class CodingDebugRequest(BaseModel):
    code_or_error: str


class CodeExplainRequest(BaseModel):
    code: str
    language: str


class CodeConvertRequest(BaseModel):
    code: str
    from_language: str
    to_language: str


class CodingQuizRequest(BaseModel):
    topic: str
    difficulty: str
    num_questions: int


class CodingRoadmapRequest(BaseModel):
    goal: str

