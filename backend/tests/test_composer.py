"""Tests for answer composition, formatting, and rephrase number guard."""

import pytest
from app.core.config import settings
from app.schemas.plan import Agg, ColumnRef, Evidence, Intent, Metric, QueryPlan, QueryResult
from app.services.answer_composer import AnswerComposer, extract_numbers_from_text
from app.services.llm_service import MockLLM
from app.services.spreadsheet_service import SpreadsheetParser

@pytest.fixture
def students_profile():
    parser = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx")
    _, profile = parser.read_sheet("Students")
    return profile

def test_extract_numbers():
    text = "The average salary is $24,500.50 across 15 students with 92% attendance."
    nums = extract_numbers_from_text(text)
    assert 24500.5 in nums
    assert 15.0 in nums
    assert 92.0 in nums

def test_composer_deterministic_aggregate(students_profile):
    plan = QueryPlan(
        intent=Intent.aggregate,
        metrics=[Metric(column="CGPA", agg=Agg.mean, alias="avg_cgpa")],
        interpretation="Average CGPA"
    )
    result = QueryResult(
        columns=["avg_cgpa"],
        rows=[{"avg_cgpa": 8.42}],
        total_matches=1
    )
    evidence = Evidence(
        plan_plain_english="Calculated mean(CGPA)",
        matched_row_count=20,
        source_rows=[]
    )
    composer = AnswerComposer()
    ans = composer.compose(plan, result, evidence, students_profile)

    assert "8.42" in ans
    assert "20 matched rows" in ans

def test_composer_rejects_altered_numbers(students_profile, monkeypatch):
    monkeypatch.setattr(settings, "LLM_REPHRASE", True)

    class AlteringLLM:
        def plan(self, s, u, sc): return {}
        def rephrase(self, system: str, user: str) -> str:
            # Malicious/hallucinated number 999.0 instead of real numbers
            return "The average CGPA is 999.0!"

    plan = QueryPlan(
        intent=Intent.aggregate,
        metrics=[Metric(column="CGPA", agg=Agg.mean, alias="avg_cgpa")],
        interpretation="Average CGPA"
    )
    result = QueryResult(
        columns=["avg_cgpa"],
        rows=[{"avg_cgpa": 8.42}],
        total_matches=1
    )
    evidence = Evidence(
        plan_plain_english="Calculated mean(CGPA)",
        matched_row_count=20
    )

    composer = AnswerComposer(llm_service=AlteringLLM())
    ans = composer.compose(plan, result, evidence, students_profile)

    # Hallucinated 999.0 must be rejected and discarded in favor of deterministic 8.42!
    assert "999" not in ans
    assert "8.42" in ans

def test_composer_filter_multi_row_has_accurate_highlights(students_profile):
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[],
        interpretation="View students"
    )
    result = QueryResult(
        columns=["Student_Name", "CGPA"],
        rows=[
            {"Student_Name": "Alice", "CGPA": 9.2},
            {"Student_Name": "Bob", "CGPA": 8.1},
            {"Student_Name": "Charlie", "CGPA": 8.7},
        ],
        total_matches=76
    )
    evidence = Evidence(
        plan_plain_english="Loaded records",
        matched_row_count=76
    )
    composer = AnswerComposer()
    ans = composer.compose(plan, result, evidence, students_profile)

    # Must NOT have generic repetitive message
    assert "Found 76 matching rows matching your criteria" not in ans
    # Must have factual stats and details
    assert "76" in ans
    assert "Alice" in ans or "CGPA" in ans
