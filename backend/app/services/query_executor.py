"""Deterministic Pandas query execution engine with evidence generation and strict timeout limits."""

import math
import time
import pandas as pd
import numpy as np
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple, Set

from app.core.config import settings
from app.core.errors import BadRequestError, UnprocessableEntityError
from app.schemas.plan import (
    Agg,
    ComparisonSide,
    DatePart,
    Evidence,
    Filter,
    Having,
    Intent,
    Metric,
    Op,
    QueryPlan,
    QueryResult,
    Sort,
)

def build_plain_english_plan(plan: QueryPlan) -> str:
    """Deterministically convert a QueryPlan into clear, unambiguous plain English."""
    parts = []

    # Filters
    if plan.filters:
        filter_descs = []
        for f in plan.filters:
            col = f.target.column
            if f.target.date_part:
                col = f"{f.target.date_part.value} of {col}"
            filter_descs.append(f"{col} {f.op.value} '{f.value}'" if f.value is not None else f"{col} {f.op.value}")
        parts.append(f"Filtered where {' and '.join(filter_descs)}")

    if plan.filters_any:
        or_descs = []
        for group in plan.filters_any:
            g_descs = [f"{g.target.column} {g.op.value} '{g.value}'" for g in group]
            or_descs.append(f"({' and '.join(g_descs)})")
        parts.append(f"Applied OR condition: {' or '.join(or_descs)}")

    # Group by & Metrics
    if plan.group_by:
        gb_cols = [f"{g.date_part.value + ' of ' if g.date_part else ''}{g.column}" for g in plan.group_by]
        parts.append(f"Grouped by {', '.join(gb_cols)}")

    if plan.metrics:
        metric_descs = []
        for m in plan.metrics:
            col = m.column or "rows"
            desc = f"{m.agg.value}({col})"
            if m.pct_of_total:
                desc += " as % of total"
            metric_descs.append(desc)
        parts.append(f"Calculated {', '.join(metric_descs)}")

    # Sort & Limit
    if plan.sort:
        sort_descs = [f"{s.by} ({s.direction})" for s in plan.sort]
        parts.append(f"Sorted by {', '.join(sort_descs)}")

    if plan.limit:
        parts.append(f"Limited to top {plan.limit} rows")

    if not parts:
        return "Loaded all rows from active sheet"
    return " → ".join(parts)

class QueryExecutor:
    def __init__(self, df: pd.DataFrame):
        # Work strictly on a copy, never mutate original
        self.df = df.copy()

    def execute(self, plan: QueryPlan, timeout_s: Optional[int] = None) -> Tuple[pd.DataFrame, Evidence, QueryResult]:
        start_time = time.time()
        timeout = timeout_s or settings.QUERY_TIMEOUT_S
        warnings: List[str] = []
        operation_steps: List[str] = []
        skipped_missing: Dict[str, int] = {}

        df = self.df.copy()
        initial_count = len(df)

        # 1. Apply primary AND filters
        for flt in plan.filters:
            if time.time() - start_time > timeout:
                raise UnprocessableEntityError("Query timed out during filter execution.")
            mask, step_desc = self._build_filter_mask(df, flt)
            df = df[mask]
            operation_steps.append(f"{step_desc} ({len(df)} rows remaining)")

        # 2. Apply OR-groups (filters_any)
        if plan.filters_any:
            or_mask = pd.Series(False, index=df.index)
            for group in plan.filters_any:
                group_mask = pd.Series(True, index=df.index)
                for g_flt in group:
                    f_mask, _ = self._build_filter_mask(df, g_flt)
                    group_mask = group_mask & f_mask
                or_mask = or_mask | group_mask
            df = df[or_mask]
            operation_steps.append(f"Applied OR conditions ({len(df)} rows remaining)")

        matched_row_count = len(df)

        # Retain source rows for evidence BEFORE grouping/aggregation
        source_row_numbers = df["__row__"].tolist()[:2000] if "__row__" in df.columns else []
        source_df_preview = df.head(200)
        source_rows = self._clean_records(source_df_preview)

        # 3. Derive Date Parts if needed
        for g in plan.group_by:
            if g.date_part:
                col_name = self._derive_date_part_column(df, g.column, g.date_part)
                g.column = col_name  # redirect group_by to derived column name

        # 4. Handle specific intents
        if plan.intent == Intent.compare:
            result_df, comp_steps, comp_skipped = self._execute_compare(plan, df)
            operation_steps.extend(comp_steps)
            skipped_missing.update(comp_skipped)

        elif plan.intent == Intent.distinct:
            result_df, dist_steps = self._execute_distinct(plan, df)
            operation_steps.extend(dist_steps)

        elif plan.intent == Intent.describe:
            result_df, desc_steps = self._execute_describe(plan, df)
            operation_steps.extend(desc_steps)

        elif plan.group_by or plan.metrics:
            result_df, agg_steps, agg_skipped = self._execute_group_aggregate(plan, df)
            operation_steps.extend(agg_steps)
            skipped_missing.update(agg_skipped)

        else:
            # Simple filter / lookup
            result_df = df.copy()
            if plan.select_columns:
                cols_to_keep = [c for c in plan.select_columns if c in result_df.columns]
                if "__row__" in result_df.columns and "__row__" not in cols_to_keep:
                    cols_to_keep.append("__row__")
                result_df = result_df[cols_to_keep]

        # 5. Apply Having clause
        for h in plan.having:
            if h.metric in result_df.columns:
                h_mask = self._build_scalar_mask(result_df[h.metric], h.op, h.value)
                result_df = result_df[h_mask]
                operation_steps.append(f"Having {h.metric} {h.op.value} {h.value} ({len(result_df)} rows)")

        # 6. Apply Sorting
        if plan.sort:
            by_cols = [s.by for s in plan.sort if s.by in result_df.columns]
            ascending = [s.direction == "asc" for s in plan.sort if s.by in result_df.columns]
            if by_cols:
                result_df = result_df.sort_values(by=by_cols, ascending=ascending)
                operation_steps.append(f"Sorted by {', '.join(by_cols)}")

        # 7. Apply Limit
        total_matches = len(result_df)
        if plan.limit:
            result_df = result_df.head(plan.limit)
            operation_steps.append(f"Limited output to top {plan.limit} items")

        # Cap results returned to client at 500 rows per Section 9
        truncated = total_matches > 500
        client_df = result_df.head(500)
        client_rows = self._clean_records(client_df)
        columns = list(result_df.columns)

        evidence = Evidence(
            plan_plain_english=build_plain_english_plan(plan),
            operation_steps=operation_steps,
            matched_row_count=matched_row_count,
            source_rows=source_rows,
            source_row_numbers=source_row_numbers,
            skipped_missing=skipped_missing,
            warnings=warnings
        )

        query_result = QueryResult(
            columns=columns,
            rows=client_rows,
            total_matches=total_matches,
            truncated=truncated
        )

        return result_df, evidence, query_result

    def _build_filter_mask(self, df: pd.DataFrame, flt: Filter) -> Tuple[pd.Series, str]:
        col = flt.target.column
        if flt.target.date_part:
            temp_col = self._derive_date_part_column(df, col, flt.target.date_part)
            series = df[temp_col]
            desc_col = f"{flt.target.date_part.value} of {col}"
        else:
            series = df[col]
            desc_col = col

        mask = self._build_scalar_mask(series, flt.op, flt.value, flt.case_sensitive)
        val_str = f"'{flt.value}'" if flt.value is not None else ""
        step_desc = f"Filtered {desc_col} {flt.op.value} {val_str}".strip()
        return mask, step_desc

    def _build_scalar_mask(self, series: pd.Series, op: Op, val: Any, case_sensitive: bool = False) -> pd.Series:
        if op == Op.is_null:
            return series.isna() | series.isnull()
        if op == Op.not_null:
            return series.notna() & (~series.isnull())

        # For null values in comparison, they don't match
        valid_mask = series.notna()

        if op == Op.eq:
            if isinstance(val, str) and not case_sensitive:
                return valid_mask & (series.astype(str).str.strip().str.lower() == val.strip().lower())
            return valid_mask & (series == val)

        if op == Op.ne:
            if isinstance(val, str) and not case_sensitive:
                return valid_mask & (series.astype(str).str.strip().str.lower() != val.strip().lower())
            return valid_mask & (series != val)

        if op == Op.gt:
            return valid_mask & (pd.to_numeric(series, errors="coerce") > float(val))
        if op == Op.gte:
            return valid_mask & (pd.to_numeric(series, errors="coerce") >= float(val))
        if op == Op.lt:
            return valid_mask & (pd.to_numeric(series, errors="coerce") < float(val))
        if op == Op.lte:
            return valid_mask & (pd.to_numeric(series, errors="coerce") <= float(val))

        if op == Op.between:
            low, high = float(val[0]), float(val[1])
            num_series = pd.to_numeric(series, errors="coerce")
            return valid_mask & (num_series >= low) & (num_series <= high)

        if op == Op.in_:
            if not isinstance(val, list):
                val = [val]
            if not case_sensitive and all(isinstance(x, str) for x in val):
                val_lower = [str(x).strip().lower() for x in val]
                return valid_mask & series.astype(str).str.strip().str.lower().isin(val_lower)
            return valid_mask & series.isin(val)

        if op == Op.not_in:
            if not isinstance(val, list):
                val = [val]
            if not case_sensitive and all(isinstance(x, str) for x in val):
                val_lower = [str(x).strip().lower() for x in val]
                return valid_mask & (~series.astype(str).str.strip().str.lower().isin(val_lower))
            return valid_mask & (~series.isin(val))

        if op == Op.contains:
            s_val = str(val)
            return valid_mask & series.astype(str).str.contains(s_val, case=case_sensitive, na=False, regex=False)

        if op == Op.starts_with:
            s_val = str(val)
            return valid_mask & series.astype(str).str.startswith(s_val, na=False)

        if op == Op.ends_with:
            s_val = str(val)
            return valid_mask & series.astype(str).str.endswith(s_val, na=False)

        return pd.Series(True, index=series.index)

    def _derive_date_part_column(self, df: pd.DataFrame, col: str, date_part: DatePart) -> str:
        new_col_name = f"__{col}_{date_part.value}__"
        if new_col_name in df.columns:
            return new_col_name

        dt_series = pd.to_datetime(df[col], errors="coerce")
        if date_part == DatePart.year:
            df[new_col_name] = dt_series.dt.year
        elif date_part == DatePart.quarter:
            df[new_col_name] = dt_series.dt.quarter
        elif date_part == DatePart.month:
            df[new_col_name] = dt_series.dt.month
        elif date_part == DatePart.month_name:
            df[new_col_name] = dt_series.dt.month_name()
        elif date_part == DatePart.week:
            df[new_col_name] = dt_series.dt.isocalendar().week
        elif date_part == DatePart.weekday:
            df[new_col_name] = dt_series.dt.day_name()
        elif date_part == DatePart.day:
            df[new_col_name] = dt_series.dt.day
        return new_col_name

    def _execute_group_aggregate(
        self, plan: QueryPlan, df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, List[str], Dict[str, int]]:
        steps = []
        skipped_missing = {}

        group_cols = [g.column for g in plan.group_by if g.column in df.columns]

        # Calculate skipped missing values per metric column (Section 5.9 & 9)
        for m in plan.metrics:
            if m.column and m.column in df.columns:
                m_null_count = int(df[m.column].isna().sum())
                if m_null_count > 0:
                    skipped_missing[m.column] = m_null_count

        if group_cols:
            grouped = df.groupby(group_cols, dropna=False)
            agg_dict = {}
            renames = {}

            for m in plan.metrics:
                alias = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
                if m.column:
                    col = m.column
                    # Standard pandas aggregations
                    if m.agg == Agg.sum:
                        agg_fn = "sum"
                    elif m.agg == Agg.mean:
                        agg_fn = "mean"
                    elif m.agg == Agg.median:
                        agg_fn = "median"
                    elif m.agg == Agg.min:
                        agg_fn = "min"
                    elif m.agg == Agg.max:
                        agg_fn = "max"
                    elif m.agg == Agg.std:
                        agg_fn = "std"
                    elif m.agg == Agg.count_distinct:
                        agg_fn = "nunique"
                    else:
                        agg_fn = "count"
                else:
                    col = group_cols[0]
                    agg_fn = "size"

                # Apply named aggregation
                renames[alias] = pd.NamedAgg(column=col, aggfunc=agg_fn)

            result_df = grouped.agg(**renames).reset_index()
            steps.append(f"Grouped by {', '.join(group_cols)} and calculated {len(plan.metrics)} metric(s)")

            # Handle % of total
            for m in plan.metrics:
                if m.pct_of_total:
                    alias = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
                    if alias in result_df.columns:
                        total_sum = result_df[alias].sum()
                        pct_col = f"{alias}_pct"
                        result_df[pct_col] = (result_df[alias] / total_sum * 100).round(2) if total_sum != 0 else 0.0

        else:
            # Overall aggregation without group_by
            summary = {}
            for m in plan.metrics:
                alias = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
                if m.column and m.column in df.columns:
                    if m.agg == Agg.count:
                        val = int(df[m.column].notna().sum())
                    elif m.agg == Agg.count_distinct:
                        val = int(df[m.column].dropna().nunique())
                    else:
                        s = pd.to_numeric(df[m.column], errors="coerce").dropna()
                        if m.agg == Agg.sum:
                            val = float(s.sum())
                        elif m.agg == Agg.mean:
                            val = round(float(s.mean()), 4) if len(s) > 0 else 0.0
                        elif m.agg == Agg.median:
                            val = float(s.median()) if len(s) > 0 else 0.0
                        elif m.agg == Agg.min:
                            val = float(s.min()) if len(s) > 0 else 0.0
                        elif m.agg == Agg.max:
                            val = float(s.max()) if len(s) > 0 else 0.0
                        elif m.agg == Agg.std:
                            val = round(float(s.std()), 4) if len(s) > 1 else 0.0
                        else:
                            val = int(s.count())
                else:
                    val = len(df)
                summary[alias] = [val]

            result_df = pd.DataFrame(summary)
            steps.append(f"Computed overall aggregate metrics across {len(df)} rows")

        return result_df, steps, skipped_missing

    def _execute_compare(
        self, plan: QueryPlan, df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, List[str], Dict[str, int]]:
        steps = []
        skipped = {}
        side_a, side_b = plan.compare[0], plan.compare[1]

        # Filter side A
        df_a = df.copy()
        for f in side_a.filters:
            mask, _ = self._build_filter_mask(df_a, f)
            df_a = df_a[mask]

        # Filter side B
        df_b = df.copy()
        for f in side_b.filters:
            mask, _ = self._build_filter_mask(df_b, f)
            df_b = df_b[mask]

        # Plan for each side
        sub_plan = plan.model_copy()
        sub_plan.intent = Intent.aggregate
        sub_plan.filters = []
        sub_plan.filters_any = []

        res_a, _, skip_a = QueryExecutor(df_a)._execute_group_aggregate(sub_plan, df_a)
        res_b, _, skip_b = QueryExecutor(df_b)._execute_group_aggregate(sub_plan, df_b)
        skipped.update(skip_a)
        skipped.update(skip_b)

        group_cols = [g.column for g in plan.group_by if g.column in res_a.columns]

        if group_cols:
            merged = pd.merge(
                res_a, res_b, on=group_cols, how="outer", suffixes=(f"_{side_a.label}", f"_{side_b.label}")
            )
        else:
            res_a = res_a.rename(columns={c: f"{c}_{side_a.label}" for c in res_a.columns})
            res_b = res_b.rename(columns={c: f"{c}_{side_b.label}" for c in res_b.columns})
            merged = pd.concat([res_a, res_b], axis=1)

        # Calculate delta and % change
        for m in plan.metrics:
            metric_base = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
            col_a = f"{metric_base}_{side_a.label}"
            col_b = f"{metric_base}_{side_b.label}"
            if col_a in merged.columns and col_b in merged.columns:
                delta_col = f"{metric_base}_delta"
                pct_col = f"{metric_base}_pct_change"
                merged[delta_col] = merged[col_b] - merged[col_a]
                # Division by zero handled safely
                merged[pct_col] = merged.apply(
                    lambda r: round(((r[col_b] - r[col_a]) / r[col_a] * 100), 2) if r[col_a] and r[col_a] != 0 else None,
                    axis=1
                )

        steps.append(f"Compared '{side_a.label}' ({len(df_a)} rows) with '{side_b.label}' ({len(df_b)} rows)")
        return merged, steps, skipped

    def _execute_distinct(self, plan: QueryPlan, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        steps = []
        col = plan.group_by[0].column if plan.group_by else (plan.select_columns[0] if plan.select_columns else df.columns[0])
        vc = df[col].value_counts(dropna=False).reset_index()
        vc.columns = [col, "count"]
        steps.append(f"Counted distinct values for '{col}'")
        return vc, steps

    def _execute_describe(self, plan: QueryPlan, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        cols = plan.select_columns or [c for c in df.columns if c != "__row__"]
        numeric_df = df[cols].select_dtypes(include=[np.number])
        desc = numeric_df.describe().round(4).reset_index()
        return desc, [f"Calculated descriptive statistics for {len(numeric_df.columns)} numeric column(s)"]

    def _clean_records(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        records = []
        for row in df.to_dict(orient="records"):
            clean_row = {}
            for k, v in row.items():
                if v is None:
                    clean_row[k] = None
                elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    clean_row[k] = None
                elif hasattr(v, "isoformat"):
                    clean_row[k] = v.isoformat()
                else:
                    clean_row[k] = v
            records.append(clean_row)
        return records
