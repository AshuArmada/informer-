import base64
from datetime import datetime, timezone

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.contributions import acceptance_metrics, analyze_repository
from app.routers import contributions as routes


def ai_settings(**overrides):
    values = dict(secret_key="test", ai_provider="openai", openai_api_key=None,
                  openai_model="test-model", gemini_api_key=None, gemini_model="gemini-test",
                  ollama_base_url="http://127.0.0.1:11434", ollama_model="local-test", ai_timeout_seconds=180)
    return Settings(_env_file=None, **(values | overrides))


NOW = datetime(2026, 9, 17, tzinfo=timezone.utc)


def pull(created, closed, merged=None):
    return {"created_at": created, "closed_at": closed, "merged_at": merged}


def test_acceptance_excludes_old_closures_and_uses_closed_denominator():
    result = acceptance_metrics([
        pull("2026-09-01T00:00:00Z", "2026-09-03T00:00:00Z", "2026-09-03T00:00:00Z"),
        pull("2026-08-01T00:00:00Z", "2026-09-05T00:00:00Z"),
        pull("2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z", "2025-02-01T00:00:00Z"),
    ], NOW)
    assert result["merge_rate"] == 50
    assert result["closed_in_window"] == 2
    assert result["median_merge_days"] == 2
    assert result["weeks_with_merges"] == 1
    assert result["sample_size"] == 3


def test_no_closures_means_unknown_rate_not_zero():
    assert acceptance_metrics([], NOW)["merge_rate"] is None
    assert acceptance_metrics([], NOW)["median_merge_days"] is None
    assert acceptance_metrics([pull(None, None)] * 100, NOW)["sample_capped"] is True


class FakeGitHub:
    def __init__(self):
        self.calls = []
        self.private = False
        self.failed = set()
        self.guide_url = "https://api.github.com/repos/org/project/contents/CONTRIBUTING.md"

    async def get_json(self, path, params=None):
        self.calls.append((path, params))
        if path == "/search/repositories":
            return {"items": [await self.get_json("/repos/org/project")], "total_count": 26, "incomplete_results": False}
        if path in self.failed:
            raise httpx.HTTPStatusError("unavailable", request=httpx.Request("GET", "https://api.github.com" + path),
                                        response=httpx.Response(403))
        if path.endswith("/community/profile"):
            return {"health_percentage": 75, "files": {"contributing": {
                "url": self.guide_url, "html_url": "https://github.com/org/project/blob/main/CONTRIBUTING.md"}}}
        if path.endswith("/CONTRIBUTING.md"):
            return {"encoding": "base64", "content": base64.b64encode(b"Run tests before opening a PR.").decode()}
        if path.endswith("/pulls"):
            return []
        if path.endswith("/issues"):
            assert path == "/search/issues"
            assert params["q"] == "repo:org/project is:issue is:open"
            return {"total_count": 1, "incomplete_results": False, "items": [
                {"number": 1, "title": "Fix keyboard navigation", "html_url": "https://github.com/org/project/issues/1",
                 "updated_at": "2026-09-16T00:00:00Z", "labels": [{"name": "good first issue"}], "assignees": []},
                {"number": 2, "pull_request": {}, "title": "Not an issue"},
            ]}
        return {"full_name": "org/project", "html_url": "https://github.com/org/project",
                "created_at": "2026-09-01T00:00:00Z", "open_issues_count": 17,
                "private": self.private, "pushed_at": "2026-09-16T00:00:00Z"}

    async def search_repositories(self, query, **kwargs):
        self.calls.append((query, kwargs))
        return [await self.get_json("/repos/org/project")]


@pytest.mark.asyncio
async def test_analysis_filters_prs_and_counts_labels_and_reads_guide():
    client = FakeGitHub()
    result = await analyze_repository(client, "org", "project")
    assert [i["number"] for i in result["issues"]] == [1]
    assert result["labels"] == [{"name": "good first issue", "count": 1}]
    assert result["contributing_excerpt"] == "Run tests before opening a PR."
    assert result["acceptance"]["merge_rate"] is None
    assert not result["warnings"]


@pytest.mark.asyncio
async def test_partial_failures_remain_unknown_and_do_not_hide_repo():
    client = FakeGitHub()
    client.failed = {"/repos/org/project/pulls", "/repos/org/project/community/profile", "/search/issues"}
    result = await analyze_repository(client, "org", "project")
    assert result["repo"]["full_name"] == "org/project"
    assert result["acceptance"] is None
    assert result["contributing_detected"] is None
    assert result["issues_available"] is False
    assert len(result["warnings"]) == 3


@pytest.mark.asyncio
async def test_issue_search_reports_totals_and_partial_results():
    client = FakeGitHub()
    original = client.get_json
    async def get_json(path, params=None):
        result = await original(path, params)
        if path == "/search/issues":
            result.update(total_count=250, incomplete_results=True)
        return result
    client.get_json = get_json
    result = await analyze_repository(client, "org", "project")
    assert result["issue_total"] == 250
    assert result["issues_capped"] is True
    assert any("incomplete" in w for w in result["warnings"])


@pytest.mark.asyncio
async def test_private_repo_is_rejected_before_loading_evidence():
    client = FakeGitHub()
    client.private = True
    with pytest.raises(ValueError, match="public"):
        await analyze_repository(client, "org", "project")
    assert len(client.calls) == 1


@pytest.mark.asyncio
async def test_guide_url_never_forwards_credentials_to_another_host():
    client = FakeGitHub()
    client.guide_url = "https://untrusted.example/steal"
    result = await analyze_repository(client, "org", "project")
    assert result["contributing_excerpt"] is None
    assert all("untrusted" not in path for path, _ in client.calls)


@pytest.fixture
def api_client():
    app = FastAPI()
    app.include_router(routes.router)
    github = FakeGitHub()
    app.dependency_overrides[routes.client_dependency] = lambda: github
    with TestClient(app) as client:
        yield client, github


def test_search_filters_and_analysis_routes(api_client):
    client, github = api_client
    response = client.get("/api/contributions/search", params={"q": "accessibility", "language": "C++", "beginner": True})
    assert response.status_code == 200
    query = response.json()["query"]
    assert 'language:"C++"' in query
    assert "good-first-issues:>0" in query
    assert "is:public" in query and "archived:false" in query
    assert client.get("/api/contributions/repos/org/project").status_code == 200
    assert client.get("/api/contributions/repos/bad!owner/project").status_code == 422


def test_discovery_cards_new_collection_and_pagination(api_client):
    client, github = api_client
    result = client.get("/api/contributions/search", params={"collection": "new", "sort": "stars", "page": 2}).json()
    assert "created:>=" in result["query"]
    assert result["page"] == 2 and result["has_more"] is True
    assert result["total_count"] == 26
    assert result["repos"][0]["open_issues_and_prs"] == 17
    assert result["repos"][0]["created_at"] == "2026-09-01T00:00:00Z"
    params = next(p for path, p in github.calls if path == "/search/repositories")
    assert params["page"] == 2 and params["sort"] == "stars"
    assert client.get("/api/contributions/search?page=3").json()["has_more"] is False
    assert client.get("/api/contributions/search?page=26").status_code == 422
    assert client.get("/api/contributions/search?collection=unknown").status_code == 422


def test_ai_setup_is_explicit(api_client, monkeypatch):
    client, github = api_client
    monkeypatch.setattr(routes, "get_settings", lambda: ai_settings(openai_api_key=None))
    config = client.get("/api/contributions/config").json()
    assert config["ai_configured"] is False
    assert config["default_provider"] == "openai"
    assert [p["id"] for p in config["providers"]] == ["openai", "ollama", "gemini"]
    response = client.post("/api/contributions/repos/org/project/advice", json={})
    assert response.status_code == 503
    assert github.calls == []


def test_advisor_uses_server_evidence_and_handles_provider_failure(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(routes, "get_settings", lambda: ai_settings(openai_api_key="test-key", openai_model="test-model"))
    original_client = httpx.AsyncClient
    payloads = []

    def handler(request):
        import json
        payloads.append(json.loads(request.content))
        return httpx.Response(200, json={"status": "completed", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": "Start with issue #1 and run tests."}]}]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_client(transport=httpx.MockTransport(handler), **kw))
    response = client.post("/api/contributions/repos/org/project/advice", json={"skills": "Python", "experience": "beginner"})
    assert response.status_code == 200
    assert "issue #1" in response.json()["text"]
    assert payloads[0]["store"] is False
    assert "Run tests before opening a PR" in payloads[0]["input"]
    assert "Python" in payloads[0]["input"]

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_client(
        transport=httpx.MockTransport(lambda req: httpx.Response(429)), **kw))
    response = client.post("/api/contributions/repos/org/project/advice", json={})
    assert response.status_code == 502
    assert "test-key" not in response.text


@pytest.mark.parametrize("provider", ["ollama", "gemini"])
def test_alternative_provider_request_and_response(api_client, monkeypatch, provider):
    import json
    client, _ = api_client
    settings = ai_settings(ai_provider=provider, gemini_api_key="gemini-secret", openai_api_key="openai-secret")
    monkeypatch.setattr(routes, "get_settings", lambda: settings)
    original = httpx.AsyncClient
    calls = []

    def handler(request):
        calls.append(request)
        payload = json.loads(request.content)
        assert "Run tests before opening a PR" in request.content.decode()
        assert "Python" in request.content.decode()
        assert "openai-secret" not in str(request.headers)
        if provider == "ollama":
            assert str(request.url) == "http://127.0.0.1:11434/api/chat"
            assert "gemini-secret" not in str(request.headers)
            assert payload["stream"] is False
            assert payload["model"] == "local-test"
            assert payload["messages"][0]["role"] == "system"
            return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {"content": "Local advice."}})
        assert request.url.host == "generativelanguage.googleapis.com"
        assert "gemini-test:generateContent" in str(request.url)
        assert request.headers["x-goog-api-key"] == "gemini-secret"
        assert "gemini-secret" not in str(request.url)
        assert payload["systemInstruction"]["parts"][0]["text"]
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {"parts": [
            {"text": "hidden reasoning", "thought": True}, {"text": "Gemini advice."}]}}]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    response = client.post("/api/contributions/repos/org/project/advice", json={"skills": "Python"})
    assert response.status_code == 200
    assert response.json()["provider"] == provider
    assert response.json()["text"] == ("Local advice." if provider == "ollama" else "Gemini advice.")
    assert len(calls) == 1
    config = client.get("/api/contributions/config")
    assert config.json()["default_provider"] == provider
    assert "secret" not in config.text


def test_explicit_provider_overrides_default_and_missing_key_is_not_fallback(api_client, monkeypatch):
    client, github = api_client
    monkeypatch.setattr(routes, "get_settings", lambda: ai_settings(ai_provider="ollama"))
    response = client.post("/api/contributions/repos/org/project/advice", json={"provider": "gemini"})
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.text
    assert github.calls == []
    assert client.post("/api/contributions/repos/org/project/advice", json={"provider": "unknown"}).status_code == 422


@pytest.mark.parametrize("provider,payload", [
    ("gemini", {"candidates": []}),
    ("gemini", {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "Partial"}]}}]}),
    ("gemini", {"candidates": [{"finishReason": "SAFETY"}]}),
    ("ollama", {"done": False, "message": {"content": "Partial"}}),
    ("ollama", {"done": True, "done_reason": "length", "message": {"content": "Partial"}}),
    ("ollama", {"done": True, "message": {"content": ""}}),
])
def test_invalid_generation_is_reported_without_fallback(api_client, monkeypatch, provider, payload):
    client, _ = api_client
    monkeypatch.setattr(routes, "get_settings", lambda: ai_settings(ai_provider=provider, gemini_api_key="secret"))
    original = httpx.AsyncClient
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=payload)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    result = client.post("/api/contributions/repos/org/project/advice", json={})
    assert result.status_code == 502
    assert len(calls) == 1
    assert "Partial" not in result.text


def test_ollama_connection_failure_is_actionable(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(routes, "get_settings", lambda: ai_settings(ai_provider="ollama"))
    original = httpx.AsyncClient
    def handler(request):
        raise httpx.ConnectError("private internal diagnostic", request=request)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    response = client.post("/api/contributions/repos/org/project/advice", json={})
    assert response.status_code == 502
    assert "Start Ollama" in response.text
    assert "private internal" not in response.text
