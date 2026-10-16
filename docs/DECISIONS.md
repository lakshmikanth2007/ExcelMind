# Architectural Decisions

- **DECISION-001**: FastAPI backend port defaults to 8001 (fallback if 8000 is occupied by container control plane); Express server on port 3000 proxies `/api/v1` requests to FastAPI for unified iframe preview.
- **DECISION-002**: LLM layer implements provider-agnostic interface with `AnthropicLLM`, `GeminiLLM`, and `MockLLM`, allowing seamless operation with either Anthropic API key or Google AI Studio Gemini API key.
- **DECISION-003**: In-memory session store with TTL (120 min) and temporary file directories with automated background cleanup for session management.
- **DECISION-004**: Owner cookie `em_owner` uses 32-byte urlsafe token with `HttpOnly` and `SameSite=Lax` for zero-login privacy isolation.
- **DECISION-005**: Date ambiguity resolution prefers day-first when day > 12 in first position, with fallback warning and day-first default.
- **DECISION-006**: Formula injection neutralization prefixes cells beginning with `=`, `+`, `-`, `@` with a single apostrophe `'` in exports.
- **DECISION-007**: RapidFuzz threshold of 90 score used for fuzzy column matching and categorical filter value resolution.
