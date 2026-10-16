"""Automatic chart suggestion and Plotly JSON generation adhering to Section 11 specifications."""

import math
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Literal, Optional, Tuple
from app.schemas.profile import SheetProfile

# Modern professional analytics palette
MODERN_PALETTE = [
    "#4F46E5", "#06B6D4", "#10B981", "#F59E0B", "#EC4899",
    "#8B5CF6", "#3B82F6", "#14B8A6", "#F97316", "#6366F1"
]
COLORBLIND_PALETTE = MODERN_PALETTE

def auto_suggest_chart(df: pd.DataFrame, profile: Optional[SheetProfile] = None) -> Tuple[str, Optional[str], Optional[str]]:
    """Determine best chart type, x-column, and y-column based on dataframe structure."""
    if len(df) == 0:
        return "none", None, None

    col_dtypes = {}
    if profile:
        col_dtypes = {c.name: c.dtype for c in profile.columns}

    cols = [c for c in df.columns if c != "__row__"]
    if len(cols) == 1:
        c = cols[0]
        dtype = col_dtypes.get(c, "text")
        if dtype in ["integer", "float", "currency", "percent"] or pd.api.types.is_numeric_dtype(df[c]):
            return "histogram", c, None
        return "none", None, None

    # Check for date column + numeric column -> line chart
    date_col = None
    num_cols = []
    cat_cols = []

    for c in cols:
        dtype = col_dtypes.get(c, "")
        if dtype in ["date", "datetime"] or "date" in c.lower() or "year" in c.lower() or "month" in c.lower():
            date_col = c
        elif dtype in ["integer", "float", "currency", "percent"] or pd.api.types.is_numeric_dtype(df[c]):
            num_cols.append(c)
        else:
            cat_cols.append(c)

    if date_col and num_cols:
        return "line", date_col, num_cols[0]

    if cat_cols and num_cols:
        # Categorical + numeric -> bar or pie
        x_col = cat_cols[0]
        y_col = num_cols[0]
        # Pie if shares of total and <= 8 slices
        if len(df) <= 8 and any("pct" in col.lower() or "share" in col.lower() for col in cols):
            return "pie", x_col, y_col
        return "bar", x_col, y_col

    if len(num_cols) >= 2:
        return "scatter", num_cols[0], num_cols[1]

    if cat_cols:
        return "bar", cat_cols[0], num_cols[0] if num_cols else None

    return "none", None, None

def build_plotly_figure(
    df: pd.DataFrame,
    chart_type: str,
    x_col: Optional[str] = None,
    y_col: Optional[str] = None,
    title: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Generate a clean Plotly JSON specification matching Section 11."""
    if chart_type == "none" or len(df) == 0:
        return None

    clean_cols = [c for c in df.columns if c != "__row__"]
    x = x_col or (clean_cols[0] if clean_cols else None)
    y = y_col or (clean_cols[1] if len(clean_cols) > 1 else None)

    if not x:
        return None

    chart_title = title or f"{chart_type.capitalize()} Chart: {y or ''} by {x}".strip()
    plot_df = df.copy()

    traces = []
    layout: Dict[str, Any] = {
        "title": {
            "text": chart_title,
            "font": {"family": "Inter, system-ui, sans-serif", "size": 14, "color": "#1E293B"},
            "x": 0.02,
            "xanchor": "left"
        },
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": "rgba(0,0,0,0)",
        "margin": {"l": 50, "r": 25, "t": 40, "b": 50},
        "font": {"family": "Inter, system-ui, sans-serif", "color": "#475569", "size": 11},
        "colorway": MODERN_PALETTE,
        "hoverlabel": {
            "bgcolor": "#0F172A",
            "bordercolor": "#334155",
            "font": {"family": "Inter, sans-serif", "size": 12, "color": "#FFFFFF"}
        },
        "xaxis": {
            "gridcolor": "#F1F5F9",
            "zeroline": False,
            "title": {"text": x, "font": {"size": 11, "color": "#64748B"}}
        },
        "yaxis": {
            "gridcolor": "#F1F5F9",
            "zeroline": False,
            "title": {"text": y or "Value", "font": {"size": 11, "color": "#64748B"}}
        },
    }

    # Cap to 50 categories per spec Section 11
    if len(plot_df) > 50 and chart_type in ["bar", "pie"]:
        plot_df = plot_df.head(50)

    if chart_type == "bar":
        # Check if horizontal bar is better (> 8 categories or long labels)
        is_horizontal = len(plot_df) > 8 or any(len(str(val)) > 15 for val in plot_df[x].head(10))

        bar_colors = [MODERN_PALETTE[i % len(MODERN_PALETTE)] for i in range(len(plot_df))]

        if is_horizontal and y:
            traces.append({
                "type": "bar",
                "x": plot_df[y].tolist(),
                "y": [str(v) for v in plot_df[x].tolist()],
                "orientation": "h",
                "marker": {
                    "color": bar_colors,
                    "line": {"color": "rgba(255,255,255,0.4)", "width": 1}
                },
                "hovertemplate": "<b>%{y}</b><br>Value: <b>%{x:,.2f}</b><extra></extra>"
            })
            layout["xaxis"]["title"]["text"] = y
            layout["yaxis"]["title"]["text"] = x
        else:
            traces.append({
                "type": "bar",
                "x": [str(v) for v in plot_df[x].tolist()],
                "y": plot_df[y].tolist() if y else [1] * len(plot_df),
                "marker": {
                    "color": bar_colors,
                    "line": {"color": "rgba(255,255,255,0.4)", "width": 1}
                },
                "hovertemplate": "<b>%{x}</b><br>Value: <b>%{y:,.2f}</b><extra></extra>"
            })

    elif chart_type == "line":
        traces.append({
            "type": "scatter",
            "mode": "lines+markers",
            "x": [str(v) for v in plot_df[x].tolist()],
            "y": plot_df[y].tolist() if y else [],
            "line": {
                "color": MODERN_PALETTE[0],
                "width": 3.5,
                "shape": "spline",
                "smoothing": 1.2
            },
            "fill": "tozeroy",
            "fillcolor": "rgba(79, 70, 229, 0.08)",
            "marker": {
                "size": 7,
                "color": MODERN_PALETTE[0],
                "line": {"color": "#ffffff", "width": 2}
            },
            "hovertemplate": "<b>%{x}</b><br>Value: <b>%{y:,.2f}</b><extra></extra>"
        })

    elif chart_type == "pie":
        # Pie max 8 slices per spec
        pie_df = plot_df.head(8)
        traces.append({
            "type": "pie",
            "labels": [str(v) for v in pie_df[x].tolist()],
            "values": pie_df[y].tolist() if y else [1] * len(pie_df),
            "hole": 0.55,  # Elegant modern donut
            "marker": {
                "colors": MODERN_PALETTE[:len(pie_df)],
                "line": {"color": "#ffffff", "width": 2}
            },
            "textinfo": "percent",
            "hovertemplate": "<b>%{label}</b><br>Total: %{value:,.2f}<br>Share: <b>%{percent}</b><extra></extra>"
        })

    elif chart_type == "scatter":
        traces.append({
            "type": "scatter",
            "mode": "markers",
            "x": plot_df[x].tolist(),
            "y": plot_df[y].tolist() if y else [],
            "marker": {
                "color": "rgba(79, 70, 229, 0.75)",
                "size": 9,
                "line": {"color": "#4338CA", "width": 1.5}
            },
            "hovertemplate": "<b>%{x:,.2f}</b>, <b>%{y:,.2f}</b><extra></extra>"
        })

    elif chart_type == "histogram":
        traces.append({
            "type": "histogram",
            "x": plot_df[x].tolist(),
            "marker": {
                "color": "rgba(79, 70, 229, 0.8)",
                "line": {"color": "#4338CA", "width": 1}
            },
            "hovertemplate": "<b>Range</b>: %{x}<br>Count: <b>%{y}</b><extra></extra>"
        })

    return {
        "plotly": {
            "data": traces,
            "layout": layout
        },
        "type": chart_type,
        "x": x,
        "y": y,
        "title": chart_title
    }
