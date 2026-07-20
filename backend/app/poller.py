from __future__ import annotations

import asyncio
import datetime as dt
import logging

from sqlalchemy import select

from app.db import async_session_factory
from app.github import GitHubClient, GitHubTokenNotConfigured, get_github_client
from app.models import Snapshot
from app.saved_store import get_saved_names

logger = logging.getLogger("informer.poller")

# "Trending" is approximated as repos that are either brand new or actively pushed to,
# ranked by stars. There's no official GitHub trending API (see CLAUDE.md).
CREATED_WINDOW_DAYS = 14
PUSHED_WINDOW_DAYS = 3
MAX_TRACKED_REPOS = 100


class TrendingCache:
    """In-memory cache of the latest computed ranking. Read by GET /api/trending and
    pushed to SSE subscribers; recomputed from scratch on every poll cycle."""

    def __init__(self) -> None:
        self.entries: list[dict] = []
        self.last_updated: dt.datetime | None = None
        self.error: str | None = None

    def snapshot(self) -> dict:
        # Saved (bookmarked) repos are excluded from the trending feed at read time,
        # so saving one takes effect immediately without waiting for the next poll.
        saved = get_saved_names()
        repos = [e for e in self.entries if e["repo_full_name"] not in saved]
        return {
            "updated_at": self.last_updated.isoformat() if self.last_updated else None,
            "error": self.error,
            "repos": repos,
        }


trending_cache = TrendingCache()

_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subscribers.discard(queue)


async def _broadcast() -> None:
    payload = trending_cache.snapshot()
    for queue in list(_subscribers):
        await queue.put(payload)


async def _search_candidates(client: GitHubClient) -> dict[str, dict]:
    """Merge results from a couple of Search API queries approximating "trending":
    recently-created repos and recently-pushed-to repos, both sorted by stars."""
    now = dt.datetime.now(dt.timezone.utc)
    created_after = (now - dt.timedelta(days=CREATED_WINDOW_DAYS)).strftime("%Y-%m-%d")
    pushed_after = (now - dt.timedelta(days=PUSHED_WINDOW_DAYS)).strftime("%Y-%m-%d")

    candidates: dict[str, dict] = {}
    for query in (f"created:>{created_after}", f"pushed:>{pushed_after}"):
        try:
            items = await client.search_repositories(query, sort="stars", order="desc")
        except Exception:
            logger.exception("GitHub search failed for query %r", query)
            continue
        for item in items:
            candidates.setdefault(item["full_name"], item)
    return candidates


async def poll_once() -> None:
    async with async_session_factory() as db:
        try:
            client = await get_github_client(db)
        except GitHubTokenNotConfigured:
            trending_cache.error = "No GitHub token configured — add one in Settings."
            await _broadcast()
            return

        async with client:
            candidates = await _search_candidates(client)
        if not candidates:
            trending_cache.error = "GitHub returned no results (rate-limited, or the token lacks access)."
            await _broadcast()
            return

        top_repos = sorted(
            candidates.values(), key=lambda r: r["stargazers_count"], reverse=True
        )[:MAX_TRACKED_REPOS]
        full_names = [r["full_name"] for r in top_repos]

        # Latest known snapshot per repo *before* this poll, i.e. the previous poll's stars.
        previous_stmt = (
            select(Snapshot)
            .distinct(Snapshot.repo_full_name)
            .where(Snapshot.repo_full_name.in_(full_names))
            .order_by(Snapshot.repo_full_name, Snapshot.captured_at.desc())
        )
        previous_result = await db.execute(previous_stmt)
        previous_by_repo = {s.repo_full_name: s for s in previous_result.scalars()}

        captured_at = dt.datetime.now(dt.timezone.utc)
        entries: list[dict] = []
        for repo in top_repos:
            full_name = repo["full_name"]
            stars = repo["stargazers_count"]
            previous = previous_by_repo.get(full_name)
            delta = stars - previous.stars if previous is not None else None

            db.add(
                Snapshot(
                    repo_full_name=full_name,
                    stars=stars,
                    description=repo.get("description"),
                    language=repo.get("language"),
                    html_url=repo["html_url"],
                    captured_at=captured_at,
                )
            )
            entries.append(
                {
                    "repo_full_name": full_name,
                    "stars": stars,
                    "star_delta": delta,
                    "description": repo.get("description"),
                    "language": repo.get("language"),
                    "html_url": repo["html_url"],
                }
            )

        await db.commit()

        # Velocity-ranked first (needs 2+ poll cycles of history), newcomers-by-raw-stars after.
        # On a fresh DB nothing has a delta yet, so this reduces to a plain star-count ranking.
        with_delta = sorted(
            (e for e in entries if e["star_delta"] is not None),
            key=lambda e: e["star_delta"],
            reverse=True,
        )
        without_delta = sorted(
            (e for e in entries if e["star_delta"] is None),
            key=lambda e: e["stars"],
            reverse=True,
        )

        trending_cache.entries = with_delta + without_delta
        trending_cache.last_updated = captured_at
        trending_cache.error = None
        await _broadcast()


async def poller_loop(interval_minutes: int) -> None:
    while True:
        try:
            await poll_once()
        except Exception:
            logger.exception("Unhandled error during trending poll")
            trending_cache.error = "Unexpected error during polling — check server logs."
            await _broadcast()
        await asyncio.sleep(interval_minutes * 60)
