"""Tests for type inference, currency strings, percents, negative parentheses, and mixed types."""

import pytest
import os
from app.services.spreadsheet_service import SpreadsheetParser

def test_currency_and_negative_parentheses_types():
    parser = SpreadsheetParser("sample_data/messy_headers.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    col_map = {col.name: col for col in profile.columns}
    rev_col = col_map.get("Revenue (USD)")
    profit_col = col_map.get("Net Profit")
    target_col = col_map.get("Target Met %")

    assert rev_col is not None
    assert rev_col.dtype in ["currency", "float"]
    assert rev_col.min is not None and rev_col.min > 0

    # Net Profit has negative parentheses like ($6,500.00) in row 8 (BR-104)
    assert profit_col is not None
    assert profit_col.dtype in ["currency", "float"]
    # Check that ($6,500.00) was parsed as negative float -6500.0
    detroit_row = df[df["City"] == "Detroit"]
    assert len(detroit_row) == 1
    assert float(detroit_row["Net Profit"].iloc[0]) == -6500.0

    # Target Met % has 112.5%
    assert target_col is not None
    assert target_col.dtype in ["percent", "float"]
    assert float(df["Target Met %"].iloc[0]) == 112.5

def test_mixed_types_detection():
    parser = SpreadsheetParser("sample_data/messy_quality.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    # In messy_quality.xlsx, Units Sold and Revenue have mixed string values like "Pending", "Unknown"
    mixed_col_names = [m.column for m in profile.quality.mixed_types]
    assert "Units Sold" in mixed_col_names or "Revenue" in mixed_col_names

    # Offending rows must be recorded with Excel row numbers
    for m in profile.quality.mixed_types:
        if m.column == "Units Sold":
            assert len(m.offending_rows) > 0
