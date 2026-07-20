from __future__ import annotations

import asyncio

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSettings
from app.security import try_decrypt_token

GITHUB_API_BASE = "https://api.github.com"

# Transient network hiccups (connection resets, timeouts) shouldn't bubble up as
# user-facing errors — retry briefly before giving up.
_RETRIES = 2
_RETRY_BACKOFF_SECONDS = 0.5


class GitHubTokenNotConfigured(Exception):
    """Raised when a GitHub-dependent endpoint is hit before a PAT is saved in Settings."""


class GitHubClient:
    """Holds one pooled httpx client for its lifetime — a fresh client per call costs a
    DNS + TLS handshake each time (~1s/call vs ~0.2s reused). Use as an async context
    manager, or call aclose() when done."""

    def __init__(self, token: str) -> None:
        self._http = httpx.AsyncClient(
            base_url=GITHUB_API_BASE,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=20.0,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> GitHubClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def _get(self, url: str, params: dict | None = None) -> httpx.Response:
        """GET with raise_for_status, retrying transient transport errors (resets, timeouts)."""
        for attempt in range(_RETRIES + 1):
            try:
                resp = await self._http.get(url, params=params)
                resp.raise_for_status()
                return resp
            except httpx.TransportError:
                if attempt == _RETRIES:
                    raise
                await asyncio.sleep(_RETRY_BACKOFF_SECONDS * (attempt + 1))
        raise AssertionError("unreachable")

    async def _get_paginated(self, url: str, params: dict, per_page: int) -> list[dict]:
        items: list[dict] = []
        page = 1
        while True:
            resp = await self._get(url, params={**params, "per_page": per_page, "page": page})
            batch = resp.json()
            items.extend(batch)
            if len(batch) < per_page:
                return items
            page += 1

    async def get_authenticated_user(self) -> dict:
        resp = await self._get("/user")
        return resp.json()

    async def search_repositories(
        self, query: str, sort: str = "stars", order: str = "desc", per_page: int = 100
    ) -> list[dict]:
        resp = await self._get(
            "/search/repositories",
            params={"q": query, "sort": sort, "order": order, "per_page": per_page},
        )
        return resp.json().get("items", [])

    async def list_user_repos(self, per_page: int = 100) -> list[dict]:
        return await self._get_paginated(
            "/user/repos", {"affiliation": "owner,organization_member"}, per_page
        )

    async def list_issues(
        self, owner: str, repo: str, state: str = "open", per_page: int = 100
    ) -> list[dict]:
        """Open issues for a repo, with PRs (which GitHub's issues endpoint also returns) filtered out."""
        issues = await self._get_paginated(
            f"/repos/{owner}/{repo}/issues", {"state": state}, per_page
        )
        return [i for i in issues if "pull_request" not in i]

    async def list_pull_requests(
        self, owner: str, repo: str, state: str = "all", per_page: int = 100
    ) -> list[dict]:
        return await self._get_paginated(f"/repos/{owner}/{repo}/pulls", {"state": state}, per_page)


async def get_github_client(db: AsyncSession) -> GitHubClient:
    result = await db.execute(select(AppSettings).limit(1))
    row = result.scalar_one_or_none()
    if row is None or not row.github_token_encrypted:
        raise GitHubTokenNotConfigured()
    token = try_decrypt_token(row.github_token_encrypted)
    if token is None:
        raise GitHubTokenNotConfigured()
    return GitHubClient(token)
