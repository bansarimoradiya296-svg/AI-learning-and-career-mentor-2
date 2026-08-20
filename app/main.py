from contextlib import asynccontextmanager
import mimetypes
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")

from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import Base
from app.core import database
from app.core.exceptions import register_exception_handlers
from app.api.router import api_router
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.audit_logger import AuditLoggerMiddleware
from app.models.auth import Role, Permission, User, UserSession, LoginHistory, AuditLog
from app.models.study import Document, Flashcard, Course, Topic, Chapter, Quiz, Question, QuizResult
from app.models.coding import CodingProblem, CodingSubmission
from app.models.career import CareerGoal, Roadmap, RecommendedProject, Certification
from app.models.interview import InterviewSession, InterviewMessage, InterviewReport
from app.models.billing import Subscription, Payment, Badge, UserAchievement

# Setup roles and permissions list for database seeding
SEED_PERMISSIONS = [
    {"name": "manage_users", "description": "Allows administrator to edit users and roles"},
    {"name": "manage_documents", "description": "Allows teachers/students to upload and process study documents"},
    {"name": "manage_courses", "description": "Allows teachers to manage courses, topics and chapters"},
    {"name": "take_quizzes", "description": "Allows students to run and save quiz attempts"},
    {"name": "submit_code", "description": "Allows students to run and submit code challenges"},
    {"name": "request_mock_interviews", "description": "Allows students to run technical/HR interviews"},
    {"name": "manage_skills", "description": "Allows mentors to edit technology skills and roadmaps"},
    {"name": "view_analytics", "description": "Allows accessing admin and mentor reports"}
]

SEED_ROLES = {
    "Super Admin": ["manage_users", "manage_documents", "manage_courses", "take_quizzes", "submit_code", "request_mock_interviews", "manage_skills", "view_analytics"],
    "Admin": ["manage_users", "manage_documents", "manage_courses", "take_quizzes", "submit_code", "request_mock_interviews", "manage_skills", "view_analytics"],
    "Teacher": ["manage_documents", "manage_courses", "view_analytics"],
    "Student": ["manage_documents", "take_quizzes", "submit_code", "request_mock_interviews"],
    "Career Mentor": ["manage_skills", "view_analytics"],
    "Recruiter": ["view_analytics"],
    "Guest": []
}


async def seed_database():
    """Seeds the database with default roles, permissions, and junction mappings."""
    async with database.AsyncSessionLocal() as session:
        # Check if permissions exist
        result = await session.execute(select(Permission))
        db_permissions = result.scalars().all()
        
        permission_map = {p.name: p for p in db_permissions}
        
        # Insert missing permissions
        for perm_data in SEED_PERMISSIONS:
            if perm_data["name"] not in permission_map:
                perm = Permission(name=perm_data["name"], description=perm_data["description"])
                session.add(perm)
                permission_map[perm_data["name"]] = perm
                
        await session.flush()
        
        # Check if roles exist
        result = await session.execute(select(Role))
        db_roles = result.scalars().all()
        role_names = {r.name for r in db_roles}
        
        # Insert missing roles and bind permissions
        for role_name, perm_list in SEED_ROLES.items():
            if role_name not in role_names:
                role = Role(name=role_name, description=f"Default {role_name} system role")
                session.add(role)
                
                # Bind permissions
                role.permissions = [permission_map[pname] for pname in perm_list if pname in permission_map]
                
        await session.flush()

        # Seed Coding Problems if empty
        result = await session.execute(select(CodingProblem))
        db_problems = result.scalars().first()
        if not db_problems:
            two_sum = CodingProblem(
                title="Two Sum",
                difficulty="EASY",
                description_markdown=(
                    "Given an array of integers `nums` and an integer `target`, return indices of the two numbers "
                    "such that they add up to `target`.\n\n"
                    "You may assume that each input would have exactly one solution, and you may not use the same element twice."
                ),
                test_cases=[
                    {"input": "2,7,11,15\n9", "expected": "[0, 1]"},
                    {"input": "3,2,4\n6", "expected": "[1, 2]"}
                ],
                starter_code={
                    "python": "def solve(nums_and_target):\n    # Split inputs by newline\n    parts = nums_and_target.split('\\n')\n    nums = [int(x) for x in parts[0].split(',')]\n    target = int(parts[1])\n    \n    # Implement your logic here\n    for i in range(len(nums)):\n        for j in range(i+1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []",
                    "javascript": "function solve(nums_and_target) {\n  // Write JS logic here\n}"
                }
            )
            session.add(two_sum)
            
        await session.commit()
        print("Database roles, permissions, and default coding challenges seeding completed.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    # Auto create tables if running in development (fallback if migration is skipped)
    from app.core import database
    try:
        async with database.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as db_err:
        print(f"Database connection/initialization failed: {db_err}")
        print("Please ensure your PostgreSQL server is running and database configuration is correct.")
        raise db_err

    await seed_database()
    yield
    # Shutdown actions
    pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Enterprise AI Education & Career Mentor API Services",
    version="1.0.0",
    lifespan=lifespan
)

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Rate Limiting Middleware
app.add_middleware(RateLimitMiddleware)

# 3. Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# 4. Audit Logger Middleware
app.add_middleware(AuditLoggerMiddleware)

# Register Custom Error Responses
register_exception_handlers(app)

# Include v1 Core API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"], status_code=status.HTTP_200_OK)
async def health_check():
    """Verifies that the application server is responsive."""
    return {"status": "healthy", "service": settings.PROJECT_NAME}


# Mount static assets directory for UI rendering
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", include_in_schema=False)
async def serve_index():
    """Serves the Single Page Application index file."""
    return FileResponse("app/static/templates/index.html")
