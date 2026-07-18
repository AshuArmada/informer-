from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import SavedRepo
from app.saved_store import add_saved, remove_saved
from app.schemas import SavedRepo as SavedRepoSchema

router = APIRouter(prefix="/api/saved", tags=["saved"])


def _to_schema(row: SavedRepo) -> SavedRepoSchema:
    return SavedRepoSchema(
        repo_full_name=row.repo_full_name,
        description=row.description,
        language=row.language,
        html_url=row.html_url,
        stars=row.stars,
    )


@router.get("", response_model=list[SavedRepoSchema])
async def list_saved(db: AsyncSession = Depends(get_db)) -> list[SavedRepoSchema]:
    result = await db.execute(select(SavedRepo).order_by(SavedRepo.saved_at.desc()))
    return [_to_schema(r) for r in result.scalars()]


@router.post("", response_model=list[SavedRepoSchema], status_code=201)
async def save_repo(body: SavedRepoSchema, db: AsyncSession = Depends(get_db)) -> list[SavedRepoSchema]:
    existing = await db.execute(
        select(SavedRepo).where(SavedRepo.repo_full_name == body.repo_full_name)
    )
    if existing.scalar_one_or_none() is None:
        db.add(
            SavedRepo(
                repo_full_name=body.repo_full_name,
                description=body.description,
                language=body.language,
                html_url=body.html_url,
                stars=body.stars,
            )
        )
        await db.commit()
        add_saved(body.repo_full_name)
    return await list_saved(db)


@router.delete("")
async def unsave_repo(repo_full_name: str, db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(delete(SavedRepo).where(SavedRepo.repo_full_name == repo_full_name))
    await db.commit()
    remove_saved(repo_full_name)
    return {"removed": repo_full_name}
