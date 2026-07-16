import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User, Role, AuditLog, user_roles
from app.schemas.auth import UserResponse, AuditLogResponse
from app.security.permissions import get_current_user, RoleChecker

# Secure entire router to Admins/Super Admins
router = APIRouter(
    prefix="/admin",
    tags=["Administrative Portal"],
    dependencies=[Depends(RoleChecker(["Admin", "Super Admin"]))]
)


@router.get("/users", response_model=List[UserResponse])
async def list_all_users(
    db: AsyncSession = Depends(get_db)
):
    """Retrieves list of all registered users and their assigned roles."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    role_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Assigns a new security role to a user account."""
    user_res = await db.execute(
        select(User)
        .filter(User.id == user_id)
        .options(selectinload(User.roles))
    )
    user = user_res.scalars().first()
    if not user:
        raise NotFoundError("User not found")

    role_res = await db.execute(select(Role).filter(Role.name == role_name))
    role = role_res.scalars().first()
    if not role:
        raise BadRequestError(f"Role '{role_name}' does not exist in the system.")

    # Assign new role, replacing old ones
    user.roles = [role]
    db.add(user)
    await db.commit()

    return {"message": "User role updated successfully", "email": user.email, "role": role.name}


@router.get("/logs", response_model=List[AuditLogResponse])
async def get_system_audit_logs(
    limit: int = 100,
    skip: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Retrieves global audit trail logs tracking write executions."""
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/metrics")
async def get_global_metrics(
    db: AsyncSession = Depends(get_db)
):
    """Compiles global application indicators (Total users, files ingested, submissions made)."""
    # Count totals
    users_count = await db.scalar(select(func.count(User.id)))
    
    # Audit details
    logins_count = await db.scalar(select(func.count(AuditLog.id)).filter(AuditLog.action == "USER_LOGIN_ATTEMPT"))

    return {
        "total_registered_users": users_count,
        "total_system_logins_recorded": logins_count,
        "environment": "Production-Ready Stack"
    }
