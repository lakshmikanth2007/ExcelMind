"""Pydantic schemas for automated data-quality and statistical insights."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

class InsightItem(BaseModel):
    id: str
    category: Literal["data_quality", "missing_data", "duplicates", "mixed_types", "outliers", "trends", "correlation"]
    severity: Literal["info", "warning"]
    title: str
    detail: str
    affected_rows: List[int] = Field(default_factory=list)
    question_to_ask: Optional[str] = None

class DashboardChartSpec(BaseModel):
    id: str
    title: str
    chart_type: Literal["bar", "line", "pie", "scatter", "histogram"]
    x: str
    y: Optional[str] = None
    plotly: Dict[str, Any]

class KpiCard(BaseModel):
    id: str
    label: str
    value: str
    subtext: Optional[str] = None
    change_type: Optional[Literal["neutral", "positive", "negative", "highlight"]] = "neutral"
    icon: Optional[str] = None

class InsightReport(BaseModel):
    sheet_name: str
    row_count: int
    column_count: int
    header_row: int
    summary_text: str
    data_health_score: Optional[float] = 100.0
    kpi_cards: List[KpiCard] = Field(default_factory=list)
    insights: List[InsightItem] = Field(default_factory=list)
    suggested_questions: List[str] = Field(default_factory=list)
    dashboard_charts: List[DashboardChartSpec] = Field(default_factory=list)
