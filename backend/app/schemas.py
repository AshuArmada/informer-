from typing import Literal
import re

from pydantic import BaseModel, Field, field_validator, model_validator


class SettingsStatus(BaseModel):
    configured: bool
    valid: bool | None = None
    login: str | None = None
    masked_hint: str | None = None


class SettingsUpdate(BaseModel):
    github_token: str = Field(min_length=8, max_length=512, pattern=r"^\S+$")


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


# --- Saved repos ---


class SavedRepo(BaseModel):
    repo_full_name: str = Field(max_length=140, pattern=r"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$")
    description: str | None
    language: str | None
    html_url: str
    stars: int = Field(ge=0)

    @model_validator(mode="after")
    def safe_repository_link(self):
        if self.repo_full_name.split("/")[1] in (".", ".."):
            raise ValueError("Invalid repository name.")
        self.html_url = "https://github.com/" + self.repo_full_name
        return self


# --- Reports ---


class GitHubRepo(BaseModel):
    full_name: str
    owner: str
    name: str
    private: bool
    description: str | None
    html_url: str
    stars: int
    is_tracked: bool


class TrackRepoRequest(BaseModel):
    owner: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9-]{0,38}$")
    name: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,100}$")

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if value in (".", ".."):
            raise ValueError("Invalid repository name.")
        return value


class IssueItem(BaseModel):
    number: int
    title: str
    html_url: str


class AssigneeGroup(BaseModel):
    assignee: str | None  # None = unassigned
    avatar_url: str | None
    count: int
    issues: list[IssueItem]


class PRCounts(BaseModel):
    open: int
    merged: int
    closed: int


class RepoReport(BaseModel):
    full_name: str
    html_url: str
    open_issue_count: int
    groups: list[AssigneeGroup]
    pr_counts: PRCounts
    error: str | None = None


class ReportResponse(BaseModel):
    generated_at: str
    repos: list[RepoReport]


class SendReportRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+", value):
            raise ValueError("Enter a valid recipient email address.")
        return value


class SendReportResponse(BaseModel):
    status: str  # "sent" | "failed"
    email: str
    repo_count: int
    detail: str | None = None


class ReportConfig(BaseModel):
    default_email: str | None
    smtp_configured: bool


class ReportSchedule(BaseModel):
    enabled: bool
    cadence: str  # "daily" | "weekly"
    time: str  # "HH:MM" 24h
    day_of_week: int | None  # 0=Mon..6=Sun (weekly only)
    email: str | None


class ReportScheduleUpdate(ReportSchedule):
    cadence: Literal["daily", "weekly"]
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    day_of_week: int | None = Field(default=None, ge=0, le=6)

    @model_validator(mode="after")
    def valid_schedule(self):
        self.email = self.email.strip() if self.email else None
        if self.email:
            self.email = SendReportRequest(email=self.email).email
        if self.enabled and not self.email:
            raise ValueError("An enabled schedule needs a recipient email address.")
        if self.enabled and self.cadence == "weekly" and self.day_of_week is None:
            raise ValueError("Select a day for the weekly schedule.")
        return self
