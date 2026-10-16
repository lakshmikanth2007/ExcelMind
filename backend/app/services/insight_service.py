"""Automated insight generation service analyzing data quality, duplicates, mixed types, outliers, trends, and charts."""

import uuid
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional
from app.schemas.insights import DashboardChartSpec, InsightItem, InsightReport
from app.schemas.profile import SheetProfile
from app.services.chart_service import build_plotly_figure

def generate_insights_report(df: pd.DataFrame, profile: SheetProfile) -> InsightReport:
    insights: List[InsightItem] = []
    excel_rows = df["__row__"].tolist() if "__row__" in df.columns else list(range(1, len(df) + 1))
    total_rows = len(df)

    # 1. Missing Data Insights (flag > 20%)
    for col in profile.columns:
        if col.null_count > 0:
            sev = "warning" if col.null_pct > 20.0 else "info"
            null_mask = df[col.name].isna()
            affected = [excel_rows[i] for i, is_na in enumerate(null_mask) if is_na][:20]
            insights.append(InsightItem(
                id=f"missing_{col.name}",
                category="missing_data",
                severity=sev,
                title=f"Missing values in '{col.name}' ({col.null_pct}%)",
                detail=f"Column '{col.name}' contains {col.null_count} empty or unparsed cells ({col.null_pct}% of total records).",
                affected_rows=affected,
                question_to_ask=f"Which records have missing {col.name}?"
            ))

    # 2. Duplicate Rows Insight
    if profile.quality.duplicate_rows_count > 0:
        insights.append(InsightItem(
            id="duplicates_full",
            category="duplicates",
            severity="warning",
            title=f"Duplicate Rows Detected ({profile.quality.duplicate_rows_count})",
            detail=f"Found {profile.quality.duplicate_rows_count} identical row entries across the sheet.",
            affected_rows=profile.quality.duplicate_rows[:20],
            question_to_ask="Show duplicate records"
        ))

    # 3. Mixed Types
    for m in profile.quality.mixed_types:
        insights.append(InsightItem(
            id=f"mixed_{m.column}",
            category="mixed_types",
            severity="warning",
            title=f"Inconsistent formats in '{m.column}'",
            detail=f"Column '{m.column}' contains mixed data types with non-numeric text values (e.g., {', '.join(m.sample_values[:3])}).",
            affected_rows=m.offending_rows[:20],
            question_to_ask=f"Show rows in {m.column} with non-numeric text"
        ))

    # 4. Outliers (IQR Method) - wording MUST say "unusual value", never "error" or "fraud"
    for col_name, outlier_rows in profile.quality.outlier_columns.items():
        if outlier_rows:
            insights.append(InsightItem(
                id=f"outlier_{col_name}",
                category="outliers",
                severity="info",
                title=f"Unusual values detected in '{col_name}'",
                detail=f"Found {len(outlier_rows)} records with statistical unusual values beyond 1.5× the interquartile range.",
                affected_rows=outlier_rows[:20],
                question_to_ask=f"What are the highest values in {col_name}?"
            ))

    # 5. Trends & Top Findings
    num_cols = [c for c in profile.columns if c.dtype in ["integer", "float", "currency"] and c.name != "__row__"]
    cat_cols = [c for c in profile.columns if c.dtype in ["categorical", "text"] and c.name != "__row__"]
    date_cols = [c for c in profile.columns if c.dtype in ["date", "datetime"]]

    # Pick best numeric metric: prioritize core business metrics
    main_num = None
    priority_metrics = ["sales", "revenue", "amount", "total", "profit", "price", "marks", "score", "cgpa", "gpa", "salary", "units"]
    for pm in priority_metrics:
        for c in num_cols:
            if pm in c.name.lower():
                main_num = c.name
                break
        if main_num:
            break
    if not main_num and num_cols:
        main_num = num_cols[0].name

    # Check whether metric is naturally an average or a sum
    is_avg_metric = any(w in (main_num or "").lower() for w in ["cgpa", "gpa", "rate", "ratio", "pct", "percent", "average", "avg", "discount"])

    # Pick best grouping category: prefer categorical columns with clean cardinality (2 to 25 unique values)
    main_cat = None
    priority_cats = ["category", "region", "department", "segment", "product", "item", "status", "grade", "country", "city", "gender", "type", "rep"]
    for pc in priority_cats:
        for c in cat_cols:
            if pc in c.name.lower() and 2 <= c.unique_count <= 35:
                main_cat = c.name
                break
        if main_cat:
            break

    # If priority match not found, find any categorical with reasonable cardinality
    if not main_cat:
        for c in cat_cols:
            if 2 <= c.unique_count <= 35:
                main_cat = c.name
                break

    # Fallback to first categorical
    if not main_cat and cat_cols:
        main_cat = cat_cols[0].name

    if main_cat and main_num and main_num in df.columns and main_cat in df.columns:
        clean_df = df.copy()
        clean_df[main_num] = pd.to_numeric(clean_df[main_num], errors="coerce")
        clean_df = clean_df.dropna(subset=[main_num, main_cat])
        if len(clean_df) > 0:
            agg_func = "mean" if is_avg_metric else "sum"
            gb = clean_df.groupby(main_cat)[main_num].agg(agg_func).sort_values(ascending=False).reset_index()
            if len(gb) > 0:
                top_cat = gb[main_cat].iloc[0]
                top_val = gb[main_num].iloc[0]
                metric_label = f"average {main_num}" if is_avg_metric else f"total {main_num}"
                insights.append(InsightItem(
                    id=f"trend_top_{main_cat}",
                    category="trends",
                    severity="info",
                    title=f"'{top_cat}' leads '{main_cat}' in {main_num}",
                    detail=f"'{top_cat}' recorded the highest {metric_label} ({top_val:,.2f}), outperforming other groups in '{main_cat}'.",
                    affected_rows=[],
                    question_to_ask=f"Breakdown of {main_num} by {main_cat}"
                ))

    # Correlation Highlights (|r| >= 0.7 labelled as correlation not causation)
    if len(num_cols) >= 2:
        valid_num_names = [c.name for c in num_cols if c.name in df.columns]
        num_df = df[valid_num_names].apply(pd.to_numeric, errors="coerce")
        corr_matrix = num_df.corr()
        for i in range(len(valid_num_names)):
            for j in range(i + 1, len(valid_num_names)):
                c1, c2 = valid_num_names[i], valid_num_names[j]
                r_val = corr_matrix.loc[c1, c2]
                if abs(r_val) >= 0.7 and not np.isnan(r_val):
                    insights.append(InsightItem(
                        id=f"corr_{c1}_{c2}",
                        category="correlation",
                        severity="info",
                        title=f"High correlation between '{c1}' and '{c2}' (r={r_val:.2f})",
                        detail=f"Statistical correlation of {r_val:.2f} observed between '{c1}' and '{c2}'. Note: this demonstrates numerical correlation, not causation.",
                        affected_rows=[],
                        question_to_ask=f"Compare {c1} and {c2}"
                    ))

    # 6. Deterministic Suggested Questions (5 to 8 questions)
    suggested_q = []
    if main_cat and main_num:
        agg_word = "average" if is_avg_metric else "total"
        suggested_q.append(f"What is the {agg_word} {main_num} grouped by {main_cat}?")
        suggested_q.append(f"Top 5 {main_cat} by {main_num}")
    if date_cols and main_num:
        suggested_q.append(f"Monthly trend of {main_num}")
    if cat_cols and len(cat_cols) >= 2 and main_num:
        suggested_q.append(f"Compare {main_num} across {cat_cols[1].name}")
    if num_cols:
        suggested_q.append(f"What is the average {num_cols[0].name}?")
        suggested_q.append(f"Distribution of {num_cols[0].name}")
    if cat_cols:
        suggested_q.append(f"Distinct values in {cat_cols[0].name}")
    suggested_q.append("Show any missing or blank values")

    # 7. Dashboard Charts (3 to 6 charts) - High Accuracy Suite
    dashboard_charts: List[DashboardChartSpec] = []
    chart_id = 1

    # Chart 1: Categorical Breakdown (Accurately sorted and aggregated)
    if main_cat and main_num and main_num in df.columns and main_cat in df.columns:
        clean_df = df.copy()
        clean_df[main_num] = pd.to_numeric(clean_df[main_num], errors="coerce").fillna(0)
        clean_df = clean_df.dropna(subset=[main_cat])
        agg_func = "mean" if is_avg_metric else "sum"
        gb = clean_df.groupby(main_cat)[main_num].agg(agg_func).reset_index()
        gb = gb.sort_values(by=main_num, ascending=False).head(10)
        
        agg_title = "Average" if is_avg_metric else "Total"
        is_high_cardinality = len(clean_df[main_cat].unique()) > 15
        chart_title = f"Top 10 {main_cat} by {main_num}" if is_high_cardinality else f"{agg_title} {main_num} by {main_cat}"
        
        fig = build_plotly_figure(gb, "bar", main_cat, main_num, chart_title)
        if fig:
            dashboard_charts.append(DashboardChartSpec(
                id=f"dash_{chart_id}",
                title=chart_title,
                chart_type="bar",
                x=main_cat,
                y=main_num,
                plotly=fig["plotly"]
            ))
            chart_id += 1

    # Chart 2: Time Series Trend (if date available) OR Category Donut Composition
    if date_cols and main_num and main_num in df.columns:
        d_col = date_cols[0].name
        temp_df = df.dropna(subset=[d_col]).copy()
        temp_df[main_num] = pd.to_numeric(temp_df[main_num], errors="coerce").fillna(0)
        temp_df["__month__"] = pd.to_datetime(temp_df[d_col], errors="coerce").dt.to_period("M").astype(str)
        temp_df = temp_df[temp_df["__month__"] != "NaT"]
        agg_func = "mean" if is_avg_metric else "sum"
        gb_dt = temp_df.groupby("__month__")[main_num].agg(agg_func).reset_index().sort_values(by="__month__")
        trend_title = f"{'Average' if is_avg_metric else 'Total'} {main_num} Trend Over Time"
        fig = build_plotly_figure(gb_dt, "line", "__month__", main_num, trend_title)
        if fig:
            dashboard_charts.append(DashboardChartSpec(
                id=f"dash_{chart_id}",
                title=trend_title,
                chart_type="line",
                x="__month__",
                y=main_num,
                plotly=fig["plotly"]
            ))
            chart_id += 1
    elif main_cat and main_cat in df.columns:
        # Donut chart for category share / record distribution
        clean_df = df.dropna(subset=[main_cat]).copy()
        val_counts = clean_df[main_cat].value_counts().reset_index()
        val_counts.columns = [main_cat, "Records"]
        val_counts = val_counts.head(7)
        donut_title = f"Distribution of Records by {main_cat}"
        fig = build_plotly_figure(val_counts, "pie", main_cat, "Records", donut_title)
        if fig:
            dashboard_charts.append(DashboardChartSpec(
                id=f"dash_{chart_id}",
                title=donut_title,
                chart_type="pie",
                x=main_cat,
                y="Records",
                plotly=fig["plotly"]
            ))
            chart_id += 1

    # Chart 3: Metric Distribution Histogram
    if main_num and main_num in df.columns:
        num_clean = pd.to_numeric(df[main_num], errors="coerce").dropna().to_frame(name=main_num)
        hist_title = f"Distribution Frequency of {main_num}"
        fig = build_plotly_figure(num_clean, "histogram", main_num, None, hist_title)
        if fig:
            dashboard_charts.append(DashboardChartSpec(
                id=f"dash_{chart_id}",
                title=hist_title,
                chart_type="histogram",
                x=main_num,
                y=None,
                plotly=fig["plotly"]
            ))
            chart_id += 1

    # Chart 4: Bivariate Scatter (if 2 numeric columns)
    if len(num_cols) >= 2:
        c1, c2 = num_cols[0].name, num_cols[1].name
        if c1 in df.columns and c2 in df.columns:
            sub_scatter = df[[c1, c2]].copy()
            sub_scatter[c1] = pd.to_numeric(sub_scatter[c1], errors="coerce")
            sub_scatter[c2] = pd.to_numeric(sub_scatter[c2], errors="coerce")
            sub_scatter = sub_scatter.dropna().head(100)
            scatter_title = f"{c1} vs {c2} Correlation"
            fig = build_plotly_figure(sub_scatter, "scatter", c1, c2, scatter_title)
            if fig:
                dashboard_charts.append(DashboardChartSpec(
                    id=f"dash_{chart_id}",
                    title=scatter_title,
                    chart_type="scatter",
                    x=c1,
                    y=c2,
                    plotly=fig["plotly"]
                ))
                chart_id += 1

    summary_text = (
        f"Sheet '{profile.sheet_name}' contains {total_rows} records and {profile.column_count} columns "
        f"with {len(insights)} automated insights identified."
    )

    return InsightReport(
        sheet_name=profile.sheet_name,
        row_count=total_rows,
        column_count=profile.column_count,
        header_row=profile.header_row,
        summary_text=summary_text,
        insights=insights,
        suggested_questions=suggested_q[:8],
        dashboard_charts=dashboard_charts[:3]
    )
