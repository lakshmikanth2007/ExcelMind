"""Tests for query plan semantic validation and fuzzy resolution."""

import pytest
from app.core.errors import UnprocessableEntityError
from app.schemas.plan import (
    Agg,
    ColumnRef,
    DatePart,
    Filter,
    Having,
    Intent,
    Metric,
    Op,
    QueryPlan,
    Sort,
)
from app.services.query_validator import validate_query_plan
from app.services.spreadsheet_service import SpreadsheetParser

@pytest.fixture
def students_profile():
    parser = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx")
    _, profile = parser.read_sheet("Students")
    return profile

def test_validator_unknown_column_with_suggestion(students_profile):
    # 'Departmnt' typo
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[
            Filter(target=ColumnRef(column="Departmnt"), op=Op.eq, value="CSE")
        ],
        interpretation="Filter by typo column"
    )
    with pytest.raises(UnprocessableEntityError) as exc_info:
        validate_query_plan(plan, students_profile)
    assert "Did you mean: Department" in exc_info.value.message

def test_validator_incompatible_op(students_profile):
    # 'gt' on text column 'Department'
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[
            Filter(target=ColumnRef(column="Department"), op=Op.gt, value="CSE")
        ],
        interpretation="Incompatible op on text column"
    )
    with pytest.raises(UnprocessableEntityError) as exc_info:
        validate_query_plan(plan, students_profile)
    assert "cannot be used on text column" in exc_info.value.message

def test_validator_between_requires_two_values(students_profile):
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[
            Filter(target=ColumnRef(column="CGPA"), op=Op.between, value=[8.0])
        ],
        interpretation="Between with 1 value"
    )
    with pytest.raises(UnprocessableEntityError) as exc_info:
        validate_query_plan(plan, students_profile)
    assert "requires exactly 2 values" in exc_info.value.message

def test_validator_metric_on_non_numeric(students_profile):
    # sum on Name
    plan = QueryPlan(
        intent=Intent.aggregate,
        metrics=[
            Metric(column="Name", agg=Agg.sum)
        ],
        interpretation="Sum on string column"
    )
    with pytest.raises(UnprocessableEntityError) as exc_info:
        validate_query_plan(plan, students_profile)
    assert "requires numeric column" in exc_info.value.message

def test_validator_fuzzy_value_resolution(students_profile):
    # 'Chenai' -> 'Chennai' for City (score >= 90 per spec Section 8)
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[
            Filter(target=ColumnRef(column="City"), op=Op.eq, value="Chenai")
        ],
        interpretation="Filter city with slight typo"
    )
    res = validate_query_plan(plan, students_profile)
    assert res.plan.filters[0].value == "Chennai"
    assert any("Matched 'Chenai' to 'Chennai'" in w for w in res.warnings)
