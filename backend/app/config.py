from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://informer:informer@localhost:5432/informer"
    secret_key: str
    poll_interval_minutes: int = 10
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    ai_provider: Literal["openai", "ollama", "gemini"] = "openai"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    ai_timeout_seconds: int = Field(default=180, ge=10, le=600)

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    default_report_email: str | None = None

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173",
                              "http://localhost:4173", "http://127.0.0.1:4173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
