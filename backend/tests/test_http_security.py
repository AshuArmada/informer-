import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse

from app.http_security import LocalSecurityMiddleware, MAX_BODY
from app.main import app as real_app


def client_for(peer="127.0.0.1", host="localhost"):
    app = FastAPI()
    app.add_middleware(LocalSecurityMiddleware)

    @app.api_route("/api/example", methods=["GET", "PUT"])
    async def example():
        return {"ok": True}

    return TestClient(app, base_url=f"http://{host}", client=(peer, 1234))


def test_local_reads_have_security_headers():
    response = client_for().get("/api/example")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_allowed_browser_preflight_and_streaming_responses_still_work():
    client = TestClient(real_app, base_url="http://localhost", client=("127.0.0.1", 1234))
    response = client.options("/api/settings/providers", headers={
        "Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "Content-Type,X-Informer-Request",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    stream_client = client_for()

    @stream_client.app.get("/api/events")
    async def events():
        async def content():
            yield "data: ready\n\n"
        return StreamingResponse(content(), media_type="text/event-stream")

    response = stream_client.get("/api/events")
    assert response.status_code == 200
    assert response.text == "data: ready\n\n"


@pytest.mark.parametrize("peer,host", [("192.168.1.2", "localhost"), ("127.0.0.1", "attacker.example")])
def test_remote_peers_and_rebinding_hosts_are_rejected(peer, host):
    assert client_for(peer, host).get("/api/example").status_code == 403


def test_mutations_require_origin_checks_and_custom_header():
    client = client_for()
    assert client.put("/api/example", json={}).status_code == 403
    assert client.put("/api/example", json={}, headers={"X-Informer-Request": "1", "Origin": "https://evil.example"}).status_code == 403
    assert client.put("/api/example", content="{}", headers={"X-Informer-Request": "1", "Content-Type": "text/plain"}).status_code == 415
    assert client.put("/api/example", json={}, headers={"X-Informer-Request": "1", "Origin": "http://localhost:5173"}).status_code == 200
    assert client.get("/api/example", headers={"Origin": "null"}).status_code == 403
    assert client.get("/api/example", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_rate_limit_has_retry_after():
    client = client_for()
    for _ in range(120):
        assert client.get("/api/example").status_code == 200
    response = client.get("/api/example")
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"


@pytest.mark.asyncio
async def test_chunked_payload_limit_without_content_length():
    client = client_for()
    async def chunks():
        yield b"a" * MAX_BODY
        yield b"extra"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=client.app, client=("127.0.0.1", 1234)), base_url="http://localhost") as http:
        response = await http.put("/api/example", content=chunks(), headers={"X-Informer-Request": "1", "Content-Type": "application/json"})
    assert response.status_code == 413


def test_validation_never_echoes_secrets():
    from app.db import get_db
    real_app.dependency_overrides[get_db] = lambda: None
    try:
        client = TestClient(real_app, base_url="http://localhost", client=("127.0.0.1", 1234))
        response = client.put("/api/settings", json={"github_token": "SECRET WITH WHITESPACE"}, headers={"X-Informer-Request": "1"})
        assert response.status_code == 422
        assert "SECRET WITH WHITESPACE" not in response.text
        assert '"input"' not in response.text
    finally:
        real_app.dependency_overrides.clear()
