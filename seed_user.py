import asyncio
# Import all models to register them in SQLAlchemy registry
from app.models.auth import Role, Permission, User, UserSession, LoginHistory, AuditLog
from app.models.study import Document, Flashcard, Course, Topic, Chapter, Quiz, Question, QuizResult
from app.models.coding import CodingProblem, CodingSubmission
from app.models.career import CareerGoal, Roadmap, RecommendedProject, Certification
from app.models.interview import InterviewSession, InterviewMessage, InterviewReport
from app.models.billing import Subscription, Payment, Badge, UserAchievement

from app.core import database
from app.security.password import get_password_hash
from sqlalchemy import select

async def seed():
    async with database.AsyncSessionLocal() as session:
        # Check if user already exists
        result = await session.execute(select(User).filter(User.email == "test_user@aimentor.com"))
        user = result.scalars().first()
        if user:
            print("User test_user@aimentor.com already exists!")
            # Make sure it's verified and active
            user.is_verified = True
            user.is_active = True
            await session.commit()
            print("User updated to verified and active.")
            return

        # Get all roles to assign
        roles_result = await session.execute(select(Role))
        roles = roles_result.scalars().all()
        
        hashed_password = get_password_hash("Password123!") # Strong password
        new_user = User(
            email="test_user@aimentor.com",
            password_hash=hashed_password,
            first_name="Bansari",
            last_name="Moradiya",
            is_active=True,
            is_verified=True,
            roles=roles # Assign all default roles
        )
        session.add(new_user)
        await session.commit()
        print("Created test_user@aimentor.com (Password123!) as verified user with all roles successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
