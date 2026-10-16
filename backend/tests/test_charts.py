"""Tests for auto chart suggestion and Plotly figure generation."""

import pytest
import pandas as pd
from app.services.chart_service import auto_suggest_chart, build_plotly_figure

def test_auto_suggest_bar_chart():
    df = pd.DataFrame({
        "Department": ["CSE", "ECE", "IT"],
        "Count": [6, 5, 4]
    })
    ctype, x, y = auto_suggest_chart(df)
    assert ctype == "bar"
    assert x == "Department"
    assert y == "Count"

def test_auto_suggest_line_chart():
    df = pd.DataFrame({
        "Order Date": ["2023-01-01", "2023-02-01", "2023-03-01"],
        "Sales": [1500.0, 2400.0, 3100.0]
    })
    ctype, x, y = auto_suggest_chart(df)
    assert ctype == "line"
    assert x == "Order Date"
    assert y == "Sales"

def test_auto_suggest_pie_chart():
    df = pd.DataFrame({
        "Region": ["North", "South", "East", "West"],
        "pct_share": [30.0, 25.0, 25.0, 20.0]
    })
    ctype, x, y = auto_suggest_chart(df)
    assert ctype == "pie"

def test_build_plotly_figure():
    df = pd.DataFrame({
        "City": ["New York", "Boston"],
        "Revenue": [120000.0, 85000.0]
    })
    fig = build_plotly_figure(df, "bar", "City", "Revenue", "Branch Revenue")
    assert fig is not None
    assert "plotly" in fig
    assert "data" in fig["plotly"]
    assert "layout" in fig["plotly"]
    assert fig["type"] == "bar"
    assert len(fig["plotly"]["data"]) == 1
