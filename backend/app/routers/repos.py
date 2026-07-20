from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.github import GitHubTokenNotConfigured, get_github_client
from app.models import TrackedRepo
from app.schemas import GitHubRepo, TrackRepoRequest

router = APIRouter(prefix="/api/repos", tags=["repos"])


async def _tracked_set(db: AsyncSession) -> set[tuple[str, str]]:
    result = await db.execute(select(TrackedRepo))
    return {(t.owner.lower(), t.name.lower()) for t in result.scalars()}


@router.get("", response_model=list[GitHubRepo])
async def list_repos(db: AsyncSession = Depends(get_db)) -> list[GitHubRepo]:
    try:
        client = await get_github_client(db)
    except GitHubTokenNotConfigured:
        raise HTTPException(status_code=400, detail="No GitHub token configured — add one in Settings.")

    try:
        async with client:
            raw = await client.list_user_repos()
    except Exception as exc:
        # Include the exception type: transport errors often stringify to "",
        # which previously produced an unhelpful empty detail.
        raise HTTPException(
            status_code=502,
            detail=f"GitHub request failed: {type(exc).__name__}: {exc}".rstrip(": "),
        )

    tracked = await _tracked_set(db)
    repos = [
        GitHubRepo(
            full_name=r["full_name"],
            owner=r["owner"]["login"],
            name=r["name"],
            private=r["private"],
            description=r.get("description"),
            html_url=r["html_url"],
            stars=r.get("stargazers_count", 0),
            is_tracked=(r["owner"]["login"].lower(), r["name"].lower()) in tracked,
        )
        for r in raw
    ]
    repos.sort(key=lambda r: r.stars, reverse=True)
    return repos


@router.post("/tracked", response_model=list[GitHubRepo], status_code=201)
async def add_tracked(body: TrackRepoRequest, db: AsyncSession = Depends(get_db)) -> list[GitHubRepo]:
    existing = await db.execute(
        select(TrackedRepo).where(TrackedRepo.owner == body.owner, TrackedRepo.name == body.name)
    )
    if existing.scalar_one_or_none() is None:
        db.add(TrackedRepo(owner=body.owner, name=body.name))
        await db.commit()
    return await list_tracked(db)


@router.delete("/tracked")
async def remove_tracked(owner: str, name: str, db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(
        delete(TrackedRepo).where(TrackedRepo.owner == owner, TrackedRepo.name == name)
    )
    await db.commit()
    return {"removed": f"{owner}/{name}"}


@router.get("/tracked", response_model=list[GitHubRepo])
async def list_tracked(db: AsyncSession = Depends(get_db)) -> list[GitHubRepo]:
    result = await db.execute(select(TrackedRepo).order_by(TrackedRepo.added_at))
    return [
        GitHubRepo(
            full_name=f"{t.owner}/{t.name}",
            owner=t.owner,
            name=t.name,
            private=False,
            description=None,
            html_url=f"https://github.com/{t.owner}/{t.name}",
            stars=0,
            is_tracked=True,
        )
        for t in result.scalars()
    ]
