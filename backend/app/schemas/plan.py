"""Query Plan schema in Pydantic v2 matching Section 6 specification."""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

class DatePart(str, Enum):
    year = "year"
    quarter = "quarter"
    month = "month"
    month_name = "month_name"
    week = "week"
    weekday = "weekday"
    day = "day"

class Agg(str, Enum):
    sum = "sum"
    mean = "mean"
    median = "median"
    min = "min"
    max = "max"
    count = "count"
    count_distinct = "count_distinct"
    std = "std"

class Op(str, Enum):
    eq = "eq"
    ne = "ne"
    gt = "gt"
    gte = "gte"
    lt = "lt"
    lte = "lte"
    in_ = "in_"
    not_in = "not_in"
    between = "between"
    contains = "contains"
    starts_with = "starts_with"
    ends_with = "ends_with"
    is_null = "is_null"
    not_null = "not_null"

class Intent(str, Enum):
    filter = "filter"
    lookup = "lookup"
    aggregate = "aggregate"
    top_n = "top_n"
    compare = "compare"
    distinct = "distinct"
    describe = "describe"
    clarify = "clarify"
    unsupported = "unsupported"

class ColumnRef(BaseModel):
    column: str                                     # must exist in schema
    date_part: Optional[DatePart] = None           # derived from a date column

class Filter(BaseModel):
    target: ColumnRef
    op: Op
    value: Optional[Union[str, int, float, bool, List[Any]]] = None
    case_sensitive: bool = False

class Metric(BaseModel):
    column: Optional[str] = None                    # None only valid with agg=count (row count)
    agg: Agg
    alias: Optional[str] = None
    pct_of_total: bool = False

class Sort(BaseModel):
    by: str                                         # group_by label, metric alias/column, or schema column
    direction: Literal["asc", "desc"] = "desc"

class Having(BaseModel):
    metric: str                                     # metric alias
    op: Op
    value: Union[int, float, List[Union[int, float]]]

class ComparisonSide(BaseModel):
    label: str
    filters: List[Filter] = Field(default_factory=list)

class QueryPlan(BaseModel):
    intent: Intent
    sheet: Optional[str] = None
    filters: List[Filter] = Field(default_factory=list)               # AND-combined
    filters_any: List[List[Filter]] = Field(default_factory=list)     # OR-groups (each inner is AND; groups are OR-ed)
    group_by: List[ColumnRef] = Field(default_factory=list)
    metrics: List[Metric] = Field(default_factory=list)
    having: List[Having] = Field(default_factory=list)
    select_columns: List[str] = Field(default_factory=list)           # for filter/lookup: empty = all
    sort: List[Sort] = Field(default_factory=list)
    limit: Optional[int] = Field(default=None, ge=1, le=1000)
    compare: List[ComparisonSide] = Field(default_factory=list)       # exactly 2 for intent=compare
    chart: Literal["bar", "line", "pie", "scatter", "histogram", "none"] = "none"
    chart_x: Optional[str] = None
    chart_y: Optional[str] = None
    clarification_question: Optional[str] = None
    clarification_options: List[str] = Field(default_factory=list)
    unsupported_reason: Optional[str] = None
    interpretation: str                                              # one-sentence restatement in plain English
    confidence: Literal["high", "medium", "low"] = "high"

class Evidence(BaseModel):
    plan_plain_english: str
    operation_steps: List[str] = Field(default_factory=list)
    matched_row_count: int
    source_rows: List[Dict[str, Any]] = Field(default_factory=list)    # up to 200 source rows with __row__
    source_row_numbers: List[int] = Field(default_factory=list)        # up to 2000 row numbers
    skipped_missing: Dict[str, int] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)

class QueryResult(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_matches: int
    truncated: bool = False

class QueryResponse(BaseModel):
    result_id: str
    session_id: str
    status: Literal["ok", "clarify", "unsupported", "error"]
    answer: str
    interpretation: str
    result: QueryResult
    evidence: Evidence
    chart: Optional[Dict[str, Any]] = None
    clarification: Optional[Dict[str, Any]] = None
    plan: Optional[QueryPlan] = None
    warnings: List[str] = Field(default_factory=list)
    latency_ms: float = 0.0
    trace_id: str
