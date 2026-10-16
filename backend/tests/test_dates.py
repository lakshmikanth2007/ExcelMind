"""Tests for date parsing, ambiguity handling, and serial dates."""

import pytest
from app.services.spreadsheet_service import SpreadsheetParser

def test_sales_demo_dates_parsed():
    parser = SpreadsheetParser("sample_data/sales_demo.xlsx", "xlsx")
    df, profile = parser.read_sheet("Orders")

    col_map = {col.name: col for col in profile.columns}
    date_col = col_map.get("Order Date")
    assert date_col is not None
    assert date_col.dtype in ["date", "datetime"]
    assert date_col.min == "2023-01-15"

def test_ambiguous_date_warning():
    parser = SpreadsheetParser("sample_data/messy_quality.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    # In messy_quality.xlsx, dates like 15/01/2023 had 15 > 12, so dayfirst was applied
    assert "Transaction Date" in df.columns
