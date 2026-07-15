from __future__ import annotations

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSettings
from app.security import decrypt_token

GITHUB_API_BASE = "https://api.github.com"


class GitHubTokenNotConfigured(Exception):
    """Raised when a GitHub-dependent endpoint is hit before a PAT is saved in Settings."""


class GitHubClient:
    def __init__(self, token: str) -> None:
        self._token = token

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=GITHUB_API_BASE,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=20.0,
        )

    async def get_authenticated_user(self) -> dict:
        async with self._client() as client:
            resp = await client.get("/user")
            resp.raise_for_status()
            return resp.json()

    async def search_repositories(
        self, query: str, sort: str = "stars", order: str = "desc", per_page: int = 100
    ) -> list[dict]:
        async with self._client() as client:
            resp = await client.get(
                "/search/repositories",
                params={"q": query, "sort": sort, "order": order, "per_page": per_page},
            )
            resp.raise_for_status()
            return resp.json().get("items", [])

    async def list_user_repos(self, per_page: int = 100) -> list[dict]:
        repos: list[dict] = []
        async with self._client() as client:
            page = 1
            while True:
                resp = await client.get(
                    "/user/repos",
                    params={
                        "per_page": per_page,
                        "page": page,
                        "affiliation": "owner,organization_member",
                    },
                )
                resp.raise_for_status()
                batch = resp.json()
                repos.extend(batch)
                if len(batch) < per_page:
                    break
                page += 1
        return repos

    async def list_issues(
        self, owner: str, repo: str, state: str = "open", per_page: int = 100
    ) -> list[dict]:
        """Open issues for a repo, with PRs (which GitHub's issues endpoint also returns) filtered out."""
        issues: list[dict] = []
        async with self._client() as client:
            page = 1
            while True:
                resp = await client.get(
                    f"/repos/{owner}/{repo}/issues",
                    params={"state": state, "per_page": per_page, "page": page},
                )
                resp.raise_for_status()
                batch = resp.json()
                issues.extend(batch)
                if len(batch) < per_page:
                    break
                page += 1
        return [i for i in issues if "pull_request" not in i]

    async def list_pull_requests(
        self, owner: str, repo: str, state: str = "all", per_page: int = 100
    ) -> list[dict]:
        prs: list[dict] = []
        async with self._client() as client:
            page = 1
            while True:
                resp = await client.get(
                    f"/repos/{owner}/{repo}/pulls",
                    params={"state": state, "per_page": per_page, "page": page},
                )
                resp.raise_for_status()
                batch = resp.json()
                prs.extend(batch)
                if len(batch) < per_page:
                    break
                page += 1
        return prs


async def get_github_client(db: AsyncSession) -> GitHubClient:
    result = await db.execute(select(AppSettings).limit(1))
    row = result.scalar_one_or_none()
    if row is None or not row.github_token_encrypted:
        raise GitHubTokenNotConfigured()
    token = decrypt_token(row.github_token_encrypted)
    return GitHubClient(token)
