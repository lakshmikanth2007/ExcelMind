"""Tests for deterministic Pandas query execution and evidence tracking."""

import pytest
from app.schemas.plan import (
    Agg,
    ColumnRef,
    ComparisonSide,
    DatePart,
    Filter,
    Having,
    Intent,
    Metric,
    Op,
    QueryPlan,
    Sort,
)
from app.services.query_executor import QueryExecutor
from app.services.spreadsheet_service import SpreadsheetParser

@pytest.fixture
def students_df():
    parser = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx")
    df, _ = parser.read_sheet("Students")
    return df

@pytest.fixture
def sales_df():
    parser = SpreadsheetParser("sample_data/sales_demo.xlsx", "xlsx")
    df, _ = parser.read_sheet("Orders")
    return df

def test_executor_filter_and_evidence(students_df):
    plan = QueryPlan(
        intent=Intent.filter,
        filters=[
            Filter(target=ColumnRef(column="Department"), op=Op.eq, value="CSE"),
            Filter(target=ColumnRef(column="CGPA"), op=Op.gte, value=8.5)
        ],
        interpretation="Find CSE students with CGPA >= 8.5"
    )
    executor = QueryExecutor(students_df)
    res_df, evidence, query_res = executor.execute(plan)

    # In sample_data/students_demo.xlsx:
    # CSE students: Aarav (9.4), Diya (8.8), Sneha (8.5), Meera (9.6), Siddharth (7.8), Riya (8.1)
    # CGPA >= 8.5 are Aarav, Diya, Sneha, Meera -> exactly 4 students!
    assert len(res_df) == 4
    assert evidence.matched_row_count == 4
    assert len(evidence.source_rows) == 4
    assert len(evidence.operation_steps) == 2
    # Verify Excel row numbers are tracked
    assert all(isinstance(r, int) for r in evidence.source_row_numbers)

def test_executor_group_aggregate_and_pct_of_total(students_df):
    plan = QueryPlan(
        intent=Intent.aggregate,
        group_by=[ColumnRef(column="Department")],
        metrics=[
            Metric(column="CGPA", agg=Agg.mean, alias="avg_cgpa"),
            Metric(column="Student ID", agg=Agg.count, alias="student_count", pct_of_total=True)
        ],
        sort=[Sort(by="student_count", direction="desc")],
        interpretation="Average CGPA and student count by Department"
    )
    executor = QueryExecutor(students_df)
    res_df, evidence, query_res = executor.execute(plan)

    assert "Department" in res_df.columns
    assert "avg_cgpa" in res_df.columns
    assert "student_count" in res_df.columns
    assert "student_count_pct" in res_df.columns
    # Total percentage should sum to approximately 100%
    assert abs(res_df["student_count_pct"].sum() - 100.0) < 0.1

def test_executor_having_clause(students_df):
    plan = QueryPlan(
        intent=Intent.aggregate,
        group_by=[ColumnRef(column="Department")],
        metrics=[
            Metric(column=None, agg=Agg.count, alias="dept_count")
        ],
        having=[
            Having(metric="dept_count", op=Op.gt, value=3)
        ],
        interpretation="Departments with more than 3 students"
    )
    executor = QueryExecutor(students_df)
    res_df, evidence, query_res = executor.execute(plan)

    # All resulting departments must have dept_count > 3
    assert (res_df["dept_count"] > 3).all()

def test_executor_date_part_grouping(sales_df):
    plan = QueryPlan(
        intent=Intent.aggregate,
        group_by=[ColumnRef(column="Order Date", date_part=DatePart.year)],
        metrics=[
            Metric(column="Sales", agg=Agg.sum, alias="total_sales")
        ],
        sort=[Sort(by="total_sales", direction="desc")],
        interpretation="Total sales by year"
    )
    executor = QueryExecutor(sales_df)
    res_df, evidence, query_res = executor.execute(plan)

    # Years 2023 and 2024 exist in sales_demo
    assert len(res_df) == 2
    assert "total_sales" in res_df.columns

def test_executor_compare(sales_df):
    plan = QueryPlan(
        intent=Intent.compare,
        group_by=[ColumnRef(column="Category")],
        metrics=[
            Metric(column="Sales", agg=Agg.sum, alias="sales_sum")
        ],
        compare=[
            ComparisonSide(
                label="Region_North",
                filters=[Filter(target=ColumnRef(column="Region"), op=Op.eq, value="North")]
            ),
            ComparisonSide(
                label="Region_South",
                filters=[Filter(target=ColumnRef(column="Region"), op=Op.eq, value="South")]
            )
        ],
        interpretation="Compare sales by Category between North and South"
    )
    executor = QueryExecutor(sales_df)
    res_df, evidence, query_res = executor.execute(plan)

    assert "sales_sum_Region_North" in res_df.columns
    assert "sales_sum_Region_South" in res_df.columns
    assert "sales_sum_delta" in res_df.columns
    assert "sales_sum_pct_change" in res_df.columns
