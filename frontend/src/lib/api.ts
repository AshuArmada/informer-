export interface SettingsStatus {
  configured: boolean
  valid: boolean | null
  login: string | null
  masked_hint: string | null
}

export interface ContributionRepo {
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stars: number
  topics: string[]
  pushed_at: string | null
  archived: boolean
  disabled: boolean
  license: string | null
}

export interface ContributionIssue {
  number: number
  title: string
  html_url: string
  labels: string[]
  assignees: string[]
  updated_at: string
  comments: number
  body_excerpt: string
}

export interface ContributionAnalysis {
  repo: ContributionRepo
  fetched_at: string
  state: string
  days_since_push: number | null
  community_health: number | null
  documents: { name: string; url: string }[]
  contributing_excerpt: string | null
  contributing_detected: boolean | null
  acceptance: {
    window_days: number
    sample_size: number
    closed_in_window: number
    merged_in_window: number
    merge_rate: number | null
    median_merge_days: number | null
    weeks_with_merges: number
    latest_sampled_merge: string | null
    sample_capped: boolean
  } | null
  issues: ContributionIssue[]
  issues_available: boolean
  issues_capped: boolean
  labels: { name: string; count: number }[]
  warnings: string[]
}

export interface ContributionAdvice {
  text: string
  model: string
  fetched_at: string
}

export interface TrendingRepo {
  repo_full_name: string
  stars: number
  star_delta: number | null
  description: string | null
  language: string | null
  html_url: string
}

export interface TrendingResponse {
  updated_at: string | null
  error: string | null
  repos: TrendingRepo[]
}

export interface SavedRepo {
  repo_full_name: string
  description: string | null
  language: string | null
  html_url: string
  stars: number
}

export interface GitHubRepo {
  full_name: string
  owner: string
  name: string
  private: boolean
  description: string | null
  html_url: string
  stars: number
  is_tracked: boolean
}

export interface IssueItem {
  number: number
  title: string
  html_url: string
}

export interface AssigneeGroup {
  assignee: string | null
  avatar_url: string | null
  count: number
  issues: IssueItem[]
}

export interface PRCounts {
  open: number
  merged: number
  closed: number
}

export interface RepoReport {
  full_name: string
  html_url: string
  open_issue_count: number
  groups: AssigneeGroup[]
  pr_counts: PRCounts
  error: string | null
}

export interface ReportResponse {
  generated_at: string
  repos: RepoReport[]
}

export interface ReportConfig {
  default_email: string | null
  smtp_configured: boolean
}

export interface ReportSchedule {
  enabled: boolean
  cadence: 'daily' | 'weekly'
  time: string
  day_of_week: number | null
  email: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.detail ?? `Request failed (${res.status})`
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export const api = {
  getContributionConfig: () => request<{ ai_configured: boolean }>('/contributions/config'),
  searchContributions: (q: string, language: string, beginner: boolean, signal?: AbortSignal) =>
    request<{ repos: ContributionRepo[]; query: string }>(
      `/contributions/search?${new URLSearchParams({ q, language, beginner: String(beginner) })}`, { signal }),
  analyzeContribution: (fullName: string, signal?: AbortSignal) =>
    request<ContributionAnalysis>(`/contributions/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`, { signal }),
  getContributionAdvice: (fullName: string, skills: string, experience: string, signal?: AbortSignal) =>
    request<ContributionAdvice>(`/contributions/repos/${fullName.split('/').map(encodeURIComponent).join('/')}/advice`, {
      method: 'POST', body: JSON.stringify({ skills, experience }), signal,
    }),
  getSettings: () => request<SettingsStatus>('/settings'),
  updateSettings: (github_token: string) =>
    request<SettingsStatus>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ github_token }),
    }),
  validateSettings: () =>
    request<SettingsStatus>('/settings/validate', { method: 'POST' }),
  getTrending: () => request<TrendingResponse>('/trending'),

  // Saved repos
  getSaved: () => request<SavedRepo[]>('/saved'),
  saveRepo: (repo: SavedRepo) =>
    request<SavedRepo[]>('/saved', { method: 'POST', body: JSON.stringify(repo) }),
  unsaveRepo: (repo_full_name: string) =>
    request<{ removed: string }>(
      `/saved?repo_full_name=${encodeURIComponent(repo_full_name)}`,
      { method: 'DELETE' },
    ),

  // Reports
  getRepos: () => request<GitHubRepo[]>('/repos'),
  getTrackedRepos: () => request<GitHubRepo[]>('/repos/tracked'),
  trackRepo: (owner: string, name: string) =>
    request<GitHubRepo[]>('/repos/tracked', {
      method: 'POST',
      body: JSON.stringify({ owner, name }),
    }),
  untrackRepo: (owner: string, name: string) =>
    request<{ removed: string }>(
      `/repos/tracked?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  getReport: () => request<ReportResponse>('/report'),
  getReportConfig: () => request<ReportConfig>('/report/config'),
  sendReport: (email: string) =>
    request<{ status: string; email: string; repo_count: number }>('/report/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  getSchedule: () => request<ReportSchedule>('/report/schedule'),
  updateSchedule: (schedule: ReportSchedule) =>
    request<ReportSchedule>('/report/schedule', {
      method: 'PUT',
      body: JSON.stringify(schedule),
    }),
}
