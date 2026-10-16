"""Security tests: owner token isolation, cross-owner 404, formula injection neutralization."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import sanitize_csv_cell, generate_opaque_id

def test_formula_injection_neutralization():
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-5+2") == "'-5+2"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    assert sanitize_csv_cell("Regular text") == "Regular text"
    assert sanitize_csv_cell("12345") == "12345"

def test_opaque_id_generation():
    id1 = generate_opaque_id(16)
    id2 = generate_opaque_id(16)
    assert len(id1) >= 20
    assert id1 != id2

@pytest.mark.asyncio
async def test_cross_owner_access_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with open("sample_data/students_demo.xlsx", "rb") as f:
            content = f.read()

        # Upload as Owner 1
        files = {"file": ("students_demo.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        resp1 = await client.post("/api/v1/files", files=files)
        assert resp1.status_code == 201
        file_id = resp1.json()["file_id"]
        owner1_cookie = resp1.cookies["em_owner"]

        # Access with Owner 1 cookie: succeeds
        resp_valid = await client.get(f"/api/v1/files/{file_id}/sheets", cookies={"em_owner": owner1_cookie})
        assert resp_valid.status_code == 200

        # Access with Owner 2 cookie: MUST return 404 per Section 15 (not 403)
        fake_owner = "another_owner_token_that_does_not_own_this_file_123456"
        resp_invalid = await client.get(f"/api/v1/files/{file_id}/sheets", cookies={"em_owner": fake_owner})
        assert resp_invalid.status_code == 404
        assert resp_invalid.json()["error"]["code"] == "NOT_FOUND"
