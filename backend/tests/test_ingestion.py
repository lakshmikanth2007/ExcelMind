"""Tests for spreadsheet file ingestion, magic byte verification, header detection, and merged cells."""

import pytest
import os
import openpyxl
from io import BytesIO
from app.services.file_service import validate_and_save_upload
from app.services.spreadsheet_service import SpreadsheetParser
from app.core.errors import UnsupportedMediaTypeError, PayloadTooLargeError

def test_reject_unsupported_extensions():
    with pytest.raises(UnsupportedMediaTypeError) as exc_info:
        validate_and_save_upload("script.exe", b"MZ...", "owner_test")
    assert "not supported" in exc_info.value.message

def test_reject_macro_workbooks():
    with pytest.raises(UnsupportedMediaTypeError) as exc_info:
        validate_and_save_upload("report.xlsm", b"PK\x03\x04...", "owner_test")
    assert "not supported" in exc_info.value.message

def test_magic_byte_mismatch_xlsx():
    with pytest.raises(UnsupportedMediaTypeError) as exc_info:
        validate_and_save_upload("fake.xlsx", b"NOT_A_ZIP_HEADER", "owner_test")
    assert "Invalid XLSX file content" in exc_info.value.message

def test_csv_encoding_fallback(tmp_path):
    csv_file = tmp_path / "latin.csv"
    # Write Latin-1 content
    content = "Name,City,Note\nRené,Montréal,Café\n".encode("latin-1")
    csv_file.write_bytes(content)

    parser = SpreadsheetParser(str(csv_file), "csv")
    df, profile = parser.read_sheet()
    assert len(df) == 1
    assert "Montréal" in df["City"].iloc[0]
    assert profile.row_count == 1

def test_messy_headers_detection():
    # Test on the generated sample_data/messy_headers.xlsx
    assert os.path.exists("sample_data/messy_headers.xlsx")
    parser = SpreadsheetParser("sample_data/messy_headers.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    # In messy_headers.xlsx: header was on row 4!
    assert profile.header_row == 4
    # Columns detected should be Branch Code, City, Region, etc.
    assert "Branch Code" in df.columns
    assert "Revenue (USD)" in df.columns
    assert len(df) == 10
    # Original Excel row for first data item should be row 5
    assert df["__row__"].iloc[0] == 5

def test_merged_cells_handled():
    parser = SpreadsheetParser("sample_data/messy_headers.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    # In messy_headers.xlsx: rows 5 and 6 had C5:C6 merged for Region (East)
    assert any("merged cell" in w.lower() for w in profile.warnings)
    assert df["Region"].iloc[0] == "East"
    assert df["Region"].iloc[1] == "East"
