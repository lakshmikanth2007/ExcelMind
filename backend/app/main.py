"""FastAPI application initialization with CORS, security headers, exception handlers, and routing."""

import time
import uuid
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.core.errors import AppError, create_error_response
from app.core.logging import logger, log_event
from app.api import health, files, search, exports, queries, sessions, insights

app = FastAPI(
    title="ExcelMind AI Backend",
    description="Deterministic and verifiable spreadsheet intelligence API",
    version="1.0.0",
)

# CORS Middleware
origins = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.ALLOWED_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers & Trace ID Middleware
@app.middleware("http")
async def security_and_tracing_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id", str(uuid.uuid4()))
    request.state.trace_id = trace_id
    start_time = time.time()

    response = await call_next(request)

    latency_ms = (time.time() - start_time) * 1000
    response.headers["X-Trace-Id"] = trace_id
    response.headers["X-Content-Type-Options"] = "nosniff"

    log_event(
        event_type=f"{request.method} {request.url.path}",
        trace_id=trace_id,
        latency_ms=latency_ms,
        details=f"status={response.status_code}"
    )

    return response

# Standardized Error Handlers (Section 14)
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    return create_error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
        trace_id=trace_id
    )

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    return create_error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="Invalid request payload or query parameters.",
        details={"errors": exc.errors()},
        trace_id=trace_id
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    logger.exception(f"Unhandled error [trace_id={trace_id}]: {str(exc)}")
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred. Please contact support with the trace ID.",
        details={},
        trace_id=trace_id
    )

# Include Routers (support both /api/v1 and /v1 for direct or stripped proxying)
for pfx in ["/api/v1", "/v1"]:
    app.include_router(health.router, prefix=pfx)
    app.include_router(files.router, prefix=pfx)
    app.include_router(search.router, prefix=pfx)
    app.include_router(exports.router, prefix=pfx)
    app.include_router(queries.router, prefix=pfx)
    app.include_router(sessions.router, prefix=pfx)
    app.include_router(insights.router, prefix=pfx)
