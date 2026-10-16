"""Session query history and clear session route handlers."""

from fastapi import APIRouter, Request
from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit_check
from app.core.security import get_or_set_owner_token
from app.storage.session_store import session_store

router = APIRouter(prefix="/sessions", tags=["Sessions"])

@router.get("/{session_id}/history")
def get_session_history(session_id: str, request: Request):
    rate_limit_check(request)
    owner_token, _ = get_or_set_owner_token(request)
    session = session_store.get_session(session_id, owner_token)
    if not session:
        return {"session_id": session_id, "history": []}

    history_items = [
        {
            "question": turn.question,
            "plan_summary": turn.plan.get("interpretation", ""),
            "result_summary": turn.result_summary,
            "row_count": turn.row_count,
            "timestamp": turn.timestamp
        }
        for turn in session.history
    ]
    return {"session_id": session_id, "history": history_items}

@router.delete("/{session_id}")
def clear_session_history(session_id: str, request: Request):
    rate_limit_check(request)
    owner_token, _ = get_or_set_owner_token(request)
    deleted = session_store.delete_session(session_id, owner_token)
    return {"status": "ok", "deleted": deleted}
