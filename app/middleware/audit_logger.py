import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core import database
from app.models.auth import AuditLog
from app.security.auth_handler import decode_access_token


class AuditLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Process the request first
        response = await call_next(request)
        
        # Log write operations (POST, PUT, DELETE, PATCH)
        method = request.method
        if method in ["POST", "PUT", "DELETE", "PATCH"]:
            path = request.url.path
            
            # Skip logging for health checks, swagger docs, static assets
            if any(path.startswith(prefix) for prefix in ["/static", "/docs", "/openapi.json", "/health"]):
                return response
                
            # Exclude standard password login payloads from audit log storage for security
            if "/auth/login" in path:
                action = "USER_LOGIN_ATTEMPT"
                entity = "auth"
            elif "/auth/register" in path:
                action = "USER_REGISTRATION"
                entity = "users"
            else:
                action = f"{method}_{path.replace('/', '_').strip('_').upper()}"
                entity = path.split("/")[3] if len(path.split("/")) > 3 else "system"

            client_ip = request.client.host if request.client else "unknown"
            
            # Extract user_id if access token exists
            user_id = None
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                try:
                    token = auth_header.split(" ")[1]
                    payload = decode_access_token(token)
                    user_id_str = payload.get("sub")
                    if user_id_str:
                        user_id = uuid.UUID(user_id_str)
                except Exception:
                    pass # Ignore token decode errors here, auth route handles it

            # Write audit log asynchronously using a separate connection
            try:
                async with database.AsyncSessionLocal() as db:
                    audit_entry = AuditLog(
                        user_id=user_id,
                        action=action,
                        entity=entity,
                        ip_address=client_ip,
                        new_value=f"Response status: {response.status_code}"
                    )
                    db.add(audit_entry)
                    await db.commit()
            except Exception as e:
                # Do not block request lifecycle if audit logging fails, log error
                print(f"Audit log recording error: {e}")

        return response
