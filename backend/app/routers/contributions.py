from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AdvisorError, Provider, generate_advice, provider_config
from app.config import get_settings
from app.contributions import analyze_repository, repo_summary
from app.db import get_db
from app.github import GitHubTokenNotConfigured, get_github_client

router = APIRouter(prefix="/api/contributions", tags=["contributions"])
Owner = Annotated[str, Path(pattern=r"^[A-Za-z0-9][A-Za-z0-9-]{0,38}$")]
Repo = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.-]{1,100}$")]


async def client_dependency(db: AsyncSession = Depends(get_db)):
    try:
        client = await get_github_client(db)
    except GitHubTokenNotConfigured:
        raise HTTPException(400, "Add and validate a GitHub token in Settings to discover contributions.")
    try:
        async with client:
            yield client
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise HTTPException(404, "Repository not found or your token cannot access it.")
        if status in (403, 429):
            raise HTTPException(429, "GitHub rate limit or token permission restriction. Check Settings or try again later.")
        if status == 401:
            raise HTTPException(401, "GitHub rejected your token. Update it in Settings.")
        if status == 422:
            raise HTTPException(422, "GitHub could not understand this search. Try a topic or owner/repository.")
        raise HTTPException(502, "GitHub could not complete the request. Try again.")
    except httpx.TransportError:
        raise HTTPException(502, "GitHub could not be reached. Try again.")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/config")
async def config():
    settings = get_settings()
    providers = [provider_config(settings, p) for p in ("openai", "ollama", "gemini")]
    return {"ai_configured": provider_config(settings, settings.ai_provider)["configured"],
            "default_provider": settings.ai_provider, "providers": providers}


@router.get("/search")
async def search(
    q: str = Query("", max_length=200),
    language: str = Query("", max_length=40, pattern=r"^[\w .+#-]*$"),
    beginner: bool = False,
    collection: Literal["active", "new"] = "active",
    sort: Literal["updated", "stars"] = "updated",
    page: int = Query(1, ge=1, le=25),
    client=Depends(client_dependency),
):
    since = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    query = f"{q.strip()} is:public archived:false fork:false pushed:>={since}"
    if collection == "new":
        query += f" created:>={since}"
    if language:
        query += f' language:"{language}"'
    if beginner:
        query += " good-first-issues:>0"
    result = await client.get_json("/search/repositories", {"q": query, "sort": sort, "order": "desc", "per_page": 12, "page": page})
    repos = result.get("items", [])
    total = result.get("total_count", 0)
    return {"repos": [repo_summary(r) for r in repos if not r.get("private") and not r.get("archived") and not r.get("disabled")],
            "query": query, "page": page, "total_count": total,
            "has_more": page * 12 < min(total, 300), "incomplete_results": result.get("incomplete_results", False),
            "beginner": beginner, "collection": collection, "sort": sort}


@router.get("/repos/{owner}/{name}")
async def analyze(owner: Owner, name: Repo, client=Depends(client_dependency)):
    return await analyze_repository(client, owner, name)


class AdvisorRequest(BaseModel):
    provider: Provider | None = None
    skills: str = Field(default="", max_length=1000)
    experience: str = Field(default="beginner", pattern=r"^(beginner|intermediate|experienced)$")


@router.post("/repos/{owner}/{name}/advice")
async def advice(owner: Owner, name: Repo, body: AdvisorRequest, client=Depends(client_dependency)):
    settings = get_settings()
    provider = body.provider or settings.ai_provider
    selected = provider_config(settings, provider)
    if not selected["configured"]:
        variable = "OLLAMA_BASE_URL" if provider == "ollama" else f"{provider.upper()}_API_KEY"
        raise HTTPException(503, f"{selected['label']} is not configured. Set {variable} in backend/.env and restart the backend.")
    evidence = await analyze_repository(client, owner, name)
    # Cap context; users can inspect the complete fetched issue sample in the UI.
    evidence["issues"] = sorted(evidence["issues"], key=lambda i: (
        bool(i["assignees"]), not any(l.lower() in ("good first issue", "help wanted") for l in i["labels"])
    ))[:20]
    try:
        text = await generate_advice(settings, provider, json.dumps({
            "profile": body.model_dump(exclude={"provider"}), "github_evidence": evidence,
        }))
    except AdvisorError as exc:
        raise HTTPException(502, str(exc))
    return {"text": text, "provider": provider, "model": selected["model"], "fetched_at": evidence["fetched_at"]}
