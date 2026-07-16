import json
import uuid
from typing import Dict, List, Optional
import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.models.career import CareerGoal, Roadmap, RecommendedProject, Certification
from app.services.ai_companion import AICompanionService

genai.configure(api_key=settings.GEMINI_API_KEY)


class CareerMentorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_resume_and_set_goal(self, file_path: str, file_type: str, target_job_title: str, user_id: uuid.UUID) -> CareerGoal:
        """
        Parses resume, extracts skills, analyzes gaps against target job role using Gemini,
        and saves recommendations (projects, certifications, roadmap outline) in the database.
        """
        # Parse resume text
        companion = AICompanionService(self.db)
        resume_text = companion.extract_text_from_file(file_path, file_type)
        
        prompt = (
            f"You are an expert AI Career Mentor and Recruiter.\n"
            f"Analyze the candidate's resume below in relation to the target job: '{target_job_title}'.\n\n"
            f"Resume Text:\n{resume_text[:12000]}\n\n"
            f"Respond ONLY with a JSON object in this format:\n"
            f'{{\n'
            f'  "current_skills": ["Python", "Git"],\n'
            f'  "target_skills": ["FastAPI", "Docker", "AsyncIO"],\n'
            f'  "job_readiness_score": 65, // percentage scale 1-100\n'
            f'  "salary_prediction_range": "$80,000 - $95,000",\n'
            f'  "certifications": [\n'
            f'    {{"name": "AWS Certified Developer", "provider": "Amazon", "exam_code": "DVA-C02", "url": "https://aws.amazon.com", "value_score": 8.5}}\n'
            f'  ],\n'
            f'  "projects": [\n'
            f'    {{"title": "Real-time Chat with WebSockets", "description": "Implement async WebSockets using FastAPI", "skills_gained": ["FastAPI", "WebSockets"], "complexity": "MEDIUM"}}\n'
            f'  ]\n'
            f'}}\n'
            f"Do not format with Markdown tags. Output clean raw JSON text only."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            analysis = json.loads(raw_text)
            
            # Save Career Goal profile
            goal = CareerGoal(
                user_id=user_id,
                target_job_title=target_job_title,
                current_skills=analysis.get("current_skills", []),
                target_skills=analysis.get("target_skills", []),
                roadmap_status="READY"
            )
            self.db.add(goal)
            await self.db.flush()

            # Save recommended projects
            for proj_data in analysis.get("projects", []):
                project = RecommendedProject(
                    career_goal_id=goal.id,
                    title=proj_data["title"],
                    description=proj_data["description"],
                    skills_gained=proj_data.get("skills_gained", []),
                    complexity=proj_data.get("complexity", "MEDIUM")
                )
                self.db.add(project)

            # Save recommended certifications
            for cert_data in analysis.get("certifications", []):
                cert = Certification(
                    career_goal_id=goal.id,
                    name=cert_data["name"],
                    provider=cert_data["provider"],
                    exam_code=cert_data.get("exam_code"),
                    url=cert_data.get("url"),
                    value_score=cert_data.get("value_score", 5.0)
                )
                self.db.add(cert)

            # Automatically trigger roadmap generation
            await self.generate_roadmap(goal)
            
            await self.db.flush()
            return goal
            
        except Exception as e:
            # Clean fallback if LLM parser failed
            print(f"Resume analysis failure: {e}")
            goal = CareerGoal(
                user_id=user_id,
                target_job_title=target_job_title,
                current_skills=["Basic tech stack"],
                target_skills=["FastAPI", "PostgreSQL", "Docker"],
                roadmap_status="READY"
            )
            self.db.add(goal)
            await self.db.flush()
            
            # Seed default project
            project = RecommendedProject(
                career_goal_id=goal.id,
                title="AI Platform Backend Integration",
                description="Build clean API routes with FastAPI using ORM connection parameters.",
                skills_gained=["FastAPI", "SQLAlchemy"],
                complexity="MEDIUM"
            )
            self.db.add(project)
            await self.generate_roadmap(goal)
            return goal

    async def generate_roadmap(self, goal: CareerGoal) -> Roadmap:
        """
        Compiles a targeted timeline Roadmap using Gemini.
        """
        prompt = (
            f"You are a Career Architect.\n"
            f"Generate a customized learning roadmap to help a candidate move from their current skills "
            f"({goal.current_skills}) to the target position: '{goal.target_job_title}' gaining target skills ({goal.target_skills}).\n\n"
            f"Provide a structured path with 3 major milestone phases.\n"
            f"Respond ONLY with a JSON object in this format:\n"
            f'{{\n'
            f'  "phases": [\n'
            f'    {{\n'
            f'      "phase_num": 1,\n'
            f'      "title": "Phase Title",\n'
            f'      "milestones": ["Milestone A", "Milestone B"],\n'
            f'      "estimated_weeks": 4\n'
            f'    }}\n'
            f'  ]\n'
            f'}}\n'
            f"Do not include Markdown blocks. Output raw JSON."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            roadmap_structure = json.loads(raw_text)
        except Exception as e:
            print(f"Roadmap generator exception: {e}")
            # Mock structure on failure
            roadmap_structure = {
                "phases": [
                    {"phase_num": 1, "title": "Core Prerequisites", "milestones": ["Build basic familiarity", "Configure local environments"], "estimated_weeks": 2},
                    {"phase_num": 2, "title": "Framework Integration", "milestones": ["Adopt async standards", "Manage databases"], "estimated_weeks": 4},
                    {"phase_num": 3, "title": "Production Deployment", "milestones": ["Set up Docker containers", "Configure reverse proxies"], "estimated_weeks": 2}
                ]
            }

        roadmap = Roadmap(
            career_goal_id=goal.id,
            structure=roadmap_structure,
            completion_percentage=0.0
        )
        self.db.add(roadmap)
        await self.db.flush()
        return roadmap
