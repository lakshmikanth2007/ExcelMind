"""Health check endpoint reporting system status and LLM configuration."""

from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(tags=["Health"])

@router.get("/health")
def get_health():
    return {
        "status": "ok",
        "app_env": settings.APP_ENV,
        "llm_configured": settings.is_llm_configured,
        "llm_provider": settings.LLM_PROVIDER,
        "max_file_mb": settings.MAX_FILE_MB,
        "file_ttl_minutes": settings.FILE_TTL_MINUTES,
    }
