"""File management endpoints: upload, sheets, schema, preview, deletion."""

import os
import math
import pandas as pd
from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile, status

from app.core.config import settings
from app.core.errors import BadRequestError, NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token, sanitize_filename
from app.schemas.profile import SheetShape
from app.services.file_service import validate_and_save_upload
from app.services.spreadsheet_service import SpreadsheetParser
from app.storage.file_store import file_store

router = APIRouter(prefix="/files", tags=["Files"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    response: Response,
    file: UploadFile = File(...)
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request, response)

    content = await file.read()
    filename = file.filename or "spreadsheet.xlsx"
    clean_name = sanitize_filename(filename)

    meta = validate_and_save_upload(
        filename=clean_name,
        content=content,
        owner_token=owner_token
    )

    # Parse initial sheet to verify validity and extract profile
    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    active_sheet = parser.sheet_names[0]
    df, profile = parser.read_sheet(active_sheet)

    # Compute sheet shapes for all sheets in workbook
    sheet_shapes = {}
    for s_name in parser.sheet_names:
        if s_name == active_sheet:
            sheet_shapes[s_name] = {"name": s_name, "row_count": len(df), "column_count": profile.column_count}
        else:
            try:
                s_df, s_prof = parser.read_sheet(s_name)
                sheet_shapes[s_name] = {"name": s_name, "row_count": len(s_df), "column_count": s_prof.column_count}
            except Exception:
                sheet_shapes[s_name] = {"name": s_name, "row_count": 0, "column_count": 0}

    return {
        "file_id": meta.file_id,
        "owner_token": meta.owner_token,
        "filename": clean_name,
        "file_type": meta.file_type,
        "sheets": parser.sheet_names,
        "sheet_shapes": sheet_shapes,
        "active_sheet": active_sheet,
        "profile_summary": profile.model_dump(),
        "warnings": profile.warnings
    }

@router.get("")
def list_user_files(request: Request, response: Response):
    """List all active spreadsheets in history for the current session."""
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request, response)
    user_files = file_store.list_files_for_owner(owner_token)
    
    results = []
    for f in user_files:
        sheet_names = []
        row_count = 0
        column_count = 0
        try:
            parser = SpreadsheetParser(f.temp_file_path, f.file_type)
            sheet_names = parser.sheet_names
            if sheet_names:
                df, prof = parser.read_sheet(sheet_names[0])
                row_count = len(df)
                column_count = prof.column_count
        except Exception:
            pass

        results.append({
            "file_id": f.file_id,
            "filename": f.original_filename,
            "file_type": f.file_type,
            "file_size": f.file_size_bytes,
            "created_at": f.created_at,
            "last_accessed_at": f.last_accessed_at,
            "is_temp_modified": getattr(f, "is_temp_modified", False),
            "modifications_count": getattr(f, "modifications_count", 0),
            "sheets": sheet_names,
            "row_count": row_count,
            "column_count": column_count
        })

    # Sort most recently accessed first
    results.sort(key=lambda x: x["last_accessed_at"], reverse=True)
    return {"files": results}

@router.post("/new", status_code=status.HTTP_201_CREATED)
def create_new_spreadsheet(
    request: Request,
    response: Response,
    name: Optional[str] = Query("New_Workbook.xlsx"),
    template: Optional[str] = Query("blank")
):
    """Create a new Excel file directly with template columns or blank sheet."""
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request, response)
    
    clean_name = sanitize_filename(name if name.endswith(".xlsx") else f"{name}.xlsx")
    
    # Generate starter dataset
    if template == "sales":
        df = pd.DataFrame({
            "Order ID": ["ORD-1001", "ORD-1002", "ORD-1003", "ORD-1004", "ORD-1005"],
            "Region": ["North", "South", "East", "West", "North"],
            "Product": ["Laptop", "Monitor", "Keyboard", "Mouse", "Chair"],
            "Units": [12, 25, 45, 80, 15],
            "Unit Price": [950.0, 320.0, 65.0, 25.0, 210.0],
            "Total Sales": [11400.0, 8000.0, 2925.0, 2000.0, 3150.0]
        })
    elif template == "students":
        df = pd.DataFrame({
            "Student ID": ["STU-01", "STU-02", "STU-03", "STU-04", "STU-05"],
            "Name": ["Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Prince", "Ethan Hunt"],
            "Department": ["Computer Science", "Electrical", "Mechanical", "Computer Science", "Business"],
            "Marks": [88, 92, 79, 95, 84],
            "Grade": ["A", "A+", "B+", "A+", "A"]
        })
    else:
        df = pd.DataFrame({
            "ID": [1, 2, 3],
            "Item Name": ["Item Alpha", "Item Beta", "Item Gamma"],
            "Category": ["Standard", "Premium", "Standard"],
            "Quantity": [10, 25, 15],
            "Price": [100.0, 250.0, 150.0],
            "Status": ["In Stock", "In Stock", "Pending"]
        })

    import io
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Sheet1", index=False)
    content = output.getvalue()

    meta = validate_and_save_upload(
        filename=clean_name,
        content=content,
        owner_token=owner_token
    )

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    active_sheet = "Sheet1"
    df, profile = parser.read_sheet(active_sheet)

    return {
        "file_id": meta.file_id,
        "owner_token": meta.owner_token,
        "filename": clean_name,
        "file_type": meta.file_type,
        "sheets": ["Sheet1"],
        "sheet_shapes": {"Sheet1": {"name": "Sheet1", "row_count": len(df), "column_count": profile.column_count}},
        "active_sheet": active_sheet,
        "profile_summary": profile.model_dump(),
        "warnings": profile.warnings
    }

@router.post("/sample/{sample_name}", status_code=status.HTTP_201_CREATED)
def load_sample_file(
    sample_name: str,
    request: Request,
    response: Response
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request, response)

    sample_map = {
        "students": ("sample_data/students_demo.xlsx", "students_demo.xlsx"),
        "sales": ("sample_data/sales_demo.xlsx", "sales_demo.xlsx"),
        "messy_headers": ("sample_data/messy_headers.xlsx", "messy_headers.xlsx"),
        "messy_quality": ("sample_data/messy_quality.xlsx", "messy_quality.xlsx"),
    }
    if sample_name not in sample_map:
        raise BadRequestError(f"Unknown sample: {sample_name}. Options: students, sales, messy_headers, messy_quality")

    sample_rel_path, filename = sample_map[sample_name]
    abs_path = os.path.abspath(sample_rel_path)
    if not os.path.exists(abs_path):
        raise NotFoundError(f"Sample file {filename} does not exist on disk.")

    with open(abs_path, "rb") as f:
        content = f.read()

    meta = validate_and_save_upload(
        filename=filename,
        content=content,
        owner_token=owner_token
    )

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    active_sheet = parser.sheet_names[0]
    df, profile = parser.read_sheet(active_sheet)

    sheet_shapes = {}
    for s_name in parser.sheet_names:
        if s_name == active_sheet:
            sheet_shapes[s_name] = {"name": s_name, "row_count": len(df), "column_count": profile.column_count}
        else:
            try:
                s_df, s_prof = parser.read_sheet(s_name)
                sheet_shapes[s_name] = {"name": s_name, "row_count": len(s_df), "column_count": s_prof.column_count}
            except Exception:
                sheet_shapes[s_name] = {"name": s_name, "row_count": 0, "column_count": 0}

    return {
        "file_id": meta.file_id,
        "owner_token": meta.owner_token,
        "filename": filename,
        "file_type": meta.file_type,
        "sheets": parser.sheet_names,
        "sheet_shapes": sheet_shapes,
        "active_sheet": active_sheet,
        "profile_summary": profile.model_dump(),
        "warnings": profile.warnings
    }

@router.get("/{file_id}/sheets")
def get_sheets(file_id: str, request: Request):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    sheet_shapes = []
    for s_name in parser.sheet_names:
        try:
            df, prof = parser.read_sheet(s_name)
            sheet_shapes.append({"name": s_name, "row_count": len(df), "column_count": prof.column_count})
        except Exception:
            sheet_shapes.append({"name": s_name, "row_count": 0, "column_count": 0})

    return {
        "file_id": file_id,
        "filename": meta.original_filename,
        "sheets": sheet_shapes
    }

@router.get("/{file_id}/schema")
def get_schema(
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

    return {
        "file_id": file_id,
        "filename": meta.original_filename,
        "sheet": target_sheet,
        "is_temp_modified": getattr(meta, "is_temp_modified", False),
        "modifications_count": getattr(meta, "modifications_count", 0),
        "profile": profile.model_dump()
    }

@router.post("/{file_id}/revert")
def revert_temp_to_original(
    file_id: str,
    request: Request,
    sheet: Optional[str] = Query(None)
):
    """Revert the working temp Excel back to the pristine uploaded main Excel file."""
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    success = meta.revert_to_main()
    if not success:
        raise BadRequestError("Could not revert: original main Excel file is not available.")

    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    target_sheet = sheet or parser.sheet_names[0]
    df, profile = parser.read_sheet(target_sheet)

    return {
        "file_id": file_id,
        "filename": meta.original_filename,
        "is_temp_modified": False,
        "sheet": target_sheet,
        "profile": profile.model_dump(),
        "message": "Reverted temp working Excel back to original main Excel file."
    }

@router.get("/{file_id}/preview")
def get_preview(
    file_id: str,
    request: Request,
    sheet: Optional[str] = Query(None),
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
    df, profile = parser.read_sheet(target_sheet)

    total_rows = len(df)
    total_pages = max(1, math.ceil(total_rows / page_size))
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size

    page_df = df.iloc[start_idx:end_idx]
    records = []
    for row in page_df.to_dict(orient="records"):
        cleaned_row = {}
        for k, v in row.items():
            if v is None:
                cleaned_row[k] = None
            elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                cleaned_row[k] = None
            elif hasattr(v, "isoformat"):
                cleaned_row[k] = v.isoformat()
            else:
                cleaned_row[k] = v
        records.append(cleaned_row)

    columns = [col for col in df.columns]

    return {
        "file_id": file_id,
        "sheet": target_sheet,
        "page": page,
        "page_size": page_size,
        "total_rows": total_rows,
        "total_pages": total_pages,
        "columns": columns,
        "rows": records
    }

@router.delete("/{file_id}")
def delete_file(file_id: str, request: Request):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    deleted = file_store.delete_file(file_id, owner_token, allow_adopt=is_new)
    if not deleted:
        raise NotFoundError("Spreadsheet not found or already deleted.")

    return {"status": "ok", "message": "File and derived data successfully deleted."}
