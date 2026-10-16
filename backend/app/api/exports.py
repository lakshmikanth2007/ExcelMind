"""Export endpoints for queried results and cleaned sheets."""

from typing import Literal, Optional
from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import Response

from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token
from app.services.export_service import export_to_csv, export_to_xlsx
from app.services.spreadsheet_service import SpreadsheetParser
from app.storage.file_store import file_store
from app.storage.session_store import session_store

router = APIRouter(prefix="/files", tags=["Exports"])

@router.get("/{file_id}/results/{result_id}/export")
def export_query_result(
    file_id: str,
    result_id: str,
    request: Request,
    format: Literal["csv", "xlsx"] = Query("csv")
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    stored_res = session_store.get_result(result_id)
    if not stored_res or stored_res.file_id != file_id:
        raise NotFoundError("Result not found or expired.")

    df = stored_res.df_data

    if format == "csv":
        data = export_to_csv(df)
        media_type = "text/csv"
        filename = f"result_{result_id[:8]}.csv"
    else:
        data = export_to_xlsx(df, sheet_title="Results")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"result_{result_id[:8]}.xlsx"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/{file_id}/export")
def export_cleaned_sheet(
    file_id: str,
    request: Request,
    sheet: Optional[str] = Query(None),
    format: Literal["csv", "xlsx"] = Query("csv"),
    source: Literal["temp", "main"] = Query("temp")
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    # Select between temp working copy (with AI edits) or pristine main Excel
    selected_path = meta.main_file_path if source == "main" else meta.temp_file_path
    if not os.path.exists(selected_path):
        selected_path = meta.file_path

    parser = SpreadsheetParser(selected_path, meta.file_type)
    target_sheet = sheet or parser.sheet_names[0]
    df, _ = parser.read_sheet(target_sheet)

    prefix = "main_original" if source == "main" else "working_temp"
    if format == "csv":
        data = export_to_csv(df, include_row_numbers=False)
        media_type = "text/csv"
        filename = f"{prefix}_{target_sheet}.csv"
    else:
        data = export_to_xlsx(df, sheet_title=target_sheet, include_row_numbers=False)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{prefix}_{target_sheet}.xlsx"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
