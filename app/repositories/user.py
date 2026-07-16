from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import User, Role
from app.repositories.base import BaseRepository
from app.security.password import get_password_hash


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_email(self, email: str) -> Optional[User]:
        """Looks up a user record by email address."""
        result = await self.db.execute(
            select(User)
            .filter(User.email == email)
            .options(selectinload(User.roles).selectinload(Role.permissions))
        )
        return result.scalars().first()

    async def create_user(self, email: str, password_raw: str, first_name: Optional[str] = None, last_name: Optional[str] = None) -> User:
        """
        Creates a new user record with hashed password.
        Assigns the default role 'Student'. If this is the first user in the system, assigns 'Super Admin'.
        """
        # Encrypt password
        hashed_password = get_password_hash(password_raw)
        
        # Check if any users exist to determine default roles
        count_query = select(User)
        count_result = await self.db.execute(count_query)
        is_first_user = count_result.scalars().first() is None
        
        # Determine roles
        assigned_roles = []
        if is_first_user:
            # Look up Super Admin
            sa_role_query = select(Role).filter(Role.name == "Super Admin")
            sa_role_result = await self.db.execute(sa_role_query)
            sa_role = sa_role_result.scalars().first()
            if sa_role:
                assigned_roles.append(sa_role)
        else:
            # Look up Student role
            student_role_query = select(Role).filter(Role.name == "Student")
            student_role_result = await self.db.execute(student_role_query)
            student_role = student_role_result.scalars().first()
            if student_role:
                assigned_roles.append(student_role)

        db_user = User(
            email=email,
            password_hash=hashed_password,
            first_name=first_name,
            last_name=last_name,
            roles=assigned_roles,
            is_active=True,
            is_verified=False  # Verification token email is sent subsequently
        )
        
        self.db.add(db_user)
        await self.db.flush()
        return db_user
