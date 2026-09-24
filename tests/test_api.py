"""Integration tests for the public FastAPI contract and API safeguards."""

import json
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import MAX_REQUEST_BYTES, app

FIXTURE_PATH = Path(__file__).parents[1] / "fixtures" / "suspicious_email.json"
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    """The project needs only asyncio, so do not require an additional Trio dependency."""

    return "asyncio"


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


async def test_health_endpoint_and_security_headers(client: AsyncClient):
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


async def test_analyze_endpoint_returns_reference_result(client: AsyncClient):
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    response = await client.post("/analyze", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["score"] == 90
    assert result["severity"] == "critical"
    assert len(result["findings"]) == 4


async def test_validation_error_uses_stable_envelope_without_echoing_input(
    client: AsyncClient,
):
    secret_marker = "PRIVATE-MESSAGE-CONTENT"

    response = await client.post(
        "/analyze",
        json={"sender": "invalid", "body": secret_marker, "unexpected": "field"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"]
    assert secret_marker not in response.text


async def test_declared_oversized_request_is_rejected_before_analysis(client: AsyncClient):
    response = await client.post(
        "/analyze",
        content=b"{}",
        headers={"content-type": "application/json", "content-length": str(MAX_REQUEST_BYTES + 1)},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


async def test_untrusted_host_is_rejected(client: AsyncClient):
    response = await client.get("/health", headers={"host": "untrusted.example"})

    assert response.status_code == 400
