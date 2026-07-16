import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.interview import InterviewSession, InterviewMessage, InterviewReport

genai.configure(api_key=settings.GEMINI_API_KEY)


class InterviewCoachService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(self, user_id: uuid.UUID, interview_type: str) -> InterviewSession:
        """Creates a new mock interview session."""
        session = InterviewSession(
            user_id=user_id,
            type=interview_type.upper(),
            status="ACTIVE",
            started_at=datetime.utcnow()
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def generate_first_question(self, session: InterviewSession) -> str:
        """
        Generates the opening greeting and first question based on interview type.
        """
        role_mapping = {
            "TECHNICAL": "Software Engineer (Backend)",
            "HR": "Human Resources Recruiter",
            "BEHAVIORAL": "Product Manager",
            "CODING": "Software Architect"
        }
        target_role = role_mapping.get(session.type, "Software Engineer")

        prompt = (
            f"You are an expert interviewer conducting a '{session.type}' mock interview for a '{target_role}' role.\n"
            f"Start the interview. Greet the candidate and ask the first question to begin.\n"
            f"Keep your response concise, conversational, and direct (max 3 sentences)."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            question = response.text.strip()
        except Exception:
            question = "Hello! Welcome to your mock interview today. To start off, could you tell me a bit about yourself and your background?"

        # Save message in session log
        msg = InterviewMessage(
            session_id=session.id,
            sender_role="INTERVIEWER",
            text_content=question
        )
        self.db.add(msg)
        await self.db.flush()
        return question

    async def process_response_and_ask_next(self, session: InterviewSession, student_response: str) -> str:
        """
        Logs the student's answer, fetches conversation history, and compiles the interviewer's next follow-up.
        """
        # Save student message
        student_msg = InterviewMessage(
            session_id=session.id,
            sender_role="STUDENT",
            text_content=student_response
        )
        self.db.add(student_msg)
        await self.db.flush()

        # Fetch history (ordered by time)
        result = await self.db.execute(
            select(InterviewMessage)
            .filter(InterviewMessage.session_id == session.id)
            .order_by(InterviewMessage.created_at)
        )
        messages = result.scalars().all()
        
        # Build prompt history
        dialogue = []
        for msg in messages:
            dialogue.append(f"{msg.sender_role}: {msg.text_content}")

        history_text = "\n".join(dialogue)

        prompt = (
            f"You are conducting a '{session.type}' mock interview. Below is the transcript of the conversation so far:\n"
            f"{history_text}\n\n"
            f"Evaluate the candidate's last answer and ask the next logical follow-up question. "
            f"Do not give explicit grading feedback yet. Remain in interviewer character.\n"
            f"Keep your question/response concise, conversational, and direct (max 4 sentences)."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            next_q = response.text.strip()
        except Exception:
            next_q = "Thank you. Let's move on. Can you explain a challenging project you worked on recently?"

        # Save interviewer response
        interviewer_msg = InterviewMessage(
            session_id=session.id,
            sender_role="INTERVIEWER",
            text_content=next_q
        )
        self.db.add(interviewer_msg)
        await self.db.flush()
        return next_q

    async def generate_evaluation_report(self, session_id: uuid.UUID) -> InterviewReport:
        """
        Closes the session, parses the complete dialogue history, and generates a structured report card using Gemini.
        """
        # Close session
        result = await self.db.execute(select(InterviewSession).filter(InterviewSession.id == session_id))
        session = result.scalars().first()
        if not session:
            raise Exception("Session not found")

        session.status = "COMPLETED"
        session.ended_at = datetime.utcnow()
        self.db.add(session)

        # Retrieve messages
        msg_result = await self.db.execute(
            select(InterviewMessage)
            .filter(InterviewMessage.session_id == session_id)
            .order_by(InterviewMessage.created_at)
        )
        messages = msg_result.scalars().all()

        dialogue = []
        for m in messages:
            dialogue.append(f"{m.sender_role}: {m.text_content}")
        history_text = "\n".join(dialogue)

        prompt = (
            f"You are a Senior Recruiter and Technical Assessment Specialist.\n"
            f"Examine the interview transcript below and rate the candidate.\n\n"
            f"Transcript:\n{history_text}\n\n"
            f"Respond ONLY with a JSON object in this format:\n"
            f'{{\n'
            f'  "technical_score": 82, // scale 1-100\n'
            f'  "communication_score": 75,\n'
            f'  "confidence_score": 80,\n'
            f'  "overall_score": 79,\n'
            f'  "evaluation_summary": {{\n'
            f'    "strengths": ["Strong architectural understanding"],\n'
            f'    "weaknesses": ["Needs clearer delivery on security features"],\n'
            f'    "suggestions": ["Practice articulating token lifetimes"]\n'
            f'  }}\n'
            f'}}\n'
            f"Do not wrap in Markdown blocks. Return raw JSON text only."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            grading = json.loads(raw_text)
        except Exception as e:
            print(f"Failed to generate grading report: {e}")
            grading = {
                "technical_score": 70,
                "communication_score": 70,
                "confidence_score": 70,
                "overall_score": 70,
                "evaluation_summary": {
                    "strengths": ["Completed mock run"],
                    "weaknesses": ["Analysis compilation failure"],
                    "suggestions": ["Try again or write longer responses"]
                }
            }

        report = InterviewReport(
            session_id=session_id,
            technical_score=grading["technical_score"],
            communication_score=grading["communication_score"],
            confidence_score=grading["confidence_score"],
            overall_score=grading["overall_score"],
            evaluation_summary=grading["evaluation_summary"]
        )
        self.db.add(report)
        await self.db.flush()
        return report
