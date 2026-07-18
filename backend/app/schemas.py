from pydantic import BaseModel


class SettingsStatus(BaseModel):
    configured: bool
    valid: bool | None = None
    login: str | None = None
    masked_hint: str | None = None


class SettingsUpdate(BaseModel):
    github_token: str


class TrendingRepo(BaseModel):
    repo_full_name: str
    stars: int
    star_delta: int | None
    description: str | None
    language: str | None
    html_url: str


class TrendingResponse(BaseModel):
    updated_at: str | None
    error: str | None
    repos: list[TrendingRepo]
