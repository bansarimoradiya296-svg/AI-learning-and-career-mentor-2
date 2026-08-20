import uuid
from typing import List
from fastapi import Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.exceptions import AuthError, ForbiddenError
from app.models.auth import User, Role
from app.security.auth_handler import decode_access_token

# Bearer token extractor
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Decodes the access token to identify the current user.
    """
    if not credentials:
        raise AuthError("Not authenticated")

    payload = decode_access_token(credentials.credentials)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AuthError("Invalid token payload")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AuthError("Invalid user ID format")

    result = await db.execute(
        select(User)
        .filter(User.id == user_id)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    )
    user = result.scalars().first()

    if not user:
        raise AuthError("User not found")

    if not user.is_active:
        raise AuthError("User account is disabled")

    return user


async def get_current_verified_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Verifies that the user has verified their email address."""
    if not current_user.is_verified:
        raise ForbiddenError("Email verification required to access this resource")
    return current_user


class RoleChecker:
    """
    Dependency generator for Role-Based Access Control (RBAC).
    Usage: Depends(RoleChecker(["Admin", "Teacher"]))
    """
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        user_role_names = [role.name for role in current_user.roles]
        # Super Admin bypasses all checks
        if "Super Admin" in user_role_names:
            return current_user
            
        if not any(role in user_role_names for role in self.allowed_roles):
            raise ForbiddenError(f"Operation requires roles: {self.allowed_roles}")
        return current_user


class PermissionChecker:
    """
    Dependency generator for Permission-Based Access Control.
    Usage: Depends(PermissionChecker("manage_documents"))
    """
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        # Extract user permissions from their roles
        user_permissions = []
        user_role_names = []
        for role in current_user.roles:
            user_role_names.append(role.name)
            for perm in role.permissions:
                user_permissions.append(perm.name)
                
        # Super Admin override
        if "Super Admin" in user_role_names:
            return current_user
            
        if self.required_permission not in user_permissions:
            raise ForbiddenError(f"Missing required permission: {self.required_permission}")
        return current_user
