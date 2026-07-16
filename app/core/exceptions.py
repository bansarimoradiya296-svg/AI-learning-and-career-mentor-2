from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class AppBaseException(Exception):
    """Base exception class for all custom application errors."""
    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AuthError(AppBaseException):
    """Exception raised for authentication failure (invalid credentials, expired tokens)."""
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class ForbiddenError(AppBaseException):
    """Exception raised for authorization failure (insufficient roles or permissions)."""
    def __init__(self, message: str = "Access forbidden"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class NotFoundError(AppBaseException):
    """Exception raised when a requested resource is not found."""
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class BadRequestError(AppBaseException):
    """Exception raised for bad client requests (validation, bad logic inputs)."""
    def __init__(self, message: str = "Bad request"):
        super().__init__(message, status.HTTP_400_BAD_REQUEST)


class RateLimitError(AppBaseException):
    """Exception raised when client exceeds rate limit quotas."""
    def __init__(self, message: str = "Too many requests. Please try again later."):
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


def register_exception_handlers(app: FastAPI) -> None:
    """Registers exception handlers to map custom exception classes to HTTP JSON responses."""
    
    @app.exception_handler(AppBaseException)
    async def app_base_exception_handler(request: Request, exc: AppBaseException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "status": "error",
                "error_code": exc.__class__.__name__,
                "message": exc.message
            }
        )

    # General fallback for unexpected system crashes
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "error_code": "InternalServerError",
                "message": "An unexpected server error occurred. Please contact administration."
            }
        )
