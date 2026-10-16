"""Tests for deterministic keyword search and structured filtering without LLM."""

import pytest
from app.services.search_service import keyword_search, apply_structured_filter
from app.services.spreadsheet_service import SpreadsheetParser
from app.schemas.plan import ColumnRef, Filter, Op

@pytest.fixture
def students_df():
    parser = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx")
    df, _ = parser.read_sheet("Students")
    return df

def test_keyword_search_across_columns(students_df):
    res = keyword_search(students_df, "Google")
    assert res["total_matches"] == 1
    assert len(res["rows"]) == 1
    assert res["rows"][0]["Name"] == "Aarav Sharma"

def test_keyword_search_case_insensitive(students_df):
    res = keyword_search(students_df, "bengaluru")
    assert res["total_matches"] > 0
    for r in res["rows"]:
        assert "bengaluru" in r["City"].lower()

def test_structured_filter_no_llm(students_df):
    filters = [
        Filter(target=ColumnRef(column="Department"), op=Op.eq, value="IT")
    ]
    res_df, out = apply_structured_filter(students_df, filters)
    assert len(res_df) == 4
    assert out["total_matches"] == 4
