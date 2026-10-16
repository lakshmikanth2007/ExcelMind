"""In-memory session store for conversation turns, query plans, and cached query results."""

import time
from threading import Lock
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.core.security import generate_opaque_id

class SessionTurn:
    def __init__(self, question: str, plan: Dict[str, Any], result_summary: str, row_count: int, timestamp: Optional[float] = None):
        self.question = question
        self.plan = plan
        self.result_summary = result_summary
        self.row_count = row_count
        self.timestamp = timestamp or time.time()

class StoredResult:
    def __init__(self, result_id: str, file_id: str, sheet_name: str, df_data: Any, columns: List[str], total_matches: int, plan: Dict[str, Any]):
        self.result_id = result_id
        self.file_id = file_id
        self.sheet_name = sheet_name
        self.df_data = df_data  # pandas DataFrame
        self.columns = columns
        self.total_matches = total_matches
        self.plan = plan
        self.created_at = time.time()

class Session:
    def __init__(self, session_id: str, owner_token: str, file_id: str):
        self.session_id = session_id
        self.owner_token = owner_token
        self.file_id = file_id
        self.history: List[SessionTurn] = []
        self.created_at = time.time()
        self.last_accessed_at = time.time()

    def touch(self):
        self.last_accessed_at = time.time()

    def add_turn(self, turn: SessionTurn):
        self.history.append(turn)
        # Keep last 10 turns per spec Section 7.6
        if len(self.history) > 10:
            self.history = self.history[-10:]
        self.touch()

    def get_last_plan(self) -> Optional[Dict[str, Any]]:
        if self.history:
            return self.history[-1].plan
        return None

    def is_expired(self, ttl_minutes: int) -> bool:
        return (time.time() - self.last_accessed_at) > (ttl_minutes * 60)

class SessionStore:
    def __init__(self):
        self._sessions: Dict[str, Session] = {}
        self._results: Dict[str, StoredResult] = {}
        self._lock = Lock()

    def get_or_create_session(self, session_id: Optional[str], owner_token: str, file_id: str) -> Session:
        with self._lock:
            if session_id and session_id in self._sessions:
                sess = self._sessions[session_id]
                if sess.owner_token == owner_token and not sess.is_expired(settings.FILE_TTL_MINUTES):
                    sess.touch()
                    return sess
            
            # Create new session
            new_id = generate_opaque_id(16)
            sess = Session(new_id, owner_token, file_id)
            self._sessions[new_id] = sess
            return sess

    def get_session(self, session_id: str, owner_token: str) -> Optional[Session]:
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess or sess.owner_token != owner_token:
                return None
            if sess.is_expired(settings.FILE_TTL_MINUTES):
                del self._sessions[session_id]
                return None
            sess.touch()
            return sess

    def delete_session(self, session_id: str, owner_token: str) -> bool:
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess or sess.owner_token != owner_token:
                return False
            del self._sessions[session_id]
            return True

    def store_result(self, file_id: str, sheet_name: str, df_data: Any, columns: List[str], total_matches: int, plan: Dict[str, Any]) -> str:
        result_id = generate_opaque_id(16)
        stored = StoredResult(result_id, file_id, sheet_name, df_data, columns, total_matches, plan)
        with self._lock:
            self._results[result_id] = stored
            # Keep reasonable LRU limit for results
            if len(self._results) > 200:
                oldest_id = min(self._results.keys(), key=lambda k: self._results[k].created_at)
                del self._results[oldest_id]
        return result_id

    def get_result(self, result_id: str) -> Optional[StoredResult]:
        with self._lock:
            return self._results.get(result_id)

    def cleanup_expired(self):
        with self._lock:
            expired_ids = [sid for sid, s in self._sessions.items() if s.is_expired(settings.FILE_TTL_MINUTES)]
            for sid in expired_ids:
                del self._sessions[sid]

session_store = SessionStore()
