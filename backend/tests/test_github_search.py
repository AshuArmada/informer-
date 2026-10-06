import asyncio
import gzip
from types import SimpleNamespace

import httpx
import pytest

from app.github import GitHubClient
from app import github_search
from app.github_search import GitHubRateLimited, search_requests


@pytest.fixture(autouse=True)
def isolated_cache():
    search_requests.cache_clear()
    yield
    search_requests.cache_clear()


@pytest.fixture
def clock(monkeypatch):
    value = [1000.0]
    monkeypatch.setattr(github_search, "time", SimpleNamespace(time=lambda: value[0], monotonic=lambda: value[0]))
    return value


def mock_github(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.asyncio
async def test_refresh_reuses_results_across_clients_but_not_tokens_or_filters(monkeypatch):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"items": [], "total_count": 0})
    mock_github(monkeypatch, handler)
    for token, query in [("first", "python"), ("first", "python"), ("second", "python"), ("first", "rust")]:
        async with GitHubClient(token) as client:
            await client.get_json("/search/repositories", {"q": query})
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_concurrent_duplicate_searches_make_one_upstream_call(monkeypatch):
    calls = []
    async def handler(request):
        calls.append(request)
        await asyncio.sleep(0.01)
        return httpx.Response(200, json={"total_count": 5})
    mock_github(monkeypatch, handler)
    async with GitHubClient("same") as first, GitHubClient("same") as second:
        results = await asyncio.gather(first.get_json("/search/issues", {"q": "same"}), second.get_json("/search/issues", {"q": "same"}))
    assert results == [{"total_count": 5}] * 2
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_last_quota_slot_blocks_new_searches_but_keeps_cached_results(monkeypatch, clock):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"total_count": 2}, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1030"})
    mock_github(monkeypatch, handler)
    async with GitHubClient("same") as client:
        await client.get_json("/search/issues", {"q": "old"})
        assert await client.get_json("/search/issues", {"q": "old"}) == {"total_count": 2}
        with pytest.raises(GitHubRateLimited) as error:
            await client.get_json("/search/issues", {"q": "new"})
        assert error.value.retry_after == 31
        assert len(calls) == 1
        clock[0] += 32
        await client.get_json("/search/issues", {"q": "new"})
        assert len(calls) == 2


@pytest.mark.asyncio
async def test_rate_limit_stops_queued_checks_and_failed_check_retries_after_reset(monkeypatch, clock):
    calls = []
    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(403, json={"message": "API rate limit exceeded"}, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1030"})
        return httpx.Response(200, json={"total_count": 7})
    mock_github(monkeypatch, handler)
    async with GitHubClient("same") as first, GitHubClient("same") as second:
        results = await asyncio.gather(first.get_json("/search/issues", {"q": "first"}), second.get_json("/search/issues", {"q": "second"}), return_exceptions=True)
        assert all(isinstance(result, GitHubRateLimited) for result in results)
        assert len(calls) == 1
        clock[0] += 32
        assert await first.get_json("/search/issues", {"q": "first"}) == {"total_count": 7}
        assert len(calls) == 2


@pytest.mark.parametrize("status,headers,message,expected", [
    (403, {}, "Resource not accessible", None),
    (401, {}, "Bad credentials", None),
    (403, {"retry-after": "20"}, "Secondary rate limit", 21),
    (429, {}, "Too many requests", 60),
    (403, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "bad"}, "Limit", 60),
])
def test_rate_limits_are_distinguished_from_permission_errors(clock, status, headers, message, expected):
    assert github_search.retry_delay(httpx.Response(status, headers=headers, json={"message": message})) == expected


@pytest.mark.asyncio
async def test_failed_and_incomplete_results_are_not_cached(monkeypatch):
    responses = [httpx.Response(503), httpx.Response(200, json={"incomplete_results": True}), httpx.Response(200, json={"total_count": 4})]
    def handler(request):
        return responses.pop(0)
    mock_github(monkeypatch, handler)
    async with GitHubClient("same") as client:
        with pytest.raises(httpx.HTTPStatusError):
            await client.get_json("/search/issues", {"q": "same"})
        assert (await client.get_json("/search/issues", {"q": "same"}))["incomplete_results"]
        assert await client.get_json("/search/issues", {"q": "same"}) == {"total_count": 4}
    assert not responses


@pytest.mark.asyncio
async def test_cache_expiry_and_compressed_responses(monkeypatch, clock):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, content=gzip.compress(b'{"total_count": 4}'), headers={"content-encoding": "gzip"})
    mock_github(monkeypatch, handler)
    async with GitHubClient("same") as client:
        for _ in range(2):
            assert await client.get_json("/search/issues", {"q": "same"}) == {"total_count": 4}
        assert len(calls) == 1
        clock[0] += github_search.CACHE_SECONDS + 1
        await client.get_json("/search/issues", {"q": "same"})
        assert len(calls) == 2


@pytest.mark.asyncio
async def test_cache_is_bounded_and_does_not_store_auth_headers(monkeypatch):
    monkeypatch.setattr(github_search, "MAX_CACHE_ENTRIES", 2)
    mock_github(monkeypatch, lambda request: httpx.Response(200, json={"total_count": 1}))
    async with GitHubClient("secret") as client:
        for query in ["one", "two", "three"]:
            await client.get_json("/search/issues", {"q": query})
        assert len(client._search.cache) == 2
        for _, response in client._search.cache.values():
            assert "authorization" not in response.request.headers
