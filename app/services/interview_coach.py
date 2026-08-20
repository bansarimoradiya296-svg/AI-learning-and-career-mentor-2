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

    async def generate_first_question(self, session: InterviewSession, difficulty: str = "MEDIUM", language: str = "ENGLISH") -> str:
        """
        Generates the opening greeting and first question based on interview type, difficulty, and language.
        """
        role_mapping = {
            "TECHNICAL": "Software Engineer (Backend)",
            "HR": "Human Resources Recruiter",
            "BEHAVIORAL": "Product Manager",
            "CODING": "Software Architect"
        }
        target_role = role_mapping.get(session.type, "Software Engineer")

        prompt = (
            f"You are conducting a '{session.type}' mock interview for a candidate seeking a '{target_role}' role.\n"
            f"Set the interview difficulty strictly to '{difficulty}' level.\n"
            f"You MUST conduct the interview and ask all questions entirely in the '{language}' language.\n"
            f"Start the interview now. Greet the candidate in '{language}', and ask the first question to begin.\n"
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

    async def process_response_and_ask_next(self, session: InterviewSession, student_response: str, difficulty: str = "MEDIUM", language: str = "ENGLISH") -> str:
        """
        Logs the student's answer, fetches conversation history, and compiles the interviewer's next follow-up tailored to difficulty and language.
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
            f"The interview difficulty is '{difficulty}' level, and you MUST speak and ask questions only in the '{language}' language.\n"
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
            f"Respond ONLY with a valid JSON object in this format:\n"
            f'{{\n'
            f'  "technical_score": 82,\n'
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
            
            # Remove any single-line comments in case Gemini still inserts them
            import re
            raw_text_clean = re.sub(r'//.*$', '', raw_text, flags=re.MULTILINE)
            
            grading = json.loads(raw_text_clean)
            
            # Ensure required keys exist and are of correct type
            required_keys = ["technical_score", "communication_score", "confidence_score", "overall_score"]
            for k in required_keys:
                if k not in grading:
                    grading[k] = 70.0
                else:
                    try:
                        grading[k] = float(grading[k])
                    except (ValueError, TypeError):
                        grading[k] = 70.0
            
            if "evaluation_summary" not in grading or not isinstance(grading["evaluation_summary"], dict):
                grading["evaluation_summary"] = {}
                
            summary = grading["evaluation_summary"]
            for subkey in ["strengths", "weaknesses", "suggestions"]:
                if subkey not in summary or not isinstance(summary[subkey], list):
                    summary[subkey] = []
                    
        except Exception as e:
            print(f"Failed to generate grading report: {e}")
            grading = {
                "technical_score": 70.0,
                "communication_score": 70.0,
                "confidence_score": 70.0,
                "overall_score": 70.0,
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

    async def evaluate_portfolio_project(self, title: str, tech_stack: str, description: str) -> Tuple[float, dict]:
        """
        Uses Gemini to assess the portfolio project's mock-interview preparation depth,
        generating likely questions, STAR talking points, and architectural recommendations.
        """
        from typing import Tuple
        prompt = (
            f"You are a Principal Software Architect and Senior Technical Interviewer.\n"
            f"Evaluate the candidate's portfolio project based on the details below:\n"
            f"Project Title: {title}\n"
            f"Tech Stack: {tech_stack}\n"
            f"Description: {description}\n\n"
            f"Generate a mock interview preparation guide for this project.\n"
            f"Provide the assessment in JSON format with the following keys:\n"
            f'  "score": a number from 0 to 100 representing the project\'s strength and depth for a professional portfolio,\n'
            f'  "key_questions": an array of 3-5 technical questions an interviewer is highly likely to ask about this project,\n'
            f'  "star_points": an array of key achievements/architecture points the candidate should highlight using the STAR method (Situation, Task, Action, Result),\n'
            f'  "improvements": an array of actionable suggestions/features the candidate can add to make this project look more professional (e.g. CI/CD, caching, indexing, dockerization).\n\n'
            f"Return raw JSON text only. Do not include markdown formatting or comments."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            
            import re
            raw_text_clean = re.sub(r'//.*$', '', raw_text, flags=re.MULTILINE)
            
            result = json.loads(raw_text_clean)
            score = float(result.get("score", 70.0))
            feedback = {
                "key_questions": result.get("key_questions", []),
                "star_points": result.get("star_points", []),
                "improvements": result.get("improvements", [])
            }
        except Exception as e:
            print(f"Failed to generate portfolio project evaluation: {e}")
            score = 70.0
            feedback = {
                "key_questions": [
                    f"Can you walk us through the system architecture of {title}?",
                    "What was the most challenging technical roadblock you hit while building this?"
                ],
                "star_points": [
                    f"Initiated {title} to explore integrating modern tools like {tech_stack}.",
                    "Structured logic components cleanly for maintainability and modular deployment."
                ],
                "improvements": [
                    "Add comprehensive unit testing suite using pytest.",
                    "Document installation, API endpoints, and configuration options in a clean README."
                ]
            }

        return score, feedback

