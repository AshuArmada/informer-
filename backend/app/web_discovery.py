"""Bounded public-page discovery. Scrapling parses HTML; httpx handles async I/O."""
from __future__ import annotations

import asyncio
import copy
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx
from scrapling import Selector


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    url: str
    signal: str


SOURCES = (
    Source("github-trending", "GitHub Trending", "https://github.com/trending", "Trending today"),
    Source("good-first-issue", "Good First Issue", "https://goodfirstissue.dev/", "Listed for first contributions"),
)
MAX_PAGE_BYTES = 2_000_000
MAX_REPOS_PER_SOURCE = 60
CACHE_SECONDS = 15 * 60
FAILURE_RETRY_SECONDS = 60
STALE_SECONDS = 24 * 60 * 60


def repository_name(href: str, base: str) -> str | None:
    """Accept only repository roots; never turn page-supplied links into fetch URLs."""
    try:
        url = urlsplit(urljoin(base, href))
        if url.scheme != "https" or url.netloc.lower() != "github.com":
            return None
        parts = url.path.strip("/").split("/")
        if len(parts) != 2:
            return None
        owner, name = parts
        name = name.removesuffix(".git")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", owner):
            return None
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name) or name in (".", ".."):
            return None
        if owner.lower() in {"sponsors", "features", "topics", "collections", "settings", "orgs", "users", "marketplace"}:
            return None
        return f"{owner}/{name}"
    except ValueError:
        return None


def text_content(node: Selector, query: str) -> str | None:
    matches = node.css(query)
    if not matches:
        return None
    return " ".join(matches[0].get_all_text().split())[:600] or None


def star_count(value: str | None) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)\s*([kKmM]?)", value.strip())
    if not match:
        return None
    count = float(match[1].replace(",", "")) * {"": 1, "k": 1000, "m": 1_000_000}[match[2].lower()]
    # Unknown source data must not fail the whole source or exceed JS integer precision.
    return round(count) if math.isfinite(count) and count <= 2**53 - 1 else None


def parse_page(source: Source, html: str) -> list[dict]:
    page = Selector(html, url=source.url, adaptive=False)
    trending = source.id == "github-trending"
    cards = page.css("article.Box-row" if trending else 'div[id^="repo-"]')
    repos: dict[str, dict] = {}
    for card in cards:
        href = card.css('h2 a::attr(href)' if trending else 'a[title^="Open "]::attr(href)').get()
        name = repository_name(href or "", source.url)
        if not name or name.lower() in repos:
            continue
        if trending:
            description = text_content(card, "p")
            language = text_content(card, '[itemprop="programmingLanguage"]')
            stars = text_content(card, 'a[href$="/stargazers"]')
        else:
            description = text_content(card, ".overflow-auto")
            # Labels are more stable than the site's utility CSS classes.
            language = " ".join(card.xpath('.//div[span[normalize-space()="lang:"]]/text()').getall()).strip() or None
            stars = " ".join(card.xpath('.//div[span[normalize-space()="stars:"]]/text()').getall()).strip() or None
        repos[name.lower()] = {
            "full_name": name, "html_url": f"https://github.com/{name}",
            "description": description, "language": language,
            "stars": star_count(stars), "sources": [],
        }
        if len(repos) >= MAX_REPOS_PER_SOURCE:
            break
    if not repos:
        raise ValueError("No repository cards found; the source layout may have changed.")
    return list(repos.values())


async def fetch_page(client: httpx.AsyncClient, source: Source) -> str:
    # Fixed URLs only, no login cookies, GitHub PAT, or redirect following.
    async with client.stream("GET", source.url) as response:
        response.raise_for_status()
        if "text/html" not in response.headers.get("content-type", "").lower():
            raise ValueError("The source did not return HTML.")
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > MAX_PAGE_BYTES:
                raise ValueError("The source page exceeded the download limit.")
        return body.decode("utf-8", errors="replace")


class WebDiscovery:
    def __init__(self):
        self.cache: dict[str, dict] = {}
        self.lock = asyncio.Lock()

    async def _source(self, client: httpx.AsyncClient, source: Source) -> dict:
        now = time.monotonic()
        previous = self.cache.get(source.id)
        if previous and now < previous["retry_at"]:
            result = copy.deepcopy(previous["result"]) | {"cached": True}
            if result["stale"] and now - previous["success_at"] >= STALE_SECONDS:
                result.update(repos=[], fetched_at=None, stale=False)
            return result
        result = {"id": source.id, "name": source.name, "url": source.url, "signal": source.signal,
                  "repos": [], "fetched_at": None, "cached": False, "stale": False, "error": None}
        try:
            async with asyncio.timeout(20):
                html = await fetch_page(client, source)
                result["repos"] = await asyncio.to_thread(parse_page, source, html)
            result["fetched_at"] = datetime.now(timezone.utc).isoformat()
            success_at = time.monotonic()
            retry_at = success_at + CACHE_SECONDS
        except (httpx.HTTPError, ValueError, TimeoutError) as exc:
            if isinstance(exc, httpx.HTTPStatusError):
                result["error"] = f"Source returned HTTP {exc.response.status_code}. Try again later."
            elif isinstance(exc, ValueError):
                result["error"] = str(exc)
            else:
                result["error"] = "Source could not be reached. Try again later."
            success_at = previous["success_at"] if previous else None
            if success_at is not None and time.monotonic() - success_at < STALE_SECONDS:
                result.update(repos=copy.deepcopy(previous["result"]["repos"]),
                              fetched_at=previous["result"]["fetched_at"], stale=True, cached=True)
            retry_at = time.monotonic() + FAILURE_RETRY_SECONDS
        self.cache[source.id] = {"result": copy.deepcopy(result), "success_at": success_at, "retry_at": retry_at}
        return result

    async def discover(self) -> dict:
        # Coalesce simultaneous requests and reuse each source's cache independently.
        async with self.lock:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers={
                "User-Agent": "Informer/1.0 (local contribution discovery)", "Accept": "text/html",
            }) as client:
                results = await asyncio.gather(*(self._source(client, source) for source in SOURCES))
        repos: dict[str, dict] = {}
        statuses = []
        for result in results:
            provenance = {key: result[key] for key in ("id", "name", "url", "signal", "fetched_at", "stale")}
            statuses.append({key: value for key, value in result.items() if key != "repos"} | {
                "repo_count": len(result["repos"]), "sample_capped": len(result["repos"]) >= MAX_REPOS_PER_SOURCE,
            })
            for repo in result["repos"]:
                key = repo["full_name"].lower()
                if key not in repos:
                    repos[key] = copy.deepcopy(repo)
                repos[key]["sources"].append(provenance)
        return {"repos": list(repos.values()), "sources": statuses, "cache_seconds": CACHE_SECONDS}


web_discovery = WebDiscovery()
