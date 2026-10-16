"""Query processing endpoint: plan generation, deterministic execution, and result response."""

import time
import math
import uuid
import pandas as pd
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Query, Request

from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token
from app.schemas.plan import Intent, QueryResponse
from app.services.answer_composer import AnswerComposer
from app.services.chart_service import auto_suggest_chart, build_plotly_figure
from app.services.query_executor import QueryExecutor
from app.services.query_planner import QueryPlanner
from app.services.spreadsheet_service import SpreadsheetParser
from app.storage.file_store import file_store
from app.storage.session_store import SessionTurn, session_store

router = APIRouter(prefix="/files", tags=["Queries"])

class QueryRequest(BaseModel):
    question: str
    sheet: Optional[str] = None
    session_id: Optional[str] = None
    chart: Optional[Literal["bar", "line", "pie", "scatter", "histogram", "none"]] = None

class ChartUpdateRequest(BaseModel):
    chart_type: Literal["bar", "line", "pie", "scatter", "histogram", "none"]
    x: Optional[str] = None
    y: Optional[str] = None

@router.post("/{file_id}/query", response_model=QueryResponse)
def execute_natural_language_query(
    file_id: str,
    payload: QueryRequest,
    request: Request
):
    rate_limit_check(request, is_query=True)
    start_time = time.time()
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))

    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    # 1. Load sheet and profile
    parser = SpreadsheetParser(meta.file_path, meta.file_type)
    target_sheet = payload.sheet or parser.sheet_names[0]
    df, profile = parser.read_sheet(target_sheet)

    # Check if instruction is a spreadsheet data modification request
    from app.services.data_modifier import is_modification_request, DataModifier
    if is_modification_request(payload.question):
        modifier = DataModifier(meta.file_path, meta.file_type, target_sheet)
        mod_df, summary, success = modifier.apply_modification(payload.question, df, profile)
        if success:
            # Record temp modification on metadata while main Excel file stays untouched
            meta.record_temp_modification(payload.question, summary)

            # Re-read to get pristine profile and clean records from temp Excel
            parser = SpreadsheetParser(meta.file_path, meta.file_type)
            new_df, new_profile = parser.read_sheet(target_sheet)

            session = session_store.get_or_create_session(payload.session_id, owner_token, file_id)
            client_rows = new_df.head(200).to_dict(orient="records")
            clean_rows = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in client_rows]

            temp_clarification = " (Changes updated in temp working Excel; your main original Excel file remains untouched)."
            full_answer = summary if summary.endswith(".") else f"{summary}."
            full_answer += temp_clarification

            return QueryResponse(
                result_id="modified",
                session_id=session.session_id,
                status="ok",
                answer=full_answer,
                interpretation=f"Data modification (Temp Working Excel): {payload.question}",
                result={
                    "columns": list(new_df.columns),
                    "rows": clean_rows,
                    "total_matches": len(new_df),
                    "truncated": len(new_df) > 200
                },
                evidence={
                    "plan_plain_english": f"Temp spreadsheet modified: {summary}. Main Excel file remains original.",
                    "operation_steps": ["Applied modification to temp worksheet", f"New shape: {len(new_df)} rows × {len(new_df.columns)} columns"],
                    "matched_row_count": len(new_df),
                    "source_rows": clean_rows[:20],
                    "source_row_numbers": list(range(1, min(21, len(new_df) + 1))),
                    "skipped_missing": {},
                    "warnings": []
                },
                chart=None,
                clarification=None,
                plan=None,
                warnings=[],
                latency_ms=(time.time() - start_time) * 1000,
                trace_id=trace_id
            )

    # 2. Retrieve session and previous plan
    session = session_store.get_or_create_session(payload.session_id, owner_token, file_id)
    prev_plan = session.get_last_plan()

    # 3. Plan with QueryPlanner (includes retry on invalid output)
    planner = QueryPlanner()
    plan, planner_warnings = planner.generate_plan(
        question=payload.question,
        profile=profile,
        previous_plan=prev_plan
    )

    # Override chart if user explicitly requested one in payload
    if payload.chart and payload.chart != "none":
        plan.chart = payload.chart

    # 4. Handle Clarification or Unsupported early
    if plan.intent in [Intent.clarify, Intent.unsupported]:
        status_val = "clarify" if plan.intent == Intent.clarify else "unsupported"
        composer = AnswerComposer()
        empty_res = QueryExecutor(df).execute(plan)[2] if plan.intent not in [Intent.clarify, Intent.unsupported] else None
        
        clarif_data = {
            "question": plan.clarification_question,
            "options": plan.clarification_options
        } if plan.intent == Intent.clarify else None

        answer_text = (
            plan.clarification_question if plan.intent == Intent.clarify
            else plan.unsupported_reason or "This request is not supported."
        )

        return QueryResponse(
            result_id="none",
            session_id=session.session_id,
            status=status_val,
            answer=answer_text,
            interpretation=plan.interpretation,
            result={"columns": [], "rows": [], "total_matches": 0, "truncated": False},
            evidence={
                "plan_plain_english": plan.interpretation,
                "operation_steps": [f"Intent: {plan.intent.value}"],
                "matched_row_count": 0,
                "source_rows": [],
                "source_row_numbers": [],
                "skipped_missing": {},
                "warnings": planner_warnings
            },
            chart=None,
            clarification=clarif_data,
            plan=plan,
            warnings=planner_warnings,
            latency_ms=(time.time() - start_time) * 1000,
            trace_id=trace_id
        )

    # 5. Deterministic Execution
    executor = QueryExecutor(df)
    res_df, evidence, query_res = executor.execute(plan)
    evidence.warnings.extend(planner_warnings)

    # 6. Store Result for subsequent exports
    result_id = session_store.store_result(
        file_id=file_id,
        sheet_name=target_sheet,
        df_data=res_df,
        columns=query_res.columns,
        total_matches=query_res.total_matches,
        plan=plan.model_dump()
    )

    # 7. Compose Verified Answer
    composer = AnswerComposer()
    answer_text = composer.compose(plan, query_res, evidence, profile)

    # 8. Chart Selection
    chart_obj = None
    chosen_chart = plan.chart if plan.chart != "none" else None
    if not chosen_chart and (plan.group_by or plan.intent in [Intent.top_n, Intent.aggregate]):
        suggested_type, auto_x, auto_y = auto_suggest_chart(res_df, profile)
        if suggested_type != "none":
            chosen_chart = suggested_type
            plan.chart_x = auto_x
            plan.chart_y = auto_y

    if chosen_chart and chosen_chart != "none":
        chart_obj = build_plotly_figure(
            df=res_df,
            chart_type=chosen_chart,
            x_col=plan.chart_x,
            y_col=plan.chart_y,
            title=f"{plan.interpretation}"
        )

    # 9. Record session turn
    session.add_turn(
        SessionTurn(
            question=payload.question,
            plan=plan.model_dump(),
            result_summary=f"{query_res.total_matches} rows matched",
            row_count=query_res.total_matches
        )
    )

    return QueryResponse(
        result_id=result_id,
        session_id=session.session_id,
        status="ok",
        answer=answer_text,
        interpretation=plan.interpretation,
        result=query_res,
        evidence=evidence,
        chart=chart_obj,
        clarification=None,
        plan=plan,
        warnings=evidence.warnings,
        latency_ms=(time.time() - start_time) * 1000,
        trace_id=trace_id
    )

@router.post("/{file_id}/results/{result_id}/chart")
def update_result_chart(
    file_id: str,
    result_id: str,
    payload: ChartUpdateRequest,
    request: Request
):
    rate_limit_check(request)
    owner_token, is_new = get_or_set_owner_token(request)
    meta = file_store.get_file(file_id, owner_token, allow_adopt=is_new)
    if not meta:
        raise NotFoundError("Spreadsheet not found or session expired.")

    stored = session_store.get_result(result_id)
    if not stored or stored.file_id != file_id:
        raise NotFoundError("Result not found or expired.")

    chart_obj = build_plotly_figure(
        df=stored.df_data,
        chart_type=payload.chart_type,
        x_col=payload.x,
        y_col=payload.y
    )
    return {"status": "ok", "chart": chart_obj}
