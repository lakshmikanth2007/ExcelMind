"""LLM service provider interface with implementations for Anthropic, Gemini, and MockLLM."""

import json
import os
import re
import time
from typing import Any, Dict, Optional, Protocol
from app.core.config import settings
from app.core.errors import LLMUnavailableError
from app.core.logging import logger

class LLMService(Protocol):
    def plan(self, system: str, user: str, schema: dict) -> dict: ...
    def rephrase(self, system: str, user: str) -> str: ...

def clean_json_text(text: str) -> str:
    """Strip markdown codeblocks and extra whitespace."""
    s = text.strip()
    if s.startswith("```"):
        # Remove opening ```json or ```
        s = re.sub(r"^```(?:json)?\s*", "", s)
        # Remove trailing ```
        s = re.sub(r"\s*```$", "", s)
    return s.strip()

def generate_heuristic_plan(question: str, schema: dict) -> dict:
    """Intelligent rule-based semantic planner for deterministic fallback.
    Accurately maps questions to aggregations, top N groups, filters, trends, or distinct values.
    """
    cols = schema.get("columns", [])
    sheet_name = schema.get("sheet_name", "Sheet1")
    q_lower = question.strip().lower()

    num_cols = [c["name"] for c in cols if c.get("dtype") in ["integer", "float", "currency", "percent"]]
    cat_cols = [c["name"] for c in cols if c.get("dtype") in ["categorical", "text"]]
    date_cols = [c["name"] for c in cols if c.get("dtype") in ["date", "datetime"]]

    # 1. Detect target numeric column
    target_num = None
    for nc in num_cols:
        if nc.lower() in q_lower:
            target_num = nc
            break
    if not target_num and num_cols:
        synonyms = {
            "sales": ["sales", "revenue", "income", "turnover"],
            "profit": ["profit", "margin", "earnings"],
            "price": ["price", "cost", "unit price", "rate"],
            "quantity": ["quantity", "qty", "volume", "units", "items"],
            "discount": ["discount", "rebate"],
            "score": ["score", "cgpa", "gpa", "grade", "marks", "rating"],
        }
        for nc in num_cols:
            nc_l = nc.lower()
            for key, words in synonyms.items():
                if any(w in nc_l for w in words) and any(w in q_lower for w in words):
                    target_num = nc
                    break
            if target_num:
                break
    if not target_num and num_cols:
        target_num = num_cols[0]

    # 2. Detect target categorical/grouping column
    target_cat = None
    for cc in cat_cols:
        if cc.lower() in q_lower:
            target_cat = cc
            break
    if not target_cat:
        by_match = re.search(r'\b(?:by|per|across|for each)\s+([a-zA-Z0-9_\s]+)', q_lower)
        if by_match:
            potential = by_match.group(1).strip()
            for cc in cat_cols + date_cols:
                if cc.lower() in potential or potential in cc.lower():
                    target_cat = cc
                    break

    # 3. Detect aggregation function
    agg_type = None
    if any(w in q_lower for w in ["average", "avg", "mean"]):
        agg_type = "mean"
    elif any(w in q_lower for w in ["total", "sum", "overall"]):
        agg_type = "sum"
    elif any(w in q_lower for w in ["highest", "max", "maximum", "peak", "most expensive", "best"]):
        agg_type = "max"
    elif any(w in q_lower for w in ["lowest", "min", "minimum", "cheapest", "least", "worst"]):
        agg_type = "min"
    elif any(w in q_lower for w in ["median"]):
        agg_type = "median"
    elif any(w in q_lower for w in ["count", "how many", "number of", "how much orders"]):
        agg_type = "count"

    # 4. Check for top N / bottom N / ranking queries
    top_n_match = re.search(r'\b(?:top|best|highest|leading)\s+(\d+)\b', q_lower)
    bottom_n_match = re.search(r'\b(?:bottom|lowest|worst)\s+(\d+)\b', q_lower)
    limit_val = None
    sort_dir = "desc"
    if top_n_match:
        limit_val = int(top_n_match.group(1))
        sort_dir = "desc"
    elif bottom_n_match:
        limit_val = int(bottom_n_match.group(1))
        sort_dir = "asc"

    # 5. Check for value filters in categorical columns
    filters = []
    for c in cols:
        c_name = c["name"]
        distinct_vals = c.get("distinct_values") or c.get("top_values") or []
        for val in distinct_vals:
            if val is None:
                continue
            v_str = str(val).strip()
            if len(v_str) >= 2 and re.search(rf'\b{re.escape(v_str.lower())}\b', q_lower):
                filters.append({
                    "target": {"column": c_name, "date_part": None},
                    "op": "eq",
                    "value": val,
                    "case_sensitive": False
                })
                break

    # If no filter matched yet, check for named entity search (e.g., student name or specific person/item)
    if not filters and cat_cols:
        candidate = re.sub(
            r'\b(?:what|are|is|the|of|for|marks?|scores?|grades?|sales?|profits?|who|how|show|find|get|me|records?|data|details?|in|sheet\d*)\b',
            ' ',
            q_lower
        )
        candidate = re.sub(r'[\?\.\,\!]+', '', candidate)
        candidate = re.sub(r'\s+', ' ', candidate).strip()
        if len(candidate) >= 3 and not any(w in candidate for w in ["average", "total", "sum", "highest", "lowest", "count", "mean"]):
            name_col = next((cc for cc in cat_cols if any(k in cc.lower() for k in ["name", "student", "customer", "person", "item", "title"])), cat_cols[0])
            filters.append({
                "target": {"column": name_col, "date_part": None},
                "op": "contains",
                "value": candidate,
                "case_sensitive": False
            })

    # 6. Check for numeric comparison filters
    for nc in num_cols:
        gt_m = re.search(rf'(?:{re.escape(nc.lower())}|greater than|more than|>|above)\s*(\d+(?:\.\d+)?)', q_lower)
        if gt_m and any(w in q_lower for w in ["greater", "more", ">", "above"]):
            filters.append({
                "target": {"column": nc, "date_part": None},
                "op": "gt",
                "value": float(gt_m.group(1)),
                "case_sensitive": False
            })
            break
        lt_m = re.search(rf'(?:{re.escape(nc.lower())}|less than|under|<|below)\s*(\d+(?:\.\d+)?)', q_lower)
        if lt_m and any(w in q_lower for w in ["less", "under", "<", "below"]):
            filters.append({
                "target": {"column": nc, "date_part": None},
                "op": "lt",
                "value": float(lt_m.group(1)),
                "case_sensitive": False
            })
            break

    # 7. Check for distinct intent
    if any(w in q_lower for w in ["distinct", "unique values", "list of all categories", "all categories"]):
        chosen_cat = target_cat or (cat_cols[0] if cat_cols else (cols[0]["name"] if cols else None))
        if chosen_cat:
            return {
                "intent": "distinct",
                "sheet": sheet_name,
                "filters": filters,
                "select_columns": [chosen_cat],
                "interpretation": f"Listing distinct values for {chosen_cat}.",
                "confidence": "high"
            }

    # 8. Check for date trend
    if any(w in q_lower for w in ["trend", "monthly", "over time", "by month"]) and date_cols and target_num:
        d_col = date_cols[0]
        return {
            "intent": "aggregate",
            "sheet": sheet_name,
            "filters": filters,
            "group_by": [{"column": d_col, "date_part": "month"}],
            "metrics": [{"column": target_num, "agg": "sum", "alias": f"total_{target_num}", "pct_of_total": False}],
            "sort": [{"by": f"total_{target_num}", "direction": "desc"}],
            "chart": "line",
            "chart_x": d_col,
            "chart_y": f"total_{target_num}",
            "interpretation": f"Monthly trend of {target_num} over time.",
            "confidence": "high"
        }

    # 9. Group by + Metric (Top N or breakdown)
    if (target_cat and (agg_type or target_num or limit_val)) or limit_val:
        metric_col = target_num or (num_cols[0] if num_cols else None)
        agg_func = agg_type or "sum"
        metric_alias = f"{agg_func}_{metric_col}" if metric_col else "count"
        group_col = target_cat or (cat_cols[0] if cat_cols else None)
        if group_col:
            plan = {
                "intent": "top_n" if limit_val else "aggregate",
                "sheet": sheet_name,
                "filters": filters,
                "group_by": [{"column": group_col, "date_part": None}],
                "metrics": [{"column": metric_col, "agg": agg_func, "alias": metric_alias, "pct_of_total": False}],
                "sort": [{"by": metric_alias, "direction": sort_dir}],
                "limit": limit_val or 10,
                "chart": "bar",
                "chart_x": group_col,
                "chart_y": metric_alias,
                "interpretation": f"{('Top ' + str(limit_val) + ' ') if limit_val else ''}{group_col} grouped by {agg_func} of {metric_col or 'records'}.",
                "confidence": "high"
            }
            return plan

    # 10. Single Aggregate
    if agg_type or (any(w in q_lower for w in ["what is the", "calculate", "find the", "average", "total", "sum"]) and target_num):
        metric_col = target_num or (num_cols[0] if num_cols else None)
        agg_func = agg_type or "mean"
        alias = f"{agg_func}_{metric_col}" if metric_col else "count"
        return {
            "intent": "aggregate",
            "sheet": sheet_name,
            "filters": filters,
            "group_by": [],
            "metrics": [{"column": metric_col, "agg": agg_func, "alias": alias, "pct_of_total": False}],
            "chart": "none",
            "interpretation": f"Calculating {agg_func} of {metric_col or 'records'}{(' with filters' if filters else '')}.",
            "confidence": "high"
        }

    # 11. Filter / Lookup with specific criteria
    if filters:
        select_cols = [c["name"] for c in cols[:6]]
        return {
            "intent": "filter",
            "sheet": sheet_name,
            "filters": filters,
            "select_columns": select_cols,
            "interpretation": f"Filtering records matching criteria ({len(filters)} filter(s)).",
            "confidence": "high"
        }

    # 12. Default summary / preview across dataset
    if num_cols:
        primary = num_cols[0]
        return {
            "intent": "aggregate",
            "sheet": sheet_name,
            "filters": [],
            "group_by": [],
            "metrics": [
                {"column": primary, "agg": "sum", "alias": f"total_{primary}", "pct_of_total": False},
                {"column": primary, "agg": "mean", "alias": f"average_{primary}", "pct_of_total": False}
            ],
            "chart": "none",
            "interpretation": f"Overall summary statistics for {primary} across {sheet_name}.",
            "confidence": "medium"
        }

    cols = schema.get("columns", [])
    first_col = cols[0]["name"] if cols else "Column_1"
    return {
        "intent": "filter",
        "sheet": sheet_name,
        "filters": [],
        "select_columns": [c["name"] for c in cols[:5]],
        "interpretation": f"Viewing data for {first_col}.",
        "confidence": "medium"
    }

class MockLLM:
    """Mock LLM returning predefined JSON plans for tests, with intelligent semantic fallback."""
    def __init__(self, canned_plans: Optional[Dict[str, Dict[str, Any]]] = None):
        self.canned_plans: Dict[str, Dict[str, Any]] = canned_plans or {}

    def register_plan(self, question: str, plan_dict: Dict[str, Any]):
        self.canned_plans[question.strip().lower()] = plan_dict

    def plan(self, system: str, user: str, schema: dict) -> dict:
        # Extract question from user text
        q_match = re.search(r"<question>(.*?)</question>", user, re.DOTALL)
        question = q_match.group(1).strip().lower() if q_match else user.strip().lower()

        # Exact match or substring match
        if question in self.canned_plans:
            return self.canned_plans[question]
        for k, plan in self.canned_plans.items():
            if k in question or question in k:
                return plan

        # Intelligent semantic heuristic plan instead of generic empty filter
        return generate_heuristic_plan(question, schema)

    def rephrase(self, system: str, user: str) -> str:
        return user

class AnthropicLLM:
    def __init__(self):
        self.api_key = settings.LLM_API_KEY or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = settings.LLM_MODEL or "claude-3-5-sonnet-20241022"
        self.timeout = settings.LLM_TIMEOUT_S

    def plan(self, system: str, user: str, schema: dict) -> dict:
        if not self.api_key:
            raise LLMUnavailableError("Anthropic API key is not configured.")
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout)
            response = client.messages.create(
                model=self.model,
                max_tokens=2048,
                temperature=0.0,
                system=system,
                messages=[{"role": "user", "content": user}]
            )
            raw_text = response.content[0].text
            cleaned = clean_json_text(raw_text)
            return json.loads(cleaned)
        except Exception as e:
            logger.error(f"Anthropic API plan error: {e}")
            raise LLMUnavailableError(f"Error communicating with Anthropic LLM: {str(e)}")

    def rephrase(self, system: str, user: str) -> str:
        if not self.api_key:
            return user
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout)
            response = client.messages.create(
                model=self.model,
                max_tokens=512,
                temperature=0.0,
                system=system,
                messages=[{"role": "user", "content": user}]
            )
            return response.content[0].text.strip()
        except Exception:
            return user

class GeminiLLM:
    def __init__(self):
        self.api_key = (
            settings.GEMINI_API_KEY
            or os.environ.get("GEMINI_API_KEY")
            or settings.LLM_API_KEY
            or os.environ.get("LLM_API_KEY", "")
        )
        self.primary_model = settings.LLM_MODEL or "gemini-3.1-flash-lite"
        self.candidate_models = [
            self.primary_model,
            "gemini-flash-latest",
            "gemini-2.5-flash",
            "gemini-3.8-flash",
        ]

    def plan(self, system: str, user: str, schema: dict) -> dict:
        if not self.api_key:
            raise LLMUnavailableError("Gemini API key is not configured.")
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            full_prompt = f"{system}\n\n{user}"
            last_err = None

            for model_name in self.candidate_models:
                for attempt in range(2):
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=full_prompt,
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                temperature=0.0,
                            )
                        )
                        cleaned = clean_json_text(response.text)
                        return json.loads(cleaned)
                    except Exception as ex:
                        last_err = ex
                        err_str = str(ex).lower()
                        if "429" in err_str or "resource_exhausted" in err_str or "404" in err_str:
                            logger.warning(f"Model {model_name} unavailable ({ex}). Trying next candidate...")
                            break  # Move to next model
                        if ("503" in err_str or "unavailable" in err_str) and attempt == 0:
                            time.sleep(1.0)
                            continue
                        break
            if last_err:
                raise last_err
        except Exception as e:
            logger.error(f"Gemini API plan error: {e}")
            raise LLMUnavailableError(f"Error communicating with Gemini LLM: {str(e)}")

    def rephrase(self, system: str, user: str) -> str:
        if not self.api_key:
            return user
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            for model_name in self.candidate_models:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=f"{system}\n\n{user}"
                    )
                    return response.text.strip()
                except Exception:
                    continue
            return user
        except Exception:
            return user

# Global registry for MockLLM in test/CI
default_mock_llm = MockLLM()

def get_llm_service() -> LLMService:
    provider = settings.LLM_PROVIDER.lower()
    gemini_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    anthropic_key = settings.LLM_API_KEY or os.environ.get("ANTHROPIC_API_KEY", "")

    if provider == "mock":
        return default_mock_llm
    elif gemini_key:
        return GeminiLLM()
    elif anthropic_key:
        return AnthropicLLM()
    elif provider == "gemini":
        return GeminiLLM()
    else:
        # Default to mock if no keys are found
        return default_mock_llm
