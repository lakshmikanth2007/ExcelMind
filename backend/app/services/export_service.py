"""Tabular export service supporting CSV and XLSX formats with formula-injection neutralization."""

import io
import csv
import openpyxl
import pandas as pd
from typing import Any, List
from app.core.security import sanitize_csv_cell

def export_to_csv(df: pd.DataFrame, include_row_numbers: bool = True) -> bytes:
    """Generate safe CSV bytes with formula injection neutralization."""
    export_df = df.copy()
    if not include_row_numbers and "__row__" in export_df.columns:
        export_df = export_df.drop(columns=["__row__"])

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Write headers
    headers = [str(c) for c in export_df.columns]
    writer.writerow(headers)

    # Write sanitized rows
    for row in export_df.itertuples(index=False):
        sanitized_row = [sanitize_csv_cell(str(val)) if pd.notnull(val) else "" for val in row]
        writer.writerow(sanitized_row)

    return output.getvalue().encode("utf-8-sig")

def export_to_xlsx(df: pd.DataFrame, sheet_title: str = "Export", include_row_numbers: bool = True) -> bytes:
    """Generate safe XLSX workbook bytes with formula injection neutralization."""
    export_df = df.copy()
    if not include_row_numbers and "__row__" in export_df.columns:
        export_df = export_df.drop(columns=["__row__"])

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]  # Excel 31-char limit

    # Headers
    headers = [str(c) for c in export_df.columns]
    ws.append(headers)

    # Rows with formula neutralization
    for row in export_df.itertuples(index=False):
        sanitized_row = []
        for val in row:
            if pd.isnull(val):
                sanitized_row.append("")
            elif isinstance(val, str):
                sanitized_row.append(sanitize_csv_cell(val))
            else:
                sanitized_row.append(val)
        ws.append(sanitized_row)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()
