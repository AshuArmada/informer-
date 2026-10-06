export interface SettingsStatus {
  configured: boolean
  valid: boolean | null
  login: string | null
  masked_hint: string | null
}

export interface ContributionRepo {
  matching_issues?: number
  created_at: string | null
  open_issues_and_prs: number
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

export interface DiscoveryOptions {
  q: string
  language: string
  beginner: boolean
  collection: 'active' | 'new'
  sort: 'updated' | 'stars'
  topic?: string
  license?: string
  min_stars?: number
  activity_days?: number
  issue_label?: string
  unassigned?: boolean
}

export interface DiscoveryResults {
  retry_after?: number
  issue_filtered: boolean
  scanned_count: number
  warnings: string[]
  repos: ContributionRepo[]
  // Last candidate page consumed; continue with page + 1 after automatic refill.
  page: number
  total_count: number
  has_more: boolean
  incomplete_results: boolean
  beginner: boolean
  collection: 'active' | 'new'
  sort: 'updated' | 'stars'
}

export interface WebSource {
  id: string
  name: string
  url: string
  signal: string
  fetched_at: string | null
  stale: boolean
}

export interface WebDiscoveryResults {
  repos: {
    full_name: string
    html_url: string
    description: string | null
    language: string | null
    stars: number | null
    sources: WebSource[]
  }[]
  sources: (WebSource & { cached: boolean; error: string | null; repo_count: number; sample_capped: boolean })[]
  cache_seconds: number
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
  issue_total: number | null
  labels: { name: string; count: number }[]
  warnings: string[]
}

export type AIProvider = 'openai' | 'ollama' | 'gemini'
export interface ProviderSettings {
  ai_provider: AIProvider
  openai_model: string
  gemini_model: string
  ollama_model: string
  ollama_base_url: string
  ai_timeout_seconds: number
  providers: ContributionConfig['providers']
}
export interface ContributionConfig {
  ai_configured: boolean
  default_provider: AIProvider
  providers: { id: AIProvider; label: string; configured: boolean; model: string }[]
}

export interface ContributionAdvice {
  provider: AIProvider
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

export class ApiError extends Error {
  status: number
  retryAfter: number

  constructor(message: string, status: number, retryAfter = 0) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(path.endsWith('/advice') ? 660_000 : 90_000)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...init?.headers, 'Content-Type': 'application/json', 'X-Informer-Request': '1' },
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    })
  } catch (error) {
    if (init?.signal?.aborted) throw error
    throw new Error(timeout.aborted ? 'The request timed out. Please retry.' : 'Cannot reach the backend. Check that it is running, then retry.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg || 'Invalid input').join('; ')
      : `Request failed (${res.status}). Please retry.`
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(message, res.status, Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0)
  }
  return res.json() as Promise<T>
}

export const api = {
  getProviderSettings: () => request<ProviderSettings>('/settings/providers'),
  updateProviderSettings: (settings: Omit<ProviderSettings, 'providers'> & { openai_api_key?: string; gemini_api_key?: string }) =>
    request<ProviderSettings>('/settings/providers', { method: 'PUT', body: JSON.stringify(settings) }),
  resetProviderSettings: () => request<ProviderSettings>('/settings/providers', { method: 'DELETE' }),
  testProvider: (provider: AIProvider) => request<{ message: string }>(`/settings/providers/${provider}/test`, { method: 'POST' }),
  removeToken: () => request<SettingsStatus>('/settings', { method: 'DELETE' }),
  getWebDiscoveries: (signal?: AbortSignal) => request<WebDiscoveryResults>('/contributions/web', { signal }),
  getContributionConfig: (signal?: AbortSignal) => request<ContributionConfig>('/contributions/config', { signal }),
  searchContributions: (options: DiscoveryOptions, page = 1, signal?: AbortSignal) =>
    request<DiscoveryResults>(
      `/contributions/search?${new URLSearchParams(Object.entries({ ...options, page }).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`, { signal }),
  analyzeContribution: (fullName: string, signal?: AbortSignal) =>
    request<ContributionAnalysis>(`/contributions/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`, { signal }),
  getContributionAdvice: (fullName: string, skills: string, experience: string, provider: AIProvider, signal?: AbortSignal) =>
    request<ContributionAdvice>(`/contributions/repos/${fullName.split('/').map(encodeURIComponent).join('/')}/advice`, {
      method: 'POST', body: JSON.stringify({ skills, experience, provider }), signal,
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
