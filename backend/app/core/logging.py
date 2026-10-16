"""Structured logging configured to protect sensitive user cell data."""

import logging
import sys
from app.core.config import settings

def setup_logger(name: str = "excelmind") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO if settings.APP_ENV != "test" else logging.WARNING)
    return logger

logger = setup_logger()

def log_event(event_type: str, trace_id: str, file_id: str = "", latency_ms: float = 0, details: str = ""):
    """Safe structured logger that avoids logging sensitive user data."""
    msg = f"event={event_type} trace_id={trace_id}"
    if file_id:
        msg += f" file_id={file_id}"
    if latency_ms:
        msg += f" latency_ms={latency_ms:.2f}"
    if details:
        msg += f" details={details}"
    logger.info(msg)
