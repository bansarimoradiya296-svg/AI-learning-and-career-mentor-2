from typing import List
from fastapi import APIRouter, Depends, Request, Response, status, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.core.exceptions import BadRequestError, AuthError
from app.schemas.auth import (
    UserRegisterRequest, UserResponse, UserLoginRequest, TokenResponse,
    OTPVerifyRequest, SessionResponse, LoginHistoryResponse
)
from app.services.auth import AuthService
from app.security.permissions import get_current_user
from app.models.auth import UserSession, LoginHistory

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registers a new account. Simulates OTP email routing."""
    auth_service = AuthService(db)
    user = await auth_service.register_user(
        email=payload.email,
        password_raw=payload.password,
        first_name=payload.first_name,
        last_name=payload.last_name
    )
    return user


@router.post("/verify-otp", response_model=UserResponse)
async def verify_otp(payload: OTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    """Verifies account via OTP verification code."""
    auth_service = AuthService(db)
    user = await auth_service.verify_otp(email=payload.email, otp_code=payload.otp_code)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates user.
    Sets HttpOnly cookie containing the rotating refresh token.
    Returns access token.
    """
    auth_service = AuthService(db)
    user_agent = request.headers.get("User-Agent")
    ip_address = request.client.host if request.client else "unknown"

    access_token, refresh_token, user = await auth_service.authenticate_user(
        email=payload.email,
        password_raw=payload.password,
        device_id=payload.device_id,
        user_agent=user_agent,
        ip_address=ip_address
    )

    # Set secure HttpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=7 * 86400 # 7 days
    )

    return {"access_token": access_token, "user": user}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: str = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Swaps an old refresh token cookie for a new one.
    Implements token rotation (RTR) to detect theft replay attacks.
    """
    if not refresh_token:
        raise AuthError("Refresh token missing from cookies")

    # Read payload details
    device_id = request.headers.get("X-Device-Id")
    if not device_id:
        # Fallback or strict error. Let's fallback to User-Agent hash or generic check
        device_id = request.headers.get("User-Agent", "unknown_device")

    user_agent = request.headers.get("User-Agent")
    ip_address = request.client.host if request.client else "unknown"

    auth_service = AuthService(db)
    try:
        new_access_token, new_refresh_token, user = await auth_service.rotate_refresh_token(
            old_refresh_token=refresh_token,
            device_id=device_id,
            user_agent=user_agent,
            ip_address=ip_address
        )

        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=7 * 86400
        )

        return {"access_token": new_access_token, "user": user}
    except AuthError as e:
        # Clear invalid cookie on failure
        response.delete_cookie("refresh_token")
        raise e


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    """Invalidates active cookie session."""
    if refresh_token:
        auth_service = AuthService(db)
        await auth_service.invalidate_session(refresh_token)
    
    response.delete_cookie("refresh_token")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    response: Response,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Terminates all active device sessions for this user."""
    auth_service = AuthService(db)
    await auth_service.invalidate_all_user_sessions(current_user.id)
    response.delete_cookie("refresh_token")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=List[SessionResponse])
async def list_active_sessions(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves list of active device login sessions."""
    result = await db.execute(
        select(UserSession).filter(UserSession.user_id == current_user.id)
    )
    return result.scalars().all()


@router.get("/history", response_model=List[LoginHistoryResponse])
async def list_login_history(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves history of user login events."""
    result = await db.execute(
        select(LoginHistory)
        .filter(LoginHistory.user_id == current_user.id)
        .order_by(LoginHistory.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()
