import time
from collections import defaultdict
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    # Store request logs: key -> list of timestamps
    history = defaultdict(list)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Exclude static assets and docs from rate limiting, as well as testing environment
        path = request.url.path
        if settings.ENV == "testing" or path.startswith("/static") or path.startswith("/docs") or path.startswith("/openapi.json"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        
        # Decide limit based on endpoint sensitivity
        if "/api/v1/auth/" in path and request.method == "POST":
            limit = settings.RATE_LIMIT_SENSITIVE
            window = 60 # 1 minute
            key = f"rate:sensitive:{client_ip}:{path}"
        else:
            limit = settings.RATE_LIMIT_BURST
            window = 60 # 1 minute
            key = f"rate:burst:{client_ip}"

        now = time.time()
        
        # Clean up old timestamps (sliding window)
        self.history[key] = [t for t in self.history[key] if now - t < window]
        
        # Check limit
        if len(self.history[key]) >= limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "status": "error",
                    "error_code": "RateLimitExceeded",
                    "message": "Too many requests. Please try again in a minute."
                }
            )
            
        # Append current request timestamp
        self.history[key].append(now)
        
        return await call_next(request)
