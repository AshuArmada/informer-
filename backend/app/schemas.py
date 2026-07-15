from pydantic import BaseModel


class SettingsStatus(BaseModel):
    configured: bool
    valid: bool | None = None
    login: str | None = None
    masked_hint: str | None = None


class SettingsUpdate(BaseModel):
    github_token: str
