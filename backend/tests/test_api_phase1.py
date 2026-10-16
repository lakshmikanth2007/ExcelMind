"""Integration tests for Phase 1 API endpoints."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "llm_configured" in data

@pytest.mark.asyncio
async def test_upload_and_preview_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with open("sample_data/students_demo.xlsx", "rb") as f:
            content = f.read()

        # Upload
        files = {"file": ("students_demo.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        resp = await client.post("/api/v1/files", files=files)
        assert resp.status_code == 201
        data = resp.json()
        assert "file_id" in data
        assert "em_owner" in resp.cookies
        file_id = data["file_id"]
        owner_cookie = resp.cookies["em_owner"]

        # Sheets
        resp_sheets = await client.get(f"/api/v1/files/{file_id}/sheets", cookies={"em_owner": owner_cookie})
        assert resp_sheets.status_code == 200
        assert len(resp_sheets.json()["sheets"]) >= 1

        # Schema
        resp_schema = await client.get(f"/api/v1/files/{file_id}/schema", cookies={"em_owner": owner_cookie})
        assert resp_schema.status_code == 200
        prof = resp_schema.json()["profile"]
        assert prof["row_count"] == 20

        # Preview
        resp_prev = await client.get(f"/api/v1/files/{file_id}/preview?page=1&page_size=10", cookies={"em_owner": owner_cookie})
        assert resp_prev.status_code == 200
        prev_data = resp_prev.json()
        assert len(prev_data["rows"]) == 10
        assert "__row__" in prev_data["columns"]
        # Excel row numbers should start at 2 (since row 1 was header)
        assert prev_data["rows"][0]["__row__"] == 2

        # Delete
        resp_del = await client.delete(f"/api/v1/files/{file_id}", cookies={"em_owner": owner_cookie})
        assert resp_del.status_code == 200

        # Verify 404 after deletion
        resp_after = await client.get(f"/api/v1/files/{file_id}/schema", cookies={"em_owner": owner_cookie})
        assert resp_after.status_code == 404
