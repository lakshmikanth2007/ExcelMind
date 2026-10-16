"""Deterministic search and structured filtering without LLM requirements."""

import math
import pandas as pd
from typing import Any, Dict, List, Optional, Tuple
from app.schemas.plan import Filter, QueryPlan, Intent, Sort
from app.services.query_executor import QueryExecutor

def keyword_search(
    df: pd.DataFrame,
    query: str,
    target_column: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """Case-insensitive substring search across all or a specific column with hit highlighting."""
    q_str = str(query).strip().lower()
    if not q_str:
        # Return paginated original dataframe
        total_matches = len(df)
        total_pages = max(1, math.ceil(total_matches / page_size))
        paged = df.iloc[(page - 1) * page_size : page * page_size]
        records = QueryExecutor(paged)._clean_records(paged)
        return {
            "query": query,
            "total_matches": total_matches,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "columns": list(df.columns),
            "rows": records,
            "matched_columns": {}
        }

    search_cols = [target_column] if target_column and target_column in df.columns else [c for c in df.columns if c != "__row__"]

    # Match mask and tracking
    matched_indices = []
    matched_cols_map: Dict[int, List[str]] = {}

    for idx, row in df.iterrows():
        hit_cols = []
        for col in search_cols:
            val_str = str(row[col]).lower() if pd.notnull(row[col]) else ""
            if q_str in val_str:
                hit_cols.append(col)
        if hit_cols:
            excel_row = int(row["__row__"]) if "__row__" in df.columns else idx + 1
            matched_indices.append(idx)
            matched_cols_map[excel_row] = hit_cols

    matched_df = df.loc[matched_indices]
    total_matches = len(matched_df)
    total_pages = max(1, math.ceil(total_matches / page_size))

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paged = matched_df.iloc[start_idx:end_idx]
    records = QueryExecutor(paged)._clean_records(paged)

    return {
        "query": query,
        "total_matches": total_matches,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "columns": list(df.columns),
        "rows": records,
        "matched_columns": matched_cols_map
    }

def apply_structured_filter(
    df: pd.DataFrame,
    filters: List[Filter],
    sort: Optional[List[Sort]] = None,
    limit: Optional[int] = None
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Apply structured filters directly without LLM invocation."""
    plan = QueryPlan(
        intent=Intent.filter,
        filters=filters,
        sort=sort or [],
        limit=limit,
        interpretation="Structured filter executed directly."
    )
    executor = QueryExecutor(df)
    res_df, evidence, query_res = executor.execute(plan)
    return res_df, {
        "columns": query_res.columns,
        "rows": query_res.rows,
        "total_matches": query_res.total_matches,
        "evidence": evidence.model_dump()
    }
