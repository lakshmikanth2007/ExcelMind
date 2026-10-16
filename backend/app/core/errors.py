"""Standard error types and JSON response envelopes."""

from typing import Any, Dict, Optional
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
import uuid

class AppError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.details = details or {}

class BadRequestError(AppError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", message, details)

class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found or expired", details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message, details)

class PayloadTooLargeError(AppError):
    def __init__(self, message: str = "File or payload exceeds maximum allowed size", details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "PAYLOAD_TOO_LARGE", message, details)

class UnsupportedMediaTypeError(AppError):
    def __init__(self, message: str = "Unsupported media type. Allowed: .xlsx, .xls, .csv", details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", message, details)

class UnprocessableEntityError(AppError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(422, "UNPROCESSABLE_ENTITY", message, details)

class RateLimitExceededError(AppError):
    def __init__(self, message: str = "Rate limit exceeded. Please try again shortly.", details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_429_TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED", message, details)

class LLMUnavailableError(AppError):
    def __init__(self, message: str = "LLM service is currently unavailable or unconfigured.", details: Optional[Dict[str, Any]] = None):
        super().__init__(status.HTTP_503_SERVICE_UNAVAILABLE, "LLM_UNAVAILABLE", message, details)

def create_error_response(status_code: int, code: str, message: str, details: Optional[Dict[str, Any]] = None, trace_id: Optional[str] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or {}
            },
            "trace_id": trace_id or str(uuid.uuid4())
        }
    )
