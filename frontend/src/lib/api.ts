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
}
