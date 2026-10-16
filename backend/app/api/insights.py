"""Insights endpoint returning automated data-quality and statistical report."""

from typing import Optional
from fastapi import APIRouter, Query, Request
from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token
from app.schemas.insights import InsightReport
from app.services.insight_service import generate_insights_report
from app.services.spreadsheet_service import SpreadsheetParser
from app.storage.file_store import file_store

router = APIRouter(prefix="/files", tags=["Insights"])

@router.get("/{file_id}/insights", response_model=InsightReport)
def get_insights(
    file_id: str,
    request: Request,
    sheet: Optional[str] = Query(None)
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    target_sheet = sheet or parser.sheet_names[0]
    df, profile = parser.read_sheet(target_sheet)

    report = generate_insights_report(df, profile)
    return report
