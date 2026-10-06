"""Reuse search results and share GitHub's cooldown across local API requests."""
from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import OrderedDict
from functools import lru_cache
from typing import Awaitable, Callable

import httpx

logger = logging.getLogger("informer.github_search")
CACHE_SECONDS = 120
MAX_CACHE_ENTRIES = 256


class GitHubRateLimited(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = max(1, retry_after)
        super().__init__(f"GitHub search quota reached. Retry in {self.retry_after} seconds.")


def retry_delay(response: httpx.Response) -> int | None:
    limited = response.status_code == 429 or response.headers.get("x-ratelimit-remaining") == "0"
    if response.status_code == 403:
        try:
            message = str(response.json().get("message", "")).lower()
        except (ValueError, AttributeError):
            message = ""
        limited = limited or "rate limit" in message or "retry-after" in response.headers
    if not limited:
        return None
    delays = []
    for name in ("retry-after", "x-ratelimit-reset"):
        try:
            value = float(response.headers[name])
            if name == "x-ratelimit-reset":
                value -= time.time()
            if math.isfinite(value):
                delays.append(max(1, math.ceil(value) + 1))
        except (KeyError, ValueError, OverflowError):
            pass
    return max(delays, default=60)


class SearchRequests:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.cache: OrderedDict[tuple, tuple[float, httpx.Response]] = OrderedDict()
        self.blocked_until = 0.0

    async def get(self, path: str, params: dict | None, fetch: Callable[[], Awaitable[httpx.Response]]) -> httpx.Response:
        key = (path, tuple(sorted(httpx.QueryParams(params).multi_items())))
        # Serialize misses across clients. Concurrent identical requests reuse the
        # first result, and queued requests see an exhausted quota before sending.
        async with self.lock:
            now = time.monotonic()
            for expired in [k for k, (expires, _) in self.cache.items() if expires <= now]:
                del self.cache[expired]
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key][1]
            if self.blocked_until > now:
                raise GitHubRateLimited(math.ceil(self.blocked_until - now))
            try:
                response = await fetch()
            except httpx.HTTPStatusError as exc:
                delay = retry_delay(exc.response)
                logger.warning("GitHub search failed: path=%s status=%s retry_after=%s", path, exc.response.status_code, delay)
                if delay is not None:
                    self.blocked_until = time.monotonic() + delay
                    raise GitHubRateLimited(delay) from None
                raise
            delay = retry_delay(response)
            if delay is not None:
                self.blocked_until = time.monotonic() + delay
            # Do not reuse incomplete evidence. Cached requests contain no auth header.
            if not response.json().get("incomplete_results", False):
                headers = {k: v for k, v in response.headers.items() if k not in ("content-encoding", "content-length", "transfer-encoding")}
                cached = httpx.Response(response.status_code, content=response.content,
                                        headers=headers, request=httpx.Request("GET", response.request.url))
                self.cache[key] = (time.monotonic() + CACHE_SECONDS, cached)
                while len(self.cache) > MAX_CACHE_ENTRIES:
                    self.cache.popitem(last=False)
            return response


@lru_cache(maxsize=16)
def search_requests(credential_digest: str) -> SearchRequests:
    # Credential-scoped: replacing a token cannot reuse another token's results.
    return SearchRequests()
