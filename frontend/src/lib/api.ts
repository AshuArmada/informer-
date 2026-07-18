export interface SettingsStatus {
  configured: boolean
  valid: boolean | null
  login: string | null
  masked_hint: string | null
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
