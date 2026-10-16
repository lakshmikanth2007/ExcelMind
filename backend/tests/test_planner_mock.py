"""Tests for query planner with MockLLM, validation retries, and follow-up context."""

import pytest
from app.schemas.plan import Intent, QueryPlan
from app.services.llm_service import MockLLM
from app.services.query_planner import QueryPlanner
from app.services.spreadsheet_service import SpreadsheetParser

@pytest.fixture
def students_profile():
    parser = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx")
    _, profile = parser.read_sheet("Students")
    return profile

def test_planner_valid_plan(students_profile):
    mock = MockLLM()
    mock.register_plan("placed students", {
        "intent": "filter",
        "filters": [
            {"target": {"column": "Placement Status"}, "op": "eq", "value": "Placed"}
        ],
        "interpretation": "Listing placed students",
        "confidence": "high"
    })
    planner = QueryPlanner(llm_service=mock)
    plan, warnings = planner.generate_plan("placed students", students_profile)

    assert plan.intent == Intent.filter
    assert plan.filters[0].target.column == "Placement Status"
    assert plan.confidence == "high"

def test_planner_retry_on_invalid_output(students_profile):
    """First attempt returns invalid column, second attempt corrects it."""
    class RetryingMockLLM:
        def __init__(self):
            self.call_count = 0

        def plan(self, system: str, user: str, schema: dict) -> dict:
            self.call_count += 1
            if self.call_count == 1:
                # Invalid column 'NonExistent'
                return {
                    "intent": "filter",
                    "filters": [{"target": {"column": "NonExistent"}, "op": "eq", "value": "Test"}],
                    "interpretation": "Bad column plan",
                    "confidence": "high"
                }
            else:
                # Corrected column on retry
                return {
                    "intent": "filter",
                    "filters": [{"target": {"column": "Department"}, "op": "eq", "value": "CSE"}],
                    "interpretation": "Corrected plan",
                    "confidence": "high"
                }

        def rephrase(self, s, u): return u

    mock = RetryingMockLLM()
    planner = QueryPlanner(llm_service=mock)
    plan, warnings = planner.generate_plan("filter cse", students_profile)

    assert mock.call_count == 2
    assert plan.intent == Intent.filter
    assert plan.filters[0].target.column == "Department"
    assert any("retry" in w.lower() for w in warnings)
