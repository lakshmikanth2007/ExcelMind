"""Spreadsheet parsing, header detection, merged cells normalization, type inference, and profiling."""

import re
import os
import openpyxl
import xlrd
import pandas as pd
import numpy as np
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple, Set

from app.core.config import settings
from app.core.errors import BadRequestError, PayloadTooLargeError
from app.schemas.profile import (
    ColumnProfile,
    MixedTypeItem,
    QualitySummary,
    SheetProfile,
    SheetShape,
    WorkbookProfileSummary,
)

# Standard missing value markers per spec Section 5.9
MISSING_VALUES_STRINGS = {
    "", "nan", "none", "null", "na", "n/a", "-", "--", "n.a.", "nil", "#n/a", "#na"
}

CURRENCY_SYMBOLS = ["$", "₹", "€", "£", "¥"]

def is_value_missing(val: Any) -> bool:
    """Check if a value should be treated as missing per spec Section 5 rule 9."""
    if val is None:
        return True
    if isinstance(val, (float, np.floating)) and np.isnan(val):
        return True
    if isinstance(val, (int, float, bool, np.integer, np.bool_)):
        return False
    if isinstance(val, (datetime, date, pd.Timestamp)):
        return False
    # String check
    s = str(val).strip().lower()
    return s in MISSING_VALUES_STRINGS or len(s) == 0

def clean_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize missing values to None/NaN across the DataFrame."""
    df_clean = df.copy()
    for col in df_clean.columns:
        if col == "__row__":
            continue
        df_clean[col] = df_clean[col].apply(lambda x: None if is_value_missing(x) else x)
    return df_clean

class SpreadsheetParser:
    def __init__(self, file_path: str, file_type: str):
        self.file_path = file_path
        self.file_type = file_type.lower().lstrip(".")
        self.sheet_names: List[str] = []
        self._inspect_sheets()

    def _inspect_sheets(self):
        if self.file_type == "csv":
            self.sheet_names = ["Sheet1"]
        elif self.file_type == "xlsx":
            wb = openpyxl.load_workbook(self.file_path, read_only=True, data_only=True)
            self.sheet_names = wb.sheetnames
            wb.close()
        elif self.file_type == "xls":
            wb = xlrd.open_workbook(self.file_path, on_demand=True)
            self.sheet_names = wb.sheet_names()
            wb.release_resources()
        
        if len(self.sheet_names) > settings.MAX_SHEETS:
            raise PayloadTooLargeError(
                f"Workbook contains {len(self.sheet_names)} sheets (maximum allowed is {settings.MAX_SHEETS})."
            )

    def read_sheet(self, sheet_name: Optional[str] = None) -> Tuple[pd.DataFrame, SheetProfile]:
        sheet = sheet_name or self.sheet_names[0]
        if sheet not in self.sheet_names:
            raise BadRequestError(f"Sheet '{sheet}' does not exist in workbook. Available sheets: {', '.join(self.sheet_names)}")

        warnings: List[str] = []
        if self.file_type == "csv":
            raw_rows = self._read_csv_raw()
        elif self.file_type == "xlsx":
            raw_rows, merged_warnings = self._read_xlsx_raw(sheet)
            warnings.extend(merged_warnings)
        elif self.file_type == "xls":
            raw_rows = self._read_xls_raw(sheet)
        else:
            raise BadRequestError(f"Unsupported file type '{self.file_type}'")

        if not raw_rows:
            # Empty sheet
            profile = SheetProfile(
                sheet_name=sheet,
                row_count=0,
                column_count=0,
                header_row=1,
                columns=[],
                warnings=warnings + ["Sheet is empty."],
                quality=QualitySummary()
            )
            df = pd.DataFrame(columns=["__row__"])
            return df, profile

        # Section 5 Rule 4: Header detection
        header_idx, data_start_idx = self._detect_header_row(raw_rows)
        excel_header_row = header_idx + 1  # 1-based original Excel row number

        header_cells = raw_rows[header_idx]
        data_rows = raw_rows[data_start_idx:]

        # Section 5 Rule 7: Column names normalization
        col_names, orig_names = self._normalize_column_names(header_cells)
        num_cols = len(col_names)

        if num_cols > settings.MAX_COLS:
            raise PayloadTooLargeError(f"Sheet has {num_cols} columns (maximum allowed is {settings.MAX_COLS}).")

        # Construct DataFrame with original Excel row numbers
        records = []
        excel_row_numbers = []
        for offset, row in enumerate(data_rows):
            actual_excel_row = (data_start_idx + offset) + 1  # 1-based
            # Pad or truncate row to num_cols
            padded_row = list(row[:num_cols]) + [None] * max(0, num_cols - len(row))
            # Check if row is completely empty
            if all(is_value_missing(c) for c in padded_row):
                continue
            records.append(padded_row)
            excel_row_numbers.append(actual_excel_row)

        if len(records) > settings.MAX_ROWS:
            raise PayloadTooLargeError(f"Sheet contains {len(records)} rows (maximum allowed is {settings.MAX_ROWS}).")

        df = pd.DataFrame(records, columns=col_names)
        df["__row__"] = excel_row_numbers

        # Section 5 Rule 8 & 9: Type inference, type coercion, and quality analysis
        df, col_profiles, quality_summary, type_warnings = self._infer_types_and_profile(
            df, col_names, orig_names, excel_row_numbers
        )
        warnings.extend(type_warnings)

        # Build sheet profile
        profile = SheetProfile(
            sheet_name=sheet,
            row_count=len(df),
            column_count=num_cols,
            header_row=excel_header_row,
            columns=col_profiles,
            warnings=warnings,
            quality=quality_summary
        )

        return df, profile

    def _read_csv_raw(self) -> List[List[Any]]:
        # Read with encoding fallbacks: first without errors='replace' to detect real charset
        lines = []
        import csv
        for enc in ["utf-8-sig", "utf-8", "latin-1"]:
            try:
                with open(self.file_path, "r", encoding=enc) as f:
                    reader = csv.reader(f)
                    lines = [list(r) for r in reader]
                break
            except (UnicodeDecodeError, UnicodeError):
                lines = []
                continue
        if not lines:
            # Fallback with errors='replace'
            with open(self.file_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                lines = [list(r) for r in reader]
        return lines

    def _read_xlsx_raw(self, sheet_name: str) -> Tuple[List[List[Any]], List[str]]:
        warnings = []
        wb = openpyxl.load_workbook(self.file_path, data_only=True)
        ws = wb[sheet_name]

        merged_ranges = list(ws.merged_cells.ranges)

        raw_rows: List[List[Any]] = []
        for row in ws.iter_rows(values_only=True):
            raw_rows.append(list(row))
        wb.close()

        # Section 5 Rule 5: Handle merged cells by filling 2D raw_rows list
        if merged_ranges and raw_rows:
            warnings.append(f"Sheet contains {len(merged_ranges)} merged cell range(s); filled values to preserve tabular integrity.")
            for m_range in merged_ranges:
                min_col, min_row, max_col, max_row = m_range.bounds
                # 1-based to 0-based indexing
                r_start, r_end = min_row - 1, max_row - 1
                c_start, c_end = min_col - 1, max_col - 1
                if r_start < len(raw_rows) and c_start < len(raw_rows[r_start]):
                    top_left_val = raw_rows[r_start][c_start]
                    for r_idx in range(r_start, min(r_end + 1, len(raw_rows))):
                        for c_idx in range(c_start, min(c_end + 1, len(raw_rows[r_idx]))):
                            raw_rows[r_idx][c_idx] = top_left_val

        return raw_rows, warnings

    def _read_xls_raw(self, sheet_name: str) -> List[List[Any]]:
        wb = xlrd.open_workbook(self.file_path)
        ws = wb.sheet_by_name(sheet_name)
        raw_rows = []
        for r in range(ws.nrows):
            row_vals = []
            for c in range(ws.ncols):
                cell_type = ws.cell_type(r, c)
                val = ws.cell_value(r, c)
                if cell_type == xlrd.XL_CELL_DATE:
                    try:
                        date_tuple = xlrd.xldate_as_tuple(val, wb.datemode)
                        val = datetime(*date_tuple)
                    except Exception:
                        pass
                elif cell_type == xlrd.XL_CELL_EMPTY or cell_type == xlrd.XL_CELL_BLANK:
                    val = None
                row_vals.append(val)
            raw_rows.append(row_vals)
        wb.release_resources()
        return raw_rows

    def _detect_header_row(self, raw_rows: List[List[Any]]) -> Tuple[int, int]:
        """Scan first 15 rows; choose row with most non-empty, mostly-string, unique cells."""
        best_row_idx = 0
        best_score = -1.0
        max_scan = min(15, len(raw_rows))

        for idx in range(max_scan):
            row = raw_rows[idx]
            non_empty = [c for c in row if not is_value_missing(c)]
            if not non_empty:
                continue

            # String ratio
            str_count = sum(1 for c in non_empty if isinstance(c, str) and not c.strip().replace('.', '', 1).isdigit())
            str_ratio = str_count / len(non_empty) if non_empty else 0

            # Uniqueness ratio
            str_vals = [str(c).strip().lower() for c in non_empty]
            unique_ratio = len(set(str_vals)) / len(str_vals) if str_vals else 0

            # Score prioritizes count of columns, uniqueness, and string types
            score = (len(non_empty) * 2.0) + (str_ratio * 3.0) + (unique_ratio * 2.5)

            # Extra weight if subsequent rows look like data (numbers or mixed)
            if idx + 1 < len(raw_rows):
                next_row = [c for c in raw_rows[idx + 1] if not is_value_missing(c)]
                if len(next_row) >= len(non_empty) * 0.5:
                    score += 2.0

            if score > best_score:
                best_score = score
                best_row_idx = idx

        return best_row_idx, best_row_idx + 1

    def _normalize_column_names(self, header_cells: List[Any]) -> Tuple[List[str], List[str]]:
        col_names = []
        orig_names = []
        seen: Dict[str, int] = {}

        for idx, cell in enumerate(header_cells):
            orig_str = str(cell).strip() if cell is not None else ""
            if not orig_str or is_value_missing(orig_str):
                orig_str = f"Column_{idx + 1}"
            orig_names.append(orig_str)

            # Strip, collapse whitespace
            norm = re.sub(r'\s+', ' ', orig_str).strip()
            if not norm:
                norm = f"Column_{idx + 1}"

            if norm.lower() in seen:
                seen[norm.lower()] += 1
                unique_name = f"{norm}_{seen[norm.lower()]}"
            else:
                seen[norm.lower()] = 1
                unique_name = norm

            col_names.append(unique_name)

        return col_names, orig_names

    def _infer_types_and_profile(
        self,
        df: pd.DataFrame,
        col_names: List[str],
        orig_names: List[str],
        excel_row_numbers: List[int]
    ) -> Tuple[pd.DataFrame, List[ColumnProfile], QualitySummary, List[str]]:
        profiles: List[ColumnProfile] = []
        warnings: List[str] = []
        mixed_types_list: List[MixedTypeItem] = []
        ambiguous_dates: List[str] = []
        outlier_columns: Dict[str, List[int]] = {}
        total_rows = len(df)

        # Check duplicate rows (excluding __row__)
        subset_cols = [c for c in col_names if c in df.columns]
        dup_mask = df.duplicated(subset=subset_cols, keep=False)
        dup_excel_rows = [excel_row_numbers[i] for i, is_dup in enumerate(dup_mask) if is_dup][:20]
        duplicate_count = int(df.duplicated(subset=subset_cols).sum())

        total_empty_cells = 0

        for col_name, orig_name in zip(col_names, orig_names):
            series = df[col_name]
            raw_vals = series.tolist()

            # Identify missing values per Rule 9
            missing_mask = [is_value_missing(v) for v in raw_vals]
            null_count = sum(missing_mask)
            total_empty_cells += null_count
            null_pct = round((null_count / total_rows * 100), 2) if total_rows > 0 else 0.0

            valid_vals = [v for i, v in enumerate(raw_vals) if not missing_mask[i]]
            valid_excel_rows = [excel_row_numbers[i] for i, v in enumerate(raw_vals) if not missing_mask[i]]

            # Type detection heuristics
            inferred_dtype, coerced_vals, mixed_rows, ambig_date = self._coerce_and_classify_column(
                col_name, valid_vals, valid_excel_rows
            )

            if ambig_date:
                ambiguous_dates.append(col_name)
                warnings.append(f"Ambiguous date format in column '{col_name}'; defaulted to day-first interpretation.")

            if mixed_rows:
                mixed_types_list.append(MixedTypeItem(
                    column=col_name,
                    offending_rows=mixed_rows[:20],
                    sample_values=[str(v) for v in [raw_vals[excel_row_numbers.index(r)] for r in mixed_rows[:5]]]
                ))

            # Put coerced values back in DataFrame
            new_col_vals = []
            valid_idx = 0
            for is_miss in missing_mask:
                if is_miss:
                    new_col_vals.append(None)
                else:
                    new_col_vals.append(coerced_vals[valid_idx])
                    valid_idx += 1
            df[col_name] = new_col_vals

            # Calculate metrics
            coerced_series = pd.Series([v for v in new_col_vals if v is not None])
            unique_count = int(coerced_series.nunique()) if len(coerced_series) > 0 else 0

            # Further classify categorical or id-like
            final_dtype = inferred_dtype
            col_lower = col_name.lower()
            is_id_name = any(tag in col_lower for tag in ["id", "code", "no", "number", "num", "key"])
            
            if unique_count == len(coerced_series) and is_id_name and len(coerced_series) > 0:
                final_dtype = "id-like"
            elif final_dtype == "text":
                unique_pct = (unique_count / len(coerced_series) * 100) if len(coerced_series) > 0 else 0
                if unique_count <= 30 or unique_pct <= 5.0:
                    final_dtype = "categorical"

            # Min, max, mean, top values
            min_val, max_val, mean_val = None, None, None
            if final_dtype in ["integer", "float", "currency", "percent"]:
                num_series = pd.to_numeric(coerced_series, errors="coerce").dropna()
                if len(num_series) > 0:
                    min_val = float(num_series.min())
                    max_val = float(num_series.max())
                    mean_val = round(float(num_series.mean()), 4)

                    # Outlier detection (IQR method per Section 12)
                    q25 = num_series.quantile(0.25)
                    q75 = num_series.quantile(0.75)
                    iqr = q75 - q25
                    if iqr > 0:
                        lower_bound = q25 - 1.5 * iqr
                        upper_bound = q75 + 1.5 * iqr
                        outlier_mask = (num_series < lower_bound) | (num_series > upper_bound)
                        if outlier_mask.any():
                            out_indices = num_series[outlier_mask].index.tolist()
                            outlier_rows = [excel_row_numbers[idx] for idx in out_indices][:20]
                            outlier_columns[col_name] = outlier_rows
            elif final_dtype in ["date", "datetime"]:
                dt_series = pd.to_datetime(coerced_series, errors="coerce").dropna()
                if len(dt_series) > 0:
                    min_val = dt_series.min().strftime("%Y-%m-%d")
                    max_val = dt_series.max().strftime("%Y-%m-%d")

            # Top values and sample values
            top_vals = []
            if len(coerced_series) > 0:
                vc = coerced_series.value_counts().head(8)
                top_vals = [item for item in vc.index.tolist()]
            sample_vals = [v for v in coerced_series.head(5).tolist()]

            profiles.append(ColumnProfile(
                name=col_name,
                original_name=orig_name,
                dtype=final_dtype,
                null_count=null_count,
                null_pct=null_pct,
                unique_count=unique_count,
                min=min_val,
                max=max_val,
                mean=mean_val,
                top_values=top_vals,
                sample_values=sample_vals
            ))

        quality = QualitySummary(
            has_empty_cells=total_empty_cells > 0,
            empty_cells_count=total_empty_cells,
            duplicate_rows_count=duplicate_count,
            duplicate_rows=dup_excel_rows,
            mixed_types=mixed_types_list,
            ambiguous_date_columns=ambiguous_dates,
            outlier_columns=outlier_columns
        )

        return df, profiles, quality, warnings

    def _coerce_and_classify_column(
        self,
        col_name: str,
        valid_vals: List[Any],
        valid_excel_rows: List[int]
    ) -> Tuple[str, List[Any], List[int], bool]:
        if not valid_vals:
            return "text", [], [], False

        total = len(valid_vals)

        # 1. Check for Booleans
        bool_matches = 0
        bool_coerced = []
        for v in valid_vals:
            if isinstance(v, bool):
                bool_matches += 1
                bool_coerced.append(v)
            elif str(v).strip().lower() in ["true", "false", "yes", "no"]:
                bool_matches += 1
                bool_coerced.append(str(v).strip().lower() in ["true", "yes"])
            else:
                bool_coerced.append(v)
        if bool_matches / total >= 0.90:
            return "boolean", bool_coerced, [], False

        # 2. Check for Dates / Datetime
        date_coerced, date_matches, ambig_date = self._try_parse_dates(valid_vals)
        if date_matches / total >= 0.85:
            # Check if any have time component
            has_time = any(isinstance(d, (datetime, pd.Timestamp)) and (d.hour or d.minute or d.second) for d in date_coerced if d is not None)
            dtype = "datetime" if has_time else "date"
            # Flag mixed non-date rows
            offending = [valid_excel_rows[i] for i, d in enumerate(date_coerced) if d is None]
            return dtype, date_coerced, offending, ambig_date

        # 3. Check for Numbers (currency, percent, float, integer)
        num_coerced, is_curr, is_pct, num_matches, mixed_rows = self._try_parse_numbers(valid_vals, valid_excel_rows)
        if num_matches / total >= 0.85:
            # Determine specific numeric type
            if is_curr:
                return "currency", num_coerced, mixed_rows, False
            if is_pct:
                return "percent", num_coerced, mixed_rows, False
            # Check if all integers
            valid_nums = [n for n in num_coerced if isinstance(n, (int, float))]
            if all(isinstance(n, int) or (isinstance(n, float) and n.is_integer()) for n in valid_nums):
                # Integer column
                int_coerced = [int(n) if isinstance(n, (int, float)) else n for n in num_coerced]
                return "integer", int_coerced, mixed_rows, False
            return "float", num_coerced, mixed_rows, False

        # Fallback to Text
        str_coerced = [str(v) for v in valid_vals]
        return "text", str_coerced, [], False

    def _try_parse_dates(self, vals: List[Any]) -> Tuple[List[Any], int, bool]:
        coerced = []
        matches = 0
        ambig_dates = False
        saw_day_gt_12 = False

        for v in vals:
            if isinstance(v, (datetime, date, pd.Timestamp)):
                matches += 1
                coerced.append(pd.to_datetime(v))
                continue
            
            s = str(v).strip()
            # Check for patterns like DD/MM/YYYY or MM/DD/YYYY
            date_match = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", s)
            if date_match:
                p1, p2, yr = int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3))
                if p1 > 12:
                    saw_day_gt_12 = True
                elif p1 <= 12 and p2 <= 12:
                    ambig_dates = True

            try:
                # Rule 8: Prefer day-first when any value has day > 12 in first position, or default to dayfirst
                dt = pd.to_datetime(s, dayfirst=True)
                coerced.append(dt)
                matches += 1
            except Exception:
                coerced.append(None)

        return coerced, matches, (ambig_dates and not saw_day_gt_12)

    def _try_parse_numbers(self, vals: List[Any], excel_rows: List[int]) -> Tuple[List[Any], bool, bool, int, List[int]]:
        coerced = []
        matches = 0
        currency_count = 0
        percent_count = 0
        mixed_rows = []

        for idx, v in enumerate(vals):
            if isinstance(v, (int, float, np.integer, np.floating)) and not np.isnan(v):
                matches += 1
                coerced.append(float(v))
                continue

            s = str(v).strip()
            # Rule 8: check currency symbols
            has_currency = any(sym in s for sym in CURRENCY_SYMBOLS) or "USD" in s or "LPA" in s
            if has_currency:
                currency_count += 1

            # Check percentage
            has_pct = "%" in s
            if has_pct:
                percent_count += 1

            # Parentheses negative: (100) -> -100
            is_paren_neg = s.startswith("(") and s.endswith(")")
            clean_s = re.sub(r'[\$\₹\€\£\¥\%\,\sUSDusdLPAlpa]', '', s)
            if is_paren_neg:
                clean_s = "-" + clean_s.strip("()")

            try:
                num = float(clean_s)
                # If percentage, store as percentage number (e.g. 85.0 for 85%)
                matches += 1
                coerced.append(num)
            except ValueError:
                coerced.append(v)
                mixed_rows.append(excel_rows[idx])

        is_curr = currency_count > 0 and (currency_count / matches >= 0.3 if matches > 0 else False)
        is_pct = percent_count > 0 and (percent_count / matches >= 0.3 if matches > 0 else False)

        return coerced, is_curr, is_pct, matches, mixed_rows
