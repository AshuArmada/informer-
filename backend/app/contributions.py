"""Bounded, evidence-based analysis of public contribution opportunities."""
from __future__ import annotations

import asyncio
import base64
from collections import Counter
from datetime import datetime, timedelta, timezone
from statistics import median
from urllib.parse import urlparse

import httpx

from app.github import GitHubClient


def timestamp(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def acceptance_metrics(pulls: list[dict], now: datetime) -> dict:
    """All-author, closed-PR sample; never infer a contributor's acceptance odds."""
    cutoff = now - timedelta(days=90)
    closed = [p for p in pulls if p.get("closed_at") and cutoff <= timestamp(p["closed_at"]) <= now]
    merged = [p for p in closed if p.get("merged_at")]
    durations = [(timestamp(p["merged_at"]) - timestamp(p["created_at"])).total_seconds() / 86400
                 for p in merged if p.get("created_at")]
    weeks = Counter(timestamp(p["merged_at"]).strftime("%G-W%V") for p in merged)
    return {
        "window_days": 90,
        "sample_size": len(pulls),
        "closed_in_window": len(closed),
        "merged_in_window": len(merged),
        "merge_rate": round(len(merged) / len(closed) * 100, 1) if closed else None,
        "median_merge_days": round(median(durations), 1) if durations else None,
        "weeks_with_merges": len(weeks),
        "latest_sampled_merge": max((p["merged_at"] for p in merged), default=None),
        "sample_capped": len(pulls) >= 100,
    }


def repo_summary(repo: dict) -> dict:
    return {"full_name": repo["full_name"], "description": repo.get("description"),
            "html_url": repo["html_url"], "language": repo.get("language"),
            "stars": repo.get("stargazers_count", 0), "topics": repo.get("topics", []),
            "created_at": repo.get("created_at"), "open_issues_and_prs": repo.get("open_issues_count", 0),
            "pushed_at": repo.get("pushed_at"), "archived": repo.get("archived", False),
            "disabled": repo.get("disabled", False), "license": (repo.get("license") or {}).get("spdx_id")}


async def analyze_repository(client: GitHubClient, owner: str, name: str) -> dict:
    if name in (".", ".."):
        raise ValueError("Enter a valid repository name.")
    path = f"/repos/{owner}/{name}"
    repo = await client.get_json(path)
    if repo.get("private"):
        raise ValueError("Contribution discovery supports public repositories only.")
    warnings: list[str] = []

    async def optional(suffix: str, params: dict | None = None, *, absolute: bool = False):
        try:
            return await client.get_json(suffix if absolute else path + suffix, params)
        except httpx.HTTPError:
            warnings.append(f"Could not load {suffix.strip('/')}. This data is unavailable, not zero.")
            return None

    community, pulls, issue_page = await asyncio.gather(
        optional("/community/profile"),
        optional("/pulls", {"state": "closed", "sort": "updated", "direction": "desc", "per_page": 100}),
        optional("/search/issues", {"q": f"repo:{repo['full_name']} is:issue is:open",
                                  "sort": "updated", "order": "desc", "per_page": 100}, absolute=True),
    )
    if issue_page and issue_page.get("incomplete_results"):
        warnings.append("GitHub returned incomplete issue search results. View all issues on GitHub.")
    files = (community or {}).get("files") or {}
    documents = []
    for key, title in [("contributing", "Contribution guide"), ("code_of_conduct_file", "Code of conduct"),
                       ("pull_request_template", "Pull request template"), ("issue_template", "Issue template"),
                       ("license", "License"), ("readme", "README")]:
        doc = files.get(key)
        if doc and doc.get("html_url"):
            documents.append({"name": title, "url": doc["html_url"]})

    guide = None
    guide_url = (files.get("contributing") or {}).get("url")
    if guide_url:
        parsed = urlparse(guide_url)
        # Never forward the GitHub credential to a URL outside the API host.
        if parsed.scheme == "https" and parsed.netloc == "api.github.com" and parsed.path.startswith("/repos/"):
            try:
                content = await client.get_json(parsed.path)
                if isinstance(content, dict) and content.get("encoding") == "base64":
                    guide = base64.b64decode(content.get("content", "")).decode("utf-8", errors="replace")[:16000]
            except (httpx.HTTPError, ValueError):
                warnings.append("The contribution guide text could not be loaded. Open the source guide.")

    issues = [{"number": i["number"], "title": i["title"], "html_url": i["html_url"],
               "labels": [label["name"] for label in i.get("labels", [])],
               "assignees": [a["login"] for a in i.get("assignees", [])],
               "updated_at": i["updated_at"], "comments": i.get("comments", 0),
               "body_excerpt": (i.get("body") or "")[:1200]}
              for i in (issue_page or {}).get("items", []) if "pull_request" not in i]
    labels = Counter(label for i in issues for label in i["labels"])
    now = datetime.now(timezone.utc)
    pushed = timestamp(repo.get("pushed_at"))
    days = max(0, (now - pushed).days) if pushed else None
    state = "Archived" if repo.get("archived") else "Disabled" if repo.get("disabled") else (
        "Recently active" if days is not None and days <= 30 else
        "Quiet recently" if days is not None else "Activity unknown")
    return {
        "repo": repo_summary(repo), "fetched_at": now.isoformat(), "state": state,
        "days_since_push": days, "community_health": (community or {}).get("health_percentage"),
        "documents": documents, "contributing_excerpt": guide,
        "contributing_detected": bool(files.get("contributing")) if community is not None else None,
        "acceptance": acceptance_metrics(pulls, now) if pulls is not None else None,
        "issues": issues, "issues_available": issue_page is not None,
        "issues_capped": bool(issue_page and (issue_page.get("total_count", 0) > len(issues) or issue_page.get("incomplete_results"))),
        "issue_total": issue_page.get("total_count") if issue_page is not None else None,
        "labels": [{"name": label, "count": count} for label, count in labels.most_common()],
        "warnings": warnings,
    }
