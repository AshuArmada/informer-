"""Encrypted UI overrides; environment settings remain installation defaults."""
import json
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import Provider, provider_config
from app.config import get_settings
from app.db import get_db
from app.models import ProviderSettings
from app.security import try_decrypt_token


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ai_provider: Provider
    openai_model: str = Field(min_length=1, max_length=100, pattern=r"^[\w.:/-]+$")
    gemini_model: str = Field(min_length=1, max_length=100, pattern=r"^[\w.:/-]+$")
    ollama_model: str = Field(min_length=1, max_length=100, pattern=r"^[\w.:/-]+$")
    ollama_base_url: str = Field(max_length=200)
    ai_timeout_seconds: int = Field(ge=10, le=600)
    # Omitted = preserve, empty = disable (including environment fallback).
    openai_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None

    @field_validator("openai_api_key", "gemini_api_key")
    @classmethod
    def key_length(cls, value):
        if value is not None:
            raw = value.get_secret_value()
            if len(raw) > 512 or any(c.isspace() for c in raw):
                raise ValueError("API keys must be at most 512 characters with no whitespace.")
        return value

    @field_validator("ollama_base_url")
    @classmethod
    def local_ollama(cls, value):
        parsed = urlsplit(value)
        # Exact IP literals avoid DNS rebinding; the fixed port prevents using
        # this control to probe unrelated local services.
        if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "::1")
                or parsed.port != 11434 or parsed.username or parsed.password
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ValueError("Use http://127.0.0.1:11434 or http://[::1]:11434 for local Ollama.")
        return value.rstrip("/")


def decode_overrides(row: ProviderSettings | None) -> dict:
    if row is None:
        return {}
    decrypted = try_decrypt_token(row.encrypted_payload)
    if decrypted is None:
        raise HTTPException(409, "Provider settings cannot be decrypted. Reset them in Settings and re-enter your keys.")
    return json.loads(decrypted)


async def effective_settings(db: AsyncSession = Depends(get_db)):
    overrides = decode_overrides(await db.get(ProviderSettings, 1))
    return get_settings().model_copy(update=overrides)


def public_settings(settings) -> dict:
    return {
        "ai_provider": settings.ai_provider,
        "openai_model": settings.openai_model,
        "gemini_model": settings.gemini_model,
        "ollama_model": settings.ollama_model,
        "ollama_base_url": settings.ollama_base_url,
        "ai_timeout_seconds": settings.ai_timeout_seconds,
        "providers": [provider_config(settings, p) for p in ("openai", "gemini", "ollama")],
    }
