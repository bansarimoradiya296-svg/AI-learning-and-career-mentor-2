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
