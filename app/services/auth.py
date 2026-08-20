import random
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import AuthError, BadRequestError
from app.models.auth import User, Role, UserSession, LoginHistory
from app.repositories.user import UserRepository
from app.security.auth_handler import create_access_token, generate_secure_refresh_token
from app.security.password import verify_password

# In-memory dictionary for lockouts (tracks failed attempts and expiration time)
# format: {email: (count, lockout_end_timestamp)}
lockouts: Dict[str, Tuple[int, datetime]] = {}


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    async def register_user(self, email: str, password_raw: str, first_name: Optional[str] = None, last_name: Optional[str] = None) -> User:
        """Registers a new user and generates an OTP verification code."""
        # Check if email is already taken
        existing_user = await self.user_repo.get_by_email(email)
        if existing_user:
            raise BadRequestError("Email address is already registered")

        # Generate a 6-digit OTP verification code
        otp_code = f"{random.randint(100000, 999999)}"
        
        # Create user
        user = await self.user_repo.create_user(email, password_raw, first_name, last_name)
        user.verification_code = otp_code
        user.is_verified = True
        await self.db.commit()
        
        # Mock Email send: Log to console in dev mode
        print(f"==========================================")
        print(f"EMAIL SIMULATION (OTP CODE Verification)")
        print(f"TO: {email}")
        print(f"CODE: {otp_code}")
        print(f"==========================================")
        
        return user

    async def verify_otp(self, email: str, otp_code: str) -> User:
        """Verifies email registration OTP and activates user verification state."""
        user = await self.user_repo.get_by_email(email)
        if not user:
            raise BadRequestError("Email address not found")
            
        if user.is_verified:
            raise BadRequestError("Account is already verified")
            
        if user.verification_code != otp_code:
            raise BadRequestError("Invalid verification code")
            
        user.is_verified = True
        user.verification_code = None
        self.db.add(user)
        await self.db.flush()
        return user

    async def authenticate_user(
        self, email: str, password_raw: str, device_id: str, user_agent: Optional[str], ip_address: Optional[str]
    ) -> Tuple[str, str, User]:
        """
        Authenticates a user, tracks login history, updates active sessions, and handles brute force protection.
        """
        now = datetime.utcnow()
        # Brute force check: Look up lockout counter in memory
        if email in lockouts:
            count, lockout_end = lockouts[email]
            if count >= 5 and now < lockout_end:
                # Register brute force log in history
                user = await self.user_repo.get_by_email(email)
                if user:
                    history_entry = LoginHistory(
                        user_id=user.id,
                        user_agent=user_agent,
                        ip_address=ip_address or "unknown",
                        status="FAILED_BRUTE_FORCE"
                    )
                    self.db.add(history_entry)
                    await self.db.commit()
                raise AuthError("Account locked due to too many failed attempts. Try again in 30 minutes.")
            elif count >= 5 and now >= lockout_end:
                # Lock expired, reset
                lockouts.pop(email, None)

        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password_raw, user.password_hash):
            # Increment failed attempts count
            if email not in lockouts:
                lockouts[email] = (1, now + timedelta(minutes=30))
            else:
                count, lockout_end = lockouts[email]
                lockouts[email] = (count + 1, now + timedelta(minutes=30))
                
            if user:
                history_entry = LoginHistory(
                    user_id=user.id,
                    ip_address=ip_address or "unknown",
                    user_agent=user_agent,
                    status="INVALID_PASSWORD"
                )
                self.db.add(history_entry)
                await self.db.flush()
                
            raise AuthError("Invalid email address or password")

        # Login Success: clear lockout counter
        lockouts.pop(email, None)

        # Generate tokens
        role_names = [role.name for role in user.roles]
        permission_names = []
        for role in user.roles:
            permission_names.extend([perm.name for perm in role.permissions])
            
        access_token = create_access_token(user.id, role_names, permission_names)
        refresh_token = generate_secure_refresh_token()
        
        # Save session in database
        session_expires = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        session_entry = UserSession(
            user_id=user.id,
            device_id=device_id,
            user_agent=user_agent,
            ip_address=ip_address,
            refresh_token=refresh_token,
            expires_at=session_expires
        )
        self.db.add(session_entry)

        # Log login history
        history_entry = LoginHistory(
            user_id=user.id,
            ip_address=ip_address or "unknown",
            user_agent=user_agent,
            status="SUCCESS"
        )
        self.db.add(history_entry)
        await self.db.flush()

        return access_token, refresh_token, user

    async def rotate_refresh_token(
        self, old_refresh_token: str, device_id: str, user_agent: Optional[str], ip_address: Optional[str]
    ) -> Tuple[str, str, User]:
        """
        Implements Refresh Token Rotation (RTR).
        Swaps the old refresh token with a new one. Detects reuse/replay attacks.
        """
        # Look up token session in database
        result = await self.db.execute(
            select(UserSession)
            .filter(UserSession.refresh_token == old_refresh_token)
            .options(selectinload(UserSession.user).selectinload(User.roles).selectinload(Role.permissions))
        )
        session = result.scalars().first()

        if not session or session.is_blacklisted or session.expires_at < datetime.utcnow():
            # If session is invalid or already rotated, flag a potential theft/replay attack
            if session:
                # Security Override: Delete ALL active sessions for this user to force re-login on all devices
                user_id = session.user_id
                # Delete all sessions for the user from database
                delete_stmt = select(UserSession).filter(UserSession.user_id == user_id)
                del_result = await self.db.execute(delete_stmt)
                for s in del_result.scalars().all():
                    await self.db.delete(s)
                # Mark current session as blacklisted
                session.is_blacklisted = True
                self.db.add(session)
                await self.db.commit()
            raise AuthError("Session expired or token replayed. Access Denied.")

        user = session.user
        
        # Generate new tokens
        role_names = [role.name for role in user.roles]
        permission_names = []
        for role in user.roles:
            permission_names.extend([perm.name for perm in role.permissions])
            
        new_access_token = create_access_token(user.id, role_names, permission_names)
        new_refresh_token = generate_secure_refresh_token()

        # Update session entry (rotation)
        session.refresh_token = new_refresh_token
        session.expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        session.ip_address = ip_address
        session.user_agent = user_agent
        self.db.add(session)
        
        await self.db.flush()
        return new_access_token, new_refresh_token, user

    async def invalidate_session(self, refresh_token: str) -> None:
        """Invalidates a single device session (logout)."""
        result = await self.db.execute(select(UserSession).filter(UserSession.refresh_token == refresh_token))
        session = result.scalars().first()
        if session:
            # Delete from DB
            await self.db.delete(session)
            await self.db.flush()

    async def invalidate_all_user_sessions(self, user_id: uuid.UUID) -> None:
        """Terminates all active sessions for a user (security wipe / logout from all devices)."""
        # Delete from DB
        result = await self.db.execute(select(UserSession).filter(UserSession.user_id == user_id))
        sessions = result.scalars().all()
        for session in sessions:
            await self.db.delete(session)
        await self.db.flush()
