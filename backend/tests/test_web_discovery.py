import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import web_discovery as web
from app.routers import contributions as routes


TRENDING = '''<a href="/sponsors/noise">Ignore navigation</a>
<article class="Box-row"><h2><a href="/Org/Project">Org / Project</a></h2>
<p>A useful <strong>project</strong>.</p><span itemprop="programmingLanguage">Python</span>
<a href="/Org/Project/stargazers">12,345</a><a href="/unrelated/contributor">Builder</a></article>'''
FIRST_ISSUE = '''<a href="https://github.com/site/source">Ignore footer</a>
<div id="repo-1"><div><a title="Open org/project on GitHub" href="https://github.com/org/project">org/project</a>
<div class="overflow-auto">A welcoming project</div>
<div><span>lang: </span>Python</div><div><span>stars: </span>12.3K</div></div></div>'''


def test_source_parsers_extract_cards_not_navigation_or_contributors():
    trending = web.parse_page(web.SOURCES[0], TRENDING)
    first_issue = web.parse_page(web.SOURCES[1], FIRST_ISSUE)
    assert len(trending) == len(first_issue) == 1
    assert trending[0]["full_name"] == "Org/Project"
    assert trending[0]["stars"] == 12345
    assert trending[0]["language"] == "Python"
    assert "useful" in trending[0]["description"]
    assert first_issue[0]["stars"] == 12300
    assert first_issue[0]["description"] == "A welcoming project"
    assert first_issue[0]["language"] == "Python"


@pytest.mark.parametrize("url", [
    "https://github.com.evil.test/org/repo", "https://github.com@evil.test/org/repo",
    "http://github.com/org/repo", "//localhost/org/repo", "javascript:alert(1)",
    "https://github.com/org/repo/issues/1", "https://github.com/org/%2e%2e",
    "https://github.com/sponsors/person", "https://github.com/org/..", "https://github.com:443/org/repo",
])
def test_untrusted_repository_links_are_rejected(url):
    assert web.repository_name(url, "https://goodfirstissue.dev/") is None


def test_normalizes_root_links_and_handles_missing_metadata_and_layout_changes():
    assert web.repository_name("/Org/Repo.git?ref=page#readme", "https://github.com/trending") == "Org/Repo"
    repo = web.parse_page(web.SOURCES[0], '<article class="Box-row"><h2><a href="/org/repo">Repo</a></h2></article>')[0]
    assert repo["stars"] is None and repo["language"] is None and repo["description"] is None
    with pytest.raises(ValueError, match="layout"):
        web.parse_page(web.SOURCES[0], "<html>New layout or challenge page</html>")


def test_bounded_sample_and_case_insensitive_deduplication():
    cards = TRENDING + TRENDING.replace("Org/Project", "org/project")
    assert len(web.parse_page(web.SOURCES[0], cards)) == 1
    many = "".join(TRENDING.replace("Org/Project", f"org/project{i}") for i in range(80))
    assert len(web.parse_page(web.SOURCES[0], many)) == web.MAX_REPOS_PER_SOURCE


@pytest.mark.parametrize("value,expected", [(None, None), ("unknown", None), ("0", 0), ("1.2m", 1200000), ("123 stars today", None)])
def test_star_counts_preserve_unknown(value, expected):
    assert web.star_count(value) == expected


@pytest.mark.parametrize("value", [",", "1,,234", "1,23", "9" * 400, "9007199254740992"])
def test_malformed_star_counts_do_not_discard_repository(value):
    repo = web.parse_page(web.SOURCES[0], TRENDING.replace("12,345", value))[0]
    assert repo["full_name"] == "Org/Project"
    assert repo["stars"] is None


@pytest.mark.asyncio
async def test_stale_expiry_applies_during_failure_retry_cooldown(monkeypatch):
    clock = [100.0]
    calls = []
    monkeypatch.setattr(web.time, "monotonic", lambda: clock[0])
    async def fetch(client, source):
        calls.append(source.id)
        if clock[0] > 100:
            raise httpx.ConnectError("offline")
        return TRENDING if source.id == "github-trending" else FIRST_ISSUE
    monkeypatch.setattr(web, "fetch_page", fetch)
    service = web.WebDiscovery()
    await service.discover()
    clock[0] += web.STALE_SECONDS - 1
    assert all(s["stale"] for s in (await service.discover())["sources"])
    calls_before = len(calls)
    clock[0] += 1
    expired = await service.discover()
    assert expired["repos"] == []
    assert all(s["fetched_at"] is None and not s["stale"] for s in expired["sources"])
    assert len(calls) == calls_before  # Expiry must not bypass the failure cooldown.


@pytest.mark.asyncio
async def test_stale_expiry_applies_when_refresh_crosses_deadline(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(web.time, "monotonic", lambda: clock[0])
    async def fetch(client, source):
        if clock[0] > 100:
            clock[0] += 2
            raise httpx.ConnectError("offline")
        return TRENDING
    monkeypatch.setattr(web, "fetch_page", fetch)
    service = web.WebDiscovery()
    async with httpx.AsyncClient() as client:
        await service._source(client, web.SOURCES[0])
        clock[0] += web.STALE_SECONDS - 1
        expired = await service._source(client, web.SOURCES[0])
    assert expired["repos"] == []
    assert expired["fetched_at"] is None


@pytest.mark.asyncio
async def test_deduplicates_provenance_and_coalesces_concurrent_requests(monkeypatch):
    calls = []
    async def fetch(client, source):
        calls.append(source.id)
        await asyncio.sleep(0)
        return TRENDING if source.id == "github-trending" else FIRST_ISSUE
    monkeypatch.setattr(web, "fetch_page", fetch)
    service = web.WebDiscovery()
    first, second = await asyncio.gather(service.discover(), service.discover())
    assert len(first["repos"]) == 1
    assert len(first["repos"][0]["sources"]) == 2
    assert len(calls) == 2
    assert all(s["cached"] for s in second["sources"])
    first["repos"][0]["sources"].clear()
    assert len((await service.discover())["repos"][0]["sources"]) == 2


@pytest.mark.asyncio
async def test_partial_failure_and_stale_recovery_keep_original_fetch_time(monkeypatch):
    clock = [100.0]
    failed = set()
    calls = []
    monkeypatch.setattr(web.time, "monotonic", lambda: clock[0])
    async def fetch(client, source):
        calls.append(source.id)
        if source.id in failed:
            raise httpx.ConnectError("private diagnostic with credentials")
        return TRENDING if source.id == "github-trending" else FIRST_ISSUE
    monkeypatch.setattr(web, "fetch_page", fetch)
    service = web.WebDiscovery()
    failed.add("github-trending")
    first = await service.discover()
    assert first["sources"][0]["error"]
    assert first["sources"][0]["repo_count"] == 0
    assert len(first["repos"]) == 1
    assert "private diagnostic" not in str(first)
    failed.clear()
    clock[0] += web.FAILURE_RETRY_SECONDS + 1
    recovered = await service.discover()
    assert recovered["sources"][0]["error"] is None
    fetched = recovered["sources"][0]["fetched_at"]
    failed.add("github-trending")
    clock[0] += web.CACHE_SECONDS + 1
    stale = await service.discover()
    assert stale["sources"][0]["stale"] is True
    assert stale["sources"][0]["fetched_at"] == fetched
    assert stale["sources"][0]["repo_count"] == 1
    call_count = len(calls)
    await service.discover()
    assert len(calls) == call_count
    clock[0] += web.STALE_SECONDS + 1
    expired = await service.discover()
    assert expired["sources"][0]["repo_count"] == 0
    assert expired["sources"][0]["fetched_at"] is None


@pytest.mark.asyncio
async def test_all_sources_failing_reports_status_without_fake_repos(monkeypatch):
    async def fetch(client, source):
        return "<html>No repository cards</html>"
    monkeypatch.setattr(web, "fetch_page", fetch)
    result = await web.WebDiscovery().discover()
    assert result["repos"] == []
    assert all(s["error"] and s["fetched_at"] is None for s in result["sources"])


@pytest.mark.asyncio
async def test_http_fetch_is_bounded_and_does_not_follow_redirects(monkeypatch):
    requests = []
    mode = ["ok"]
    def handler(request):
        requests.append(request)
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        if mode[0] == "redirect":
            return httpx.Response(302, headers={"location": "http://127.0.0.1/private"})
        return httpx.Response(200, text=TRENDING, headers={"content-type": "text/html"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False) as client:
        assert "Box-row" in await web.fetch_page(client, web.SOURCES[0])
        mode[0] = "redirect"
        with pytest.raises(httpx.HTTPStatusError):
            await web.fetch_page(client, web.SOURCES[0])
        assert len(requests) == 2
        mode[0] = "ok"
        monkeypatch.setattr(web, "MAX_PAGE_BYTES", 20)
        with pytest.raises(ValueError, match="download limit"):
            await web.fetch_page(client, web.SOURCES[0])


def test_web_endpoint_needs_no_database_or_github_token(monkeypatch):
    app = FastAPI()
    app.include_router(routes.router)
    async def discover():
        return {"repos": [], "sources": [], "cache_seconds": 900}
    monkeypatch.setattr(routes.web_discovery, "discover", discover)
    with TestClient(app) as client:
        response = client.get("/api/contributions/web")
        assert response.status_code == 200
        assert response.json()["cache_seconds"] == 900
