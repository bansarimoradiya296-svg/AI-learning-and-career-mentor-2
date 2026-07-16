import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union
from jose import JWTError, jwt
from app.core.config import settings
from app.core.exceptions import AuthError

ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID, roles: List[str], permissions: List[str], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a JWT Access Token.
    Payload contains user_id (as sub), assigned roles, and granular permissions.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "roles": roles,
        "permissions": permissions,
        "type": "access"
    }
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def generate_secure_refresh_token() -> str:
    """
    Generates a secure UUIDv4 to serve as a session reference/refresh token.
    This token will be stored in PostgreSQL and Redis (session cache) and rotated upon refresh.
    """
    return str(uuid.uuid4())


def decode_access_token(token: str) -> Dict:
    """
    Decodes and validates a JWT access token.
    Raises AuthError if signature is invalid, token is expired, or type is incorrect.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if token_type != "access":
            raise AuthError("Invalid token type")
        
        # Verify if token expired
        exp = payload.get("exp")
        if exp and datetime.utcfromtimestamp(exp) < datetime.utcnow():
            raise AuthError("Access token expired")
            
        return payload
    except JWTError:
        raise AuthError("Invalid or corrupted access token")
