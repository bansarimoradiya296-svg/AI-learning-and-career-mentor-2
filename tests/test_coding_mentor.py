import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.auth import User
from app.security.auth_handler import create_access_token

@pytest.mark.asyncio
async def test_optimize_code_endpoint(client: AsyncClient, db_session: AsyncSession):
    # Create test user
    user = User(
        email="testcoder@aimentor.com",
        password_hash="mock_hash",
        first_name="Test",
        last_name="Coder",
        is_verified=True,
        is_active=True
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Generate test auth token
    token = create_access_token(user.id, roles=[], permissions=[])

    # Define test payload & headers
    code_content = "def add(a, b):\n    return a + b"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "text/plain"
    }

    # Call optimize endpoint with raw content in body and language in query parameters
    response = await client.post(
        "/api/v1/coding/optimize?language=python",
        content=code_content,
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert "readability_score" in data
    assert "issues_found" in data
    assert "refactored_code" in data
    assert "explanation" in data
