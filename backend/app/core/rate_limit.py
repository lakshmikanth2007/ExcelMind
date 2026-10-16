"""In-memory rate limiter per IP and owner token."""

import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List
from fastapi import Request
from app.core.config import settings
from app.core.errors import RateLimitExceededError

class RateLimiter:
    def __init__(self):
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def check_rate_limit(self, key: str, max_per_minute: int):
        now = time.time()
        window_start = now - 60.0
        with self._lock:
            # Filter out older timestamps
            timestamps = [t for t in self._requests[key] if t > window_start]
            if len(timestamps) >= max_per_minute:
                raise RateLimitExceededError(
                    message=f"Rate limit exceeded: maximum {max_per_minute} requests per minute."
                )
            timestamps.append(now)
            self._requests[key] = timestamps

limiter = RateLimiter()

def rate_limit_check(request: Request, is_query: bool = False):
    """Enforce rate limits based on client IP and owner token."""
    forwarded = request.headers.get("X-Forwarded-For")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    owner_token = request.headers.get("X-Owner-Token") or request.cookies.get("em_owner", "anonymous")
    
    limit = settings.RATE_LIMIT_QUERY_PER_MIN if is_query else settings.RATE_LIMIT_GENERAL_PER_MIN

    # Skip localhost rate limit so internal proxies and tests are never blocked
    if client_ip not in ["127.0.0.1", "localhost", "::1"]:
        limiter.check_rate_limit(f"ip:{client_ip}:query={is_query}", limit)
    
    if owner_token and owner_token != "anonymous":
        limiter.check_rate_limit(f"owner:{owner_token}:query={is_query}", limit * 3)
