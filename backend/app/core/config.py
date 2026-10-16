"""Application configuration loaded from environment variables."""

import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    APP_ENV: str = "development"
    ALLOWED_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://localhost:3000"
    
    # LLM Settings
    LLM_PROVIDER: str = "gemini" if (os.environ.get("GEMINI_API_KEY") or not os.environ.get("ANTHROPIC_API_KEY")) else "anthropic"
    LLM_API_KEY: str = ""
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    LLM_MODEL: str = os.environ.get("LLM_MODEL", "") or "gemini-3.1-flash-lite"
    LLM_TIMEOUT_S: int = 60
    LLM_REPHRASE: bool = False
    
    # Limits
    MAX_FILE_MB: int = 10
    MAX_ROWS: int = 200000
    MAX_COLS: int = 100
    MAX_SHEETS: int = 20
    FILE_TTL_MINUTES: int = 120
    QUERY_TIMEOUT_S: int = 60
    
    # Rate Limits
    RATE_LIMIT_GENERAL_PER_MIN: int = 300
    RATE_LIMIT_QUERY_PER_MIN: int = 60
    
    # Logging
    LOG_SENSITIVE: bool = False
    DATA_DIR: str = "/tmp/excelmind_data"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def is_llm_configured(self) -> bool:
        """Check if any LLM API key is present."""
        if self.LLM_PROVIDER == "mock":
            return True
        key = self.LLM_API_KEY or os.environ.get("LLM_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")
        gemini_key = self.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        return bool(key or gemini_key)

settings = Settings()
