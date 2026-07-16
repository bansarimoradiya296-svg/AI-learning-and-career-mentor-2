import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.auth import User, Role


@pytest.mark.asyncio
async def test_register_user(client: AsyncClient, db_session: AsyncSession):
    """
    Verifies that a student can successfully register, and default DB roles are seeded.
    """
    # Seed Student role in the test database first to ensure it's available
    student_role = Role(name="Student", description="Student role")
    db_session.add(student_role)
    await db_session.commit()

    payload = {
        "email": "teststudent@aimentor.com",
        "password": "StrongPassword123!",
        "first_name": "Test",
        "last_name": "Student"
    }
    
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    
    data = response.json()
    assert data["email"] == "teststudent@aimentor.com"
    assert data["is_verified"] is False
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_verify_otp(client: AsyncClient, db_session: AsyncSession):
    """
    Verifies that inputting the correct OTP verification code validates the user account.
    """
    # Create unverified user
    user = User(
        email="verify_test@aimentor.com",
        password_hash="mock_hash",
        first_name="Verify",
        last_name="Test",
        is_verified=False,
        verification_code="123456"
    )
    db_session.add(user)
    await db_session.commit()

    payload = {
        "email": "verify_test@aimentor.com",
        "otp_code": "123456"
    }

    response = await client.post("/api/v1/auth/verify-otp", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["is_verified"] is True
    assert data["email"] == "verify_test@aimentor.com"


@pytest.mark.asyncio
async def test_brute_force_lockout(client: AsyncClient, db_session: AsyncSession):
    from app.security.password import get_password_hash
    # 1. Create a user
    user = User(
        email="lockout_test@aimentor.com",
        password_hash=get_password_hash("correct_password"),
        is_verified=True,
        is_active=True
    )
    db_session.add(user)
    await db_session.commit()

    # Clear any previous lockout
    from app.services.auth import lockouts
    lockouts.pop("lockout_test@aimentor.com", None)

    # 2. Make 5 failed login attempts
    payload = {
        "email": "lockout_test@aimentor.com",
        "password": "wrong_password",
        "device_id": "test_device"
    }

    for _ in range(5):
        response = await client.post("/api/v1/auth/login", json=payload)
        assert response.status_code == 401

    # 3. The 6th attempt should return a 401 with lockout message
    response = await client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    assert "locked due to too many failed attempts" in response.json()["message"]

    # Verify that the lockout entry was recorded in LoginHistory
    from app.models.auth import LoginHistory
    result = await db_session.execute(
        select(LoginHistory).filter(
            LoginHistory.user_id == user.id,
            LoginHistory.status == "FAILED_BRUTE_FORCE"
        )
    )
    history = result.scalars().all()
    assert len(history) > 0


@pytest.mark.asyncio
async def test_brute_force_lockout_non_existent_email(client: AsyncClient):
    # Clear any previous lockout
    from app.services.auth import lockouts
    email = "non_existent_lockout@aimentor.com"
    lockouts.pop(email, None)

    payload = {
        "email": email,
        "password": "wrong_password",
        "device_id": "test_device"
    }

    # Make 5 failed attempts
    for _ in range(5):
        response = await client.post("/api/v1/auth/login", json=payload)
        assert response.status_code == 401

    # The 6th attempt should trigger lockout and return 401
    response = await client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    assert "locked due to too many failed attempts" in response.json()["message"]
