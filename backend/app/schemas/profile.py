"""Pydantic schemas for spreadsheet profile, column metadata, and data quality."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field

class ColumnProfile(BaseModel):
    name: str
    original_name: str
    dtype: str  # integer, float, currency, percent, date, datetime, boolean, text, categorical, id-like
    null_count: int
    null_pct: float
    unique_count: int
    min: Optional[Union[float, int, str]] = None
    max: Optional[Union[float, int, str]] = None
    mean: Optional[float] = None
    top_values: List[Any] = Field(default_factory=list)
    sample_values: List[Any] = Field(default_factory=list)

class SheetShape(BaseModel):
    name: str
    row_count: int
    column_count: int

class MixedTypeItem(BaseModel):
    column: str
    offending_rows: List[int]
    sample_values: List[str]

class QualitySummary(BaseModel):
    has_empty_cells: bool = False
    empty_cells_count: int = 0
    duplicate_rows_count: int = 0
    duplicate_rows: List[int] = Field(default_factory=list)
    mixed_types: List[MixedTypeItem] = Field(default_factory=list)
    ambiguous_date_columns: List[str] = Field(default_factory=list)
    outlier_columns: Dict[str, List[int]] = Field(default_factory=dict)

class SheetProfile(BaseModel):
    sheet_name: str
    row_count: int
    column_count: int
    header_row: int  # 1-based original Excel row number of the detected header
    columns: List[ColumnProfile]
    warnings: List[str] = Field(default_factory=list)
    quality: QualitySummary = Field(default_factory=QualitySummary)

class WorkbookProfileSummary(BaseModel):
    file_id: str
    filename: str
    sheets: List[str]
    sheet_shapes: Dict[str, SheetShape]
    active_sheet: str
    profile: SheetProfile
    warnings: List[str] = Field(default_factory=list)
