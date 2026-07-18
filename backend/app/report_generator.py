from __future__ import annotations

import asyncio
import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.github import GitHubClient, get_github_client
from app.models import TrackedRepo


def _group_issues_by_assignee(issues: list[dict]) -> list[dict]:
    """Group open issues by assignee login. Issues with multiple assignees appear under each;
    issues with none go under an 'unassigned' group (assignee=None)."""
    groups: dict[str | None, dict] = {}

    def item(issue: dict) -> dict:
        return {
            "number": issue["number"],
            "title": issue["title"],
            "html_url": issue["html_url"],
        }

    for issue in issues:
        assignees = issue.get("assignees") or []
        if not assignees:
            g = groups.setdefault(None, {"assignee": None, "avatar_url": None, "issues": []})
            g["issues"].append(item(issue))
        else:
            for a in assignees:
                login = a["login"]
                g = groups.setdefault(
                    login, {"assignee": login, "avatar_url": a.get("avatar_url"), "issues": []}
                )
                g["issues"].append(item(issue))

    result = []
    for g in groups.values():
        result.append({**g, "count": len(g["issues"])})

    # Most issues first; unassigned (assignee=None) sinks to the bottom.
    result.sort(key=lambda g: (g["assignee"] is None, -g["count"]))
    return result


def _pr_counts(prs: list[dict]) -> dict:
    open_c = sum(1 for p in prs if p.get("state") == "open")
    merged_c = sum(1 for p in prs if p.get("merged_at"))
    closed_c = sum(1 for p in prs if p.get("state") == "closed" and not p.get("merged_at"))
    return {"open": open_c, "merged": merged_c, "closed": closed_c}


async def _build_repo_report(client: GitHubClient, tracked: TrackedRepo) -> dict:
    full_name = f"{tracked.owner}/{tracked.name}"
    html_url = f"https://github.com/{full_name}"
    try:
        issues, prs = await asyncio.gather(
            client.list_issues(tracked.owner, tracked.name, state="open"),
            client.list_pull_requests(tracked.owner, tracked.name, state="all"),
        )
    except Exception as exc:
        return {
            "full_name": full_name,
            "html_url": html_url,
            "open_issue_count": 0,
            "groups": [],
            "pr_counts": {"open": 0, "merged": 0, "closed": 0},
            "error": f"Couldn't load this repo: {exc}",
        }

    return {
        "full_name": full_name,
        "html_url": html_url,
        "open_issue_count": len(issues),
        "groups": _group_issues_by_assignee(issues),
        "pr_counts": _pr_counts(prs),
        "error": None,
    }


async def generate_report(db: AsyncSession) -> dict:
    """Build the full report for every tracked repo. Raises GitHubTokenNotConfigured
    if no PAT is set."""
    client = await get_github_client(db)
    result = await db.execute(select(TrackedRepo).order_by(TrackedRepo.added_at))
    tracked = list(result.scalars())

    repos = await asyncio.gather(*(_build_repo_report(client, t) for t in tracked))
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "repos": list(repos),
    }
