"""
ASGI middleware for DocShield AI.

RequestIdMiddleware
  - Reads X-Request-ID from incoming headers (allows clients to set their own
    correlation ID for distributed tracing).
  - Generates a UUID4 if none is provided.
  - Attaches the ID to request.state.request_id for use in route handlers.
  - Echoes the ID back in the X-Request-ID response header.
"""
from __future__ import annotations
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request/response pair."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = (
            request.headers.get("X-Request-ID")
            or str(uuid.uuid4())
        )
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
