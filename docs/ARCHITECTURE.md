# Architecture Overview - ExcelMind AI

ExcelMind AI provides verifiable, conversational intelligence over Excel and CSV spreadsheets.

## Core Invariant
The LLM **never** computes numbers, **never** executes code, and **never** sees the full dataset.
The LLM only translates natural language into a validated JSON Query Plan.
Calculations are executed deterministically by a Pandas execution engine.
Every answer provides verifiable evidence: operation steps, matched row counts, and source rows mapped to original Excel row numbers (`__row__`).

## System Components

```
Browser (React 19 + TypeScript + Vite + Tailwind CSS + Plotly.js + TanStack Query)
        |  REST (JSON) / Multipart File Upload (owner token via HttpOnly cookie)
Express Proxy / Vite Dev Server (:3000)
        |  Proxies /api/v1
FastAPI (:8001 / :8000)
  ├── api/              Endpoint route handlers (files, search, queries, insights, exports, sessions, health)
  ├── core/             Configuration, security, error handling, rate limiting, logging
  ├── schemas/          Pydantic v2 schemas for QueryPlan, Evidence, Profile, Insights, API responses
  ├── services/
  │     ├── file_service.py         File storage, validation, magic byte checking, TTL cleanup
  │     ├── spreadsheet_service.py  Header detection, merged cell handling, type inference, profiling
  │     ├── search_service.py       Deterministic keyword & structured filtering without LLM
  │     ├── llm_service.py          Provider-agnostic interface (Anthropic, Gemini, MockLLM)
  │     ├── query_planner.py        Prompt construction, plan parsing, single retry with error feedback
  │     ├── query_validator.py      Whitelist & semantic validation, fuzzy column matching
  │     ├── query_executor.py       Deterministic Pandas execution, evidence tracking, timeouts
  │     ├── answer_composer.py      Deterministic templating + optional LLM rephrasing with number guard
  │     ├── insight_service.py      Data quality checks, duplicates, mixed types, outliers, trends
  │     ├── chart_service.py        Automatic chart suggestion, Plotly JSON figure generation
  │     └── export_service.py       Safe CSV/XLSX export with formula injection neutralization
  └── storage/          In-memory session store with TTL + on-disk file storage
```

## Security & Privacy
- Zero-account isolation using opaque 32-byte `em_owner` HttpOnly tokens. Cross-owner access yields 404.
- Untrusted cell text is sanitized and truncated (max 40 chars) before inclusion in schema prompts.
- All exports guard against formula injection by prefixing formula triggers (`=`, `+`, `-`, `@`) with `'`.
