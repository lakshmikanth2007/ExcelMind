"""Search and non-AI structured filter route handlers."""

from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Query, Request

from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token
from app.schemas.plan import Filter, Sort
from app.services.search_service import keyword_search, apply_structured_filter
from app.services.spreadsheet_service import SpreadsheetParser
from app.storage.file_store import file_store

router = APIRouter(prefix="/files", tags=["Search"])

class FilterRequest(BaseModel):
    sheet: Optional[str] = None
    filters: List[Filter] = Field(default_factory=list)
    sort: Optional[List[Sort]] = None
    limit: Optional[int] = None

@router.get("/{file_id}/search")
def search_file(
    file_id: str,
    request: Request,
    q: str = Query("", description="Keyword search query"),
    sheet: Optional[str] = Query(None),
    column: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200)
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    target_sheet = sheet or parser.sheet_names[0]
    df, _ = parser.read_sheet(target_sheet)

    return keyword_search(df, q, target_column=column, page=page, page_size=page_size)

@router.post("/{file_id}/filter")
def filter_file(
    file_id: str,
    request: Request,
    payload: FilterRequest
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    target_sheet = payload.sheet or parser.sheet_names[0]
    df, _ = parser.read_sheet(target_sheet)

    _, result = apply_structured_filter(
        df=df,
        filters=payload.filters,
        sort=payload.sort,
        limit=payload.limit
    )
    return result
