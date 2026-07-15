export interface SettingsStatus {
  configured: boolean
  valid: boolean | null
  login: string | null
  masked_hint: string | null
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
}
