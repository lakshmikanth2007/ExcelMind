"""Security utilities: owner tokens, ID generation, filename sanitization, formula injection guard."""

import secrets
import re
from typing import Optional
from fastapi import Request, Response
from app.core.config import settings

OWNER_COOKIE_NAME = "em_owner"

def generate_opaque_id(nbytes: int = 16) -> str:
    """Generate an unguessable URL-safe opaque token."""
    return secrets.token_urlsafe(nbytes)

def generate_owner_token() -> str:
    """Generate a random 32-byte owner token."""
    return secrets.token_urlsafe(32)

def get_or_set_owner_token(request: Request, response: Optional[Response] = None) -> tuple[str, bool]:
    """Retrieve the owner token from X-Owner-Token header or cookie, or generate a new one.
    Returns (token, is_new).
    """
    # 1. Header takes precedence (immune to iframe cookie restrictions)
    token = request.headers.get("X-Owner-Token")
    if token and len(token) >= 16:
        if response:
            response.headers["X-Owner-Token"] = token
        return token, False

    # 2. Cookie fallback
    token = request.cookies.get(OWNER_COOKIE_NAME)
    if token and len(token) >= 16:
        if response:
            response.headers["X-Owner-Token"] = token
        return token, False
    
    new_token = generate_owner_token()
    if response:
        response.headers["X-Owner-Token"] = new_token
        try:
            response.set_cookie(
                key=OWNER_COOKIE_NAME,
                value=new_token,
                httponly=False,
                samesite="none",
                secure=True,
                max_age=settings.FILE_TTL_MINUTES * 60,
            )
        except Exception:
            pass
    return new_token, True

def sanitize_filename(filename: str) -> str:
    """Sanitize client-provided filename for safe display only.
    Paths never use this filename directly.
    """
    name = re.sub(r'[^\w\s\.-]', '_', filename).strip()
    return name[:100] if name else "spreadsheet.xlsx"

def sanitize_csv_cell(value: str) -> str:
    """Neutralize formula injection in exported tabular cells.
    Any cell starting with =, +, -, @ is prepended with a single apostrophe.
    """
    if isinstance(value, str) and value and value[0] in ("=", "+", "-", "@"):
        return "'" + value
    return value
