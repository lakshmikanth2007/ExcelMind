"""Deterministic answer composition with strict numeric verification post-checks."""

import re
import pandas as pd
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.schemas.plan import Evidence, Intent, QueryPlan, QueryResult
from app.schemas.profile import SheetProfile
from app.services.llm_service import LLMService

def extract_numbers_from_text(text: str) -> List[float]:
    """Extract all numbers from text for hallucination verification."""
    # Find all float or integer patterns, removing commas
    clean = text.replace(",", "")
    matches = re.findall(r'-?\b\d+(?:\.\d+)?\b', clean)
    numbers = []
    for m in matches:
        try:
            numbers.append(float(m))
        except ValueError:
            pass
    return numbers

def format_number(val: Any, is_currency: bool = False, is_pct: bool = False) -> str:
    """Format numeric values with thousand separators, decimals, and symbols."""
    if val is None or pd.isna(val):
        return "N/A"
    if isinstance(val, (int, float)):
        if is_pct:
            return f"{val:.1f}%"
        if isinstance(val, int) or (isinstance(val, float) and val.is_integer()):
            formatted = f"{int(val):,}"
        else:
            formatted = f"{val:,.2f}"
        if is_currency:
            return f"${formatted}"
        return formatted
    return str(val)

def format_clean_value(val: Any, is_currency: bool = False, is_pct: bool = False) -> str:
    """Format values cleanly, formatting numbers and stripping raw timestamps from dates."""
    if val is None or pd.isna(val):
        return "N/A"
    if isinstance(val, (int, float)):
        return format_number(val, is_currency, is_pct)
    s = str(val).strip()
    if "T00:00:00" in s:
        return s.split("T")[0]
    return s

def compose_deterministic_answer(
    plan: QueryPlan,
    result: QueryResult,
    evidence: Evidence,
    profile: SheetProfile
) -> str:
    """Generate a clean, easy-to-understand summary sentence for any user."""
    col_types = {c.name: c.dtype for c in profile.columns}

    # 1. Empty Results
    if result.total_matches == 0:
        relax_msg = ""
        if plan.filters:
            first_f = plan.filters[0]
            col_name = first_f.target.column
            col_prof = next((c for c in profile.columns if c.name == col_name), None)
            if col_prof and col_prof.max is not None:
                relax_msg = f" For reference, the highest value recorded for '{col_name}' is {format_number(col_prof.max)}."
            elif col_prof and col_prof.top_values:
                relax_msg = f" Available values in '{col_name}' include: {', '.join(str(v) for v in col_prof.top_values[:4])}."
        return f"No records found matching that search in sheet '{profile.sheet_name}'.{relax_msg}"

    # 2. Clarify / Unsupported
    if plan.intent == Intent.clarify:
        return plan.clarification_question or "Could you please clarify your question?"
    if plan.intent == Intent.unsupported:
        return plan.unsupported_reason or "This operation is not currently supported."

    # 3. Aggregations (Single overall summary)
    if plan.intent == Intent.aggregate and not plan.group_by and result.rows:
        row = result.rows[0]
        metric_phrases = []
        for m in plan.metrics:
            alias = m.alias or (f"{m.agg.value}_{m.column}" if m.column else "count")
            val = row.get(alias)
            col_dtype = col_types.get(m.column or "", "text")
            is_curr = col_dtype == "currency"
            is_pct = col_dtype == "percent"
            formatted_val = format_number(val, is_curr, is_pct)
            m_name = m.column or "records"
            agg_word = "average" if m.agg.value == "mean" else ("total" if m.agg.value == "sum" else ("total count of" if m.agg.value == "count" else m.agg.value))
            metric_phrases.append(f"the **{agg_word} {m_name}** is **{formatted_val}**")

        ans = " and ".join(metric_phrases) + f" across {evidence.matched_row_count} matched rows."
        if ans:
            ans = ans[0].upper() + ans[1:]
        if evidence.skipped_missing:
            skip_notes = [f"{cnt} missing in '{col}'" for col, cnt in evidence.skipped_missing.items()]
            ans += f" ({', '.join(skip_notes)} excluded)."
        return ans

    # 4. Group Aggregation / Top N
    if plan.group_by and result.rows:
        gb_col = plan.group_by[0].column
        m = plan.metrics[0] if plan.metrics else None
        m_alias = m.alias or (f"{m.agg.value}_{m.column}" if m and m.column else "count") if m else result.columns[1]

        top_row = result.rows[0]
        top_group = top_row.get(gb_col)
        top_val = format_number(top_row.get(m_alias))

        metric_name = m.column if m and m.column else "records"

        runner_text = ""
        if len(result.rows) > 1:
            r2 = result.rows[1]
            r2_grp, r2_val = r2.get(gb_col), format_number(r2.get(m_alias))
            runner_text = f", followed by **{r2_grp}** with {r2_val}"

        return f"Across all **{result.total_matches}** groups, **{top_group}** leads with **{top_val}** in {metric_name}{runner_text}."

    # 5. Compare Intent
    if plan.intent == Intent.compare and result.rows:
        first_row = result.rows[0]
        first_key = list(first_row.keys())[0]
        return f"Comparison breakdown across {len(result.rows)} items based on {first_key}."

    # 6. Filter / Lookup
    row_count = result.total_matches
    if row_count == 1 and result.rows:
        sample = result.rows[0]
        name_key = next((k for k in sample.keys() if k != "__row__" and any(w in k.lower() for w in ["name", "student", "customer", "person", "order", "id", "item"])), None)
        other_items = [(k, v) for k, v in sample.items() if k != "__row__" and k != name_key and v is not None]

        if name_key:
            lead_val = sample[name_key]
            attr_strings = [f"**{k}** is **{format_clean_value(v, col_types.get(k) == 'currency')}**" for k, v in other_items[:3]]
            if attr_strings:
                return f"For **{lead_val}**, {', and '.join(attr_strings)}."
            return f"Found matching record for **{lead_val}** in '{profile.sheet_name}'."

        formatted_parts = [f"**{k}**: **{format_clean_value(v, col_types.get(k) == 'currency')}**" for k, v in list(sample.items()) if k != "__row__"][:4]
        return f"Found 1 matching record: {', '.join(formatted_parts)}."

    # Multiple rows matched or all rows viewed
    metric_summary = ""
    if result.rows:
        num_keys = [k for k, v in result.rows[0].items() if k != "__row__" and isinstance(v, (int, float))]
        if num_keys:
            primary_k = num_keys[0]
            vals = [r[primary_k] for r in result.rows if r.get(primary_k) is not None and isinstance(r.get(primary_k), (int, float))]
            if vals:
                total_val = sum(vals)
                avg_val = total_val / len(vals)
                col_dtype = col_types.get(primary_k, "float")
                is_curr = col_dtype == "currency"
                metric_summary = f" with an average **{primary_k}** of **{format_number(avg_val, is_curr)}**"

    if plan.filters:
        f_strs = [f"{f.target.column} = '{f.value}'" for f in plan.filters]
        return f"Found **{row_count}** matching records for {', '.join(f_strs)}{metric_summary}."
    else:
        return f"Sheet '{profile.sheet_name}' contains **{row_count}** records{metric_summary}."

class AnswerComposer:
    def __init__(self, llm_service: Optional[LLMService] = None):
        self.llm = llm_service

    def compose(
        self,
        plan: QueryPlan,
        result: QueryResult,
        evidence: Evidence,
        profile: SheetProfile
    ) -> str:
        # Step 1: Always build the deterministic base answer
        deterministic_answer = compose_deterministic_answer(plan, result, evidence, profile)

        # Step 2: Optional rephrase if LLM_REPHRASE=True
        if not settings.LLM_REPHRASE or not self.llm:
            return deterministic_answer

        # Ask LLM to rephrase naturally
        prompt = (
            f"You are a helpful data analyst. Rephrase this concise data answer naturally for a business user.\n"
            f"STRICT INVARIANT: You must preserve every exact number and fact. Never introduce or change any numbers.\n"
            f"Original answer: {deterministic_answer}\n"
            f"Question: {plan.interpretation}"
        )
        try:
            rephrased = self.llm.rephrase(
                system="Rephrase the provided answer without altering or adding any numbers.",
                user=prompt
            )
            # Step 3: Numeric post-check (Section 10 Rule 2)
            orig_nums = set(extract_numbers_from_text(deterministic_answer))
            rephrased_nums = set(extract_numbers_from_text(rephrased))

            # Every number in rephrased text must exist in original numbers
            if rephrased_nums.issubset(orig_nums) and len(rephrased_nums) == len(orig_nums):
                return rephrased
        except Exception:
            pass

        # Discard rephrase if numbers didn't match or on error
        return deterministic_answer
