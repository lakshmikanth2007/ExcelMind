"""Semantic validation of QueryPlans against spreadsheet schema and type compatibility."""

import re
from typing import Any, Dict, List, Optional, Set, Tuple
from rapidfuzz import process, fuzz

from app.core.errors import UnprocessableEntityError
from app.schemas.plan import (
    Agg,
    DatePart,
    Filter,
    Intent,
    Metric,
    Op,
    QueryPlan,
)
from app.schemas.profile import ColumnProfile, SheetProfile

NUMERIC_TYPES = {"integer", "float", "currency", "percent"}
DATE_TYPES = {"date", "datetime"}
TEXT_TYPES = {"text", "categorical", "id-like"}

class ValidationResult:
    def __init__(self, plan: QueryPlan, warnings: Optional[List[str]] = None):
        self.plan = plan
        self.warnings: List[str] = warnings or []

def find_closest_columns(col_name: str, valid_columns: List[str], limit: int = 3) -> List[str]:
    """Suggest closest matching columns using RapidFuzz."""
    if not valid_columns:
        return []
    matches = process.extract(col_name, valid_columns, scorer=fuzz.ratio, limit=limit)
    return [m[0] for m in matches if m[1] >= 50]

def validate_query_plan(plan: QueryPlan, profile: SheetProfile) -> ValidationResult:
    warnings: List[str] = []
    col_map: Dict[str, ColumnProfile] = {col.name: col for col in profile.columns}
    valid_col_names = list(col_map.keys())

    # Special intents validation
    if plan.intent == Intent.clarify:
        if not plan.clarification_question:
            raise UnprocessableEntityError("Clarification intent requires clarification_question.")
        return ValidationResult(plan, warnings)

    if plan.intent == Intent.unsupported:
        if not plan.unsupported_reason:
            raise UnprocessableEntityError("Unsupported intent requires unsupported_reason.")
        return ValidationResult(plan, warnings)

    if plan.intent == Intent.compare:
        if len(plan.compare) != 2:
            raise UnprocessableEntityError(f"Compare intent requires exactly 2 comparison sides, got {len(plan.compare)}.")

    # Complexity limits
    if len(plan.filters) > 20:
        raise UnprocessableEntityError("Maximum 20 filters allowed.")
    if len(plan.group_by) > 5:
        raise UnprocessableEntityError("Maximum 5 group_by columns allowed.")
    if len(plan.metrics) > 10:
        raise UnprocessableEntityError("Maximum 10 metrics allowed.")
    if plan.limit is not None and (plan.limit < 1 or plan.limit > 1000):
        raise UnprocessableEntityError("Limit must be between 1 and 1000.")

    # Validate all filter columns and ops
    all_filters = list(plan.filters)
    for or_group in plan.filters_any:
        all_filters.extend(or_group)
    for comp in plan.compare:
        all_filters.extend(comp.filters)

    for flt in all_filters:
        target_col = flt.target.column
        if target_col not in col_map:
            suggestions = find_closest_columns(target_col, valid_col_names)
            sugg_str = f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
            raise UnprocessableEntityError(f"Column '{target_col}' not found in schema.{sugg_str}")

        col_prof = col_map[target_col]
        dtype = col_prof.dtype

        # Date part on non-date column
        if flt.target.date_part and dtype not in DATE_TYPES:
            raise UnprocessableEntityError(
                f"Date part '{flt.target.date_part}' cannot be applied to non-date column '{target_col}' (type: {dtype})."
            )

        # Validate Op compatibility with dtype
        _validate_op_dtype_compatibility(flt.op, dtype, target_col, bool(flt.target.date_part))

        # Validate Filter value structure
        if flt.op == Op.between:
            if not isinstance(flt.value, (list, tuple)) or len(flt.value) != 2:
                raise UnprocessableEntityError(f"Filter operation 'between' on '{target_col}' requires exactly 2 values.")
        elif flt.op in [Op.in_, Op.not_in]:
            if not isinstance(flt.value, (list, tuple)):
                raise UnprocessableEntityError(f"Filter operation '{flt.op.value}' on '{target_col}' requires a list of values.")
        elif flt.op in [Op.is_null, Op.not_null]:
            if flt.value is not None:
                # Value should be None for null checks
                flt.value = None
        else:
            # Single value op
            if isinstance(flt.value, (list, tuple)):
                raise UnprocessableEntityError(f"Filter operation '{flt.op.value}' does not accept a list value.")

        # Fuzzy value resolution for categorical / text columns (Section 8)
        if dtype in ["categorical", "text"] and flt.op in [Op.eq, Op.in_] and col_prof.top_values:
            known_vals = [str(tv) for tv in col_prof.top_values if tv is not None]
            if flt.op == Op.eq and isinstance(flt.value, str):
                orig_val = flt.value.strip()
                # Check exact match
                if not any(orig_val.lower() == kv.lower() for kv in known_vals):
                    best_match = process.extractOne(orig_val, known_vals, scorer=fuzz.ratio)
                    if best_match and best_match[1] >= 90:
                        resolved_val = best_match[0]
                        warnings.append(f"Matched '{orig_val}' to '{resolved_val}' for column '{target_col}'.")
                        flt.value = resolved_val

    # Validate group_by
    for g in plan.group_by:
        if g.column not in col_map:
            suggestions = find_closest_columns(g.column, valid_col_names)
            sugg_str = f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
            raise UnprocessableEntityError(f"Group by column '{g.column}' not found in schema.{sugg_str}")
        if g.date_part and col_map[g.column].dtype not in DATE_TYPES:
            raise UnprocessableEntityError(f"Cannot extract date part '{g.date_part}' from non-date column '{g.column}'.")

    # Validate metrics
    produced_metrics: Set[str] = set()
    for m in plan.metrics:
        if m.column:
            if m.column not in col_map:
                suggestions = find_closest_columns(m.column, valid_col_names)
                sugg_str = f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
                raise UnprocessableEntityError(f"Metric column '{m.column}' not found in schema.{sugg_str}")
            m_dtype = col_map[m.column].dtype
            if m.agg in [Agg.sum, Agg.mean, Agg.median, Agg.std] and m_dtype not in NUMERIC_TYPES:
                raise UnprocessableEntityError(
                    f"Aggregation '{m.agg.value}' requires numeric column, but '{m.column}' is '{m_dtype}'."
                )
        else:
            if m.agg != Agg.count:
                raise UnprocessableEntityError(f"Metric without column is only valid for 'count' aggregation, got '{m.agg.value}'.")

        metric_name = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
        produced_metrics.add(metric_name)

    # Validate sort targets
    valid_sort_targets = set(valid_col_names) | produced_metrics | {g.column for g in plan.group_by}
    for s in plan.sort:
        if s.by not in valid_sort_targets:
            raise UnprocessableEntityError(f"Cannot sort by '{s.by}'; must be one of {sorted(valid_sort_targets)}.")

    # Validate having
    for h in plan.having:
        if h.metric not in produced_metrics:
            raise UnprocessableEntityError(f"Having clause references unknown metric '{h.metric}'. Available: {sorted(produced_metrics)}.")

    return ValidationResult(plan, warnings)

def _validate_op_dtype_compatibility(op: Op, dtype: str, col_name: str, has_date_part: bool):
    if has_date_part:
        # Date part converts to integer or categorical string
        return

    if dtype in TEXT_TYPES:
        if op in [Op.gt, Op.gte, Op.lt, Op.lte]:
            raise UnprocessableEntityError(f"Comparison operation '{op.value}' cannot be used on text column '{col_name}'.")
    elif dtype in NUMERIC_TYPES:
        if op in [Op.contains, Op.starts_with, Op.ends_with]:
            raise UnprocessableEntityError(f"String operation '{op.value}' cannot be used on numeric column '{col_name}'.")
    elif dtype in DATE_TYPES:
        if op in [Op.contains, Op.starts_with, Op.ends_with]:
            raise UnprocessableEntityError(f"String operation '{op.value}' cannot be used on date column '{col_name}'.")
