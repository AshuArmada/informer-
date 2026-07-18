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


# --- Saved repos ---


class SavedRepo(BaseModel):
    repo_full_name: str
    description: str | None
    language: str | None
    html_url: str
    stars: int


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
    owner: str
    name: str


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
