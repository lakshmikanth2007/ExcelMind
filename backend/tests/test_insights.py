"""Tests for automated insights generation on messy real-world datasets."""

import pytest
from app.services.insight_service import generate_insights_report
from app.services.spreadsheet_service import SpreadsheetParser

def test_insights_on_messy_quality_file():
    parser = SpreadsheetParser("sample_data/messy_quality.xlsx", "xlsx")
    df, profile = parser.read_sheet("QualityAudit")

    report = generate_insights_report(df, profile)

    categories = [i.category for i in report.insights]
    # Injected issues in messy_quality:
    assert "missing_data" in categories
    assert "duplicates" in categories
    assert "mixed_types" in categories
    assert "outliers" in categories

    # Outlier insight wording must say "unusual value", NEVER "error" or "fraud" (Section 12)
    outlier_insights = [i for i in report.insights if i.category == "outliers"]
    for oi in outlier_insights:
        assert "unusual value" in oi.title.lower() or "unusual value" in oi.detail.lower()
        assert "fraud" not in oi.detail.lower()
        assert "fraud" not in oi.title.lower()

    # Verify suggested questions
    assert len(report.suggested_questions) >= 5
    assert len(report.dashboard_charts) >= 1
