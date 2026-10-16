"""Tests ensuring missing values (empty, N/A, -, null) are never treated as zero."""

import pytest
import numpy as np
import pandas as pd
from app.services.spreadsheet_service import SpreadsheetParser, is_value_missing

def test_is_value_missing_logic():
    # 0 is NOT missing
    assert is_value_missing(0) is False
    assert is_value_missing(0.0) is False
    assert is_value_missing(False) is False

    # Missing markers
    assert is_value_missing(None) is True
    assert is_value_missing(np.nan) is True
    assert is_value_missing("") is True
    assert is_value_missing("   ") is True
    assert is_value_missing("-") is True
    assert is_value_missing("--") is True
    assert is_value_missing("N/A") is True
    assert is_value_missing("null") is True
    assert is_value_missing("NA") is True

def test_missing_vs_zero_in_quality_file():
    parser = SpreadsheetParser("sample_data/messy_quality.xlsx", "xlsx")
    df, profile = parser.read_sheet()

    # Find row with Record ID TX-104 (where Units Sold = 0, Revenue = 0.0)
    tx104 = df[df["Record ID"] == "TX-104"]
    assert len(tx104) == 1
    assert tx104["Units Sold"].iloc[0] == 0
    assert tx104["Revenue"].iloc[0] == 0.0

    # Find row with Record ID TX-105 (where Units Sold is empty None)
    tx105 = df[df["Record ID"] == "TX-105"]
    assert len(tx105) == 1
    assert tx105["Units Sold"].iloc[0] is None
    assert tx105["Revenue"].iloc[0] is None

    # Find row with Record ID TX-106 (where Units Sold is 'N/A' and Revenue is 'null')
    tx106 = df[df["Record ID"] == "TX-106"]
    assert len(tx106) == 1
    assert tx106["Units Sold"].iloc[0] is None
    assert tx106["Revenue"].iloc[0] is None
