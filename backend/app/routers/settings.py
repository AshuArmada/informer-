from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.github import GitHubClient
from app.models import AppSettings
from app.schemas import SettingsStatus, SettingsUpdate
from app.security import encrypt_token, try_decrypt_token

router = APIRouter(prefix="/api/settings", tags=["settings"])

_VALID_PREFIXES = ("ghp_", "github_pat_", "gho_")


def _mask(token: str) -> str:
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:4]}{'•' * 4}{token[-4:]}"


async def _get_row(db: AsyncSession) -> AppSettings | None:
    result = await db.execute(select(AppSettings).limit(1))
    return result.scalar_one_or_none()


async def _get_or_create_row(db: AsyncSession) -> AppSettings:
    row = await _get_row(db)
    if row is None:
        row = AppSettings()
        db.add(row)
        await db.flush()
    return row


@router.get("", response_model=SettingsStatus)
async def get_settings_status(db: AsyncSession = Depends(get_db)) -> SettingsStatus:
    row = await _get_row(db)
    if row is None or not row.github_token_encrypted:
        return SettingsStatus(configured=False)
    token = try_decrypt_token(row.github_token_encrypted)
    if token is None:
        # SECRET_KEY changed since the PAT was saved — the stored token is
        # unrecoverable, so present as unconfigured and let the user re-enter it.
        return SettingsStatus(configured=False)
    return SettingsStatus(configured=True, valid=None, login=row.github_login, masked_hint=_mask(token))


@router.put("", response_model=SettingsStatus)
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_db)) -> SettingsStatus:
    token = body.github_token.strip()
    if not token.startswith(_VALID_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail="Doesn't look like a GitHub PAT (expected it to start with ghp_ or github_pat_)",
        )

    row = await _get_or_create_row(db)
    row.github_token_encrypted = encrypt_token(token)
    row.github_login = None
    row.token_updated_at = dt.datetime.now(dt.timezone.utc)
    await db.commit()
    return SettingsStatus(configured=True, valid=None, login=None, masked_hint=_mask(token))


@router.post("/validate", response_model=SettingsStatus)
async def validate_settings(db: AsyncSession = Depends(get_db)) -> SettingsStatus:
    row = await _get_row(db)
    if row is None or not row.github_token_encrypted:
        raise HTTPException(status_code=400, detail="No GitHub token configured yet")

    token = try_decrypt_token(row.github_token_encrypted)
    if token is None:
        raise HTTPException(
            status_code=400,
            detail="Stored token can't be decrypted (SECRET_KEY changed) — re-enter your PAT.",
        )
    try:
        async with GitHubClient(token) as client:
            user = await client.get_authenticated_user()
    except Exception:
        return SettingsStatus(configured=True, valid=False, login=row.github_login, masked_hint=_mask(token))

    row.github_login = user.get("login")
    await db.commit()
    return SettingsStatus(configured=True, valid=True, login=row.github_login, masked_hint=_mask(token))
