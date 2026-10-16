"""Query planning service: schema context generation, prompt assembly, LLM calling, and validation retry."""

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import ValidationError

from app.core.config import settings
from app.core.errors import UnprocessableEntityError
from app.core.logging import logger
from app.schemas.plan import Intent, QueryPlan
from app.schemas.profile import SheetProfile
from app.services.llm_service import LLMService, get_llm_service
from app.services.query_validator import validate_query_plan

def sanitize_prompt_string(val: Any, max_len: int = 40) -> str:
    """Sanitize and truncate untrusted cell-derived strings (Section 7.4)."""
    if val is None:
        return ""
    s = str(val).strip()
    # Strip control chars, newlines, and role markers
    s = re.sub(r'[\r\n\t]+', ' ', s)
    s = re.sub(r'(system|user|assistant|human|ai)\s*:', '', s, flags=re.IGNORECASE)
    return s[:max_len].strip()

def build_schema_context(profile: SheetProfile) -> Dict[str, Any]:
    """Build bounded schema context for the LLM (Section 4 Rule 2).
    Includes column metadata, min/max, up to 8 distinct values (max 40 chars),
    and up to 3 truncated sample rows. Never the full dataset.
    """
    col_info = []
    for col in profile.columns:
        item = {
            "name": col.name,
            "original_name": col.original_name,
            "dtype": col.dtype,
            "null_count": col.null_count,
            "null_pct": f"{col.null_pct}%",
            "unique_count": col.unique_count,
        }
        if col.min is not None:
            item["min"] = col.min
        if col.max is not None:
            item["max"] = col.max
        if col.top_values and col.dtype in ["categorical", "text", "boolean"]:
            # Bounded to 8 distinct values, 40 chars max each
            item["distinct_values"] = [
                sanitize_prompt_string(v, 40) for v in col.top_values[:8] if v is not None
            ]
        col_info.append(item)

    # Sample rows (up to 3 rows, truncated)
    sample_records = []
    sample_len = min(3, len(profile.columns[0].sample_values) if profile.columns else 0)
    for r_idx in range(sample_len):
        row_dict = {}
        for col in profile.columns:
            if r_idx < len(col.sample_values):
                row_dict[col.name] = sanitize_prompt_string(col.sample_values[r_idx], 40)
        sample_records.append(row_dict)

    return {
        "sheet_name": profile.sheet_name,
        "row_count": profile.row_count,
        "column_count": profile.column_count,
        "columns": col_info,
        "sample_rows": sample_records,
    }

def load_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "planner_system.md")
    examples_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "examples.json")
    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            base_system = f.read()
    except Exception:
        base_system = "You convert user spreadsheet questions into JSON QueryPlans. Return only valid JSON."

    try:
        with open(examples_path, "r", encoding="utf-8") as f:
            examples = f.read()
            base_system += f"\n\n### Few-Shot QueryPlan Examples:\n{examples}"
    except Exception:
        pass

    return base_system

class QueryPlanner:
    def __init__(self, llm_service: Optional[LLMService] = None):
        self.llm = llm_service or get_llm_service()
        self.system_prompt = load_system_prompt()

    def generate_plan(
        self,
        question: str,
        profile: SheetProfile,
        previous_plan: Optional[Dict[str, Any]] = None
    ) -> Tuple[QueryPlan, List[str]]:
        """Generate, validate, and optionally retry a QueryPlan."""
        schema_ctx = build_schema_context(profile)
        user_message = self._build_user_message(question, schema_ctx, previous_plan)

        # First attempt
        try:
            raw_plan = self.llm.plan(self.system_prompt, user_message, schema_ctx)
        except Exception as e:
            logger.warning(f"Primary LLM plan call failed: {e}. Attempting semantic heuristic planner...")
            from app.services.llm_service import generate_heuristic_plan
            try:
                raw_plan = generate_heuristic_plan(question, schema_ctx)
            except Exception as h_err:
                logger.error(f"Heuristic planner failed: {h_err}")
                fallback_plan = QueryPlan(
                    intent=Intent.clarify,
                    clarification_question=f"I couldn't interpret that question with confidence. Could you rephrase it or specify which columns to look at?",
                    clarification_options=[c.name for c in profile.columns[:4]],
                    interpretation=f"Could not construct a valid query plan for: '{question}'",
                    confidence="low"
                )
                return fallback_plan, [f"Planner error: {str(e)}"]
        
        parsed_plan, val_result, error_msg = self._try_parse_and_validate(raw_plan, profile)
        if parsed_plan and val_result:
            return parsed_plan, val_result.warnings

        # Section 7.5: Retry ONCE with error feedback
        logger.warning(f"Plan validation failed on first attempt: {error_msg}. Retrying once...")
        retry_message = (
            f"{user_message}\n\n"
            f"<previous_attempt_errors>\n"
            f"Your previous output was invalid: {error_msg}. Return corrected JSON only.\n"
            f"</previous_attempt_errors>"
        )

        try:
            raw_retry_plan = self.llm.plan(self.system_prompt, retry_message, schema_ctx)
            parsed_plan, val_result, retry_error = self._try_parse_and_validate(raw_retry_plan, profile)
            if parsed_plan and val_result:
                return parsed_plan, val_result.warnings + ["Plan was corrected following a validation retry."]
        except Exception as e:
            retry_error = str(e)

        # Graceful clarify fallback per Section 4 Rule 4
        fallback_plan = QueryPlan(
            intent=Intent.clarify,
            clarification_question=f"I couldn't interpret that question with confidence. Could you rephrase it or specify which columns to look at?",
            clarification_options=[c.name for c in profile.columns[:4]],
            interpretation=f"Could not construct a valid query plan for: '{question}'",
            confidence="low"
        )
        return fallback_plan, [f"Validation failed: {error_msg or retry_error}"]

    def _build_user_message(
        self, question: str, schema_ctx: Dict[str, Any], previous_plan: Optional[Dict[str, Any]]
    ) -> str:
        schema_json = json.dumps(schema_ctx, indent=2)
        prev_json = json.dumps(previous_plan, indent=2) if previous_plan else "none"
        clean_q = sanitize_prompt_string(question, 200)

        return (
            f"<schema>\n{schema_json}\n</schema>\n\n"
            f"<previous_plan>\n{prev_json}\n</previous_plan>\n\n"
            f"<question>\n{clean_q}\n</question>"
        )

    def _try_parse_and_validate(self, raw_plan: Dict[str, Any], profile: SheetProfile):
        try:
            plan = QueryPlan.model_validate(raw_plan)
            val_result = validate_query_plan(plan, profile)
            return val_result.plan, val_result, None
        except ValidationError as ve:
            return None, None, f"Schema validation error: {ve.errors()[0]['msg'] if ve.errors() else str(ve)}"
        except UnprocessableEntityError as ue:
            return None, None, f"Semantic error: {ue.message}"
        except Exception as e:
            return None, None, str(e)
