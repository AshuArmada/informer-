import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { api, type SettingsStatus } from '@/lib/api'

export function PatForm() {
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = () => {
    setLoadError(null)
    api
      .getSettings()
      .then(setStatus)
      .catch((err: Error) => setLoadError(err.message))
  }

  useEffect(refresh, [])

  const handleSave = async () => {
    if (!tokenInput.trim()) return
    setSaving(true)
    setActionError(null)
    try {
      const updated = await api.updateSettings(tokenInput.trim())
      setStatus(updated)
      setTokenInput('')
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleValidate = async () => {
    setValidating(true)
    setActionError(null)
    try {
      const updated = await api.validateSettings()
      setStatus(updated)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setValidating(false)
    }
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <XCircle className="size-4" />
        <AlertTitle>Couldn't reach the backend</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status</span>
          {status === null && <span className="text-sm text-muted-foreground">Loading…</span>}
          {status && !status.configured && <Badge variant="secondary">Not configured</Badge>}
          {status && status.configured && status.valid === true && (
            <Badge className="gap-1 bg-emerald-600 text-white dark:bg-emerald-500">
              <CheckCircle2 className="size-3" /> Valid{status.login ? ` — ${status.login}` : ''}
            </Badge>
          )}
          {status && status.configured && status.valid === false && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="size-3" /> Invalid or expired
            </Badge>
          )}
          {status && status.configured && status.valid === null && (
            <Badge variant="outline">Configured, not yet validated</Badge>
          )}
        </div>
        {status?.configured && status.masked_hint && (
          <p className="text-sm text-muted-foreground">
            Current token: <code className="rounded bg-muted px-1.5 py-0.5">{status.masked_hint}</code>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pat-input">
          {status?.configured ? 'Replace token' : 'GitHub Personal Access Token'}
        </Label>
        <div className="flex gap-2">
          <Input
            id="pat-input"
            type="password"
            placeholder="ghp_… or github_pat_…"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            autoComplete="off"
          />
          <Button onClick={handleSave} disabled={saving || !tokenInput.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Accepts classic (<code>ghp_…</code>) and fine-grained (<code>github_pat_…</code>) tokens.
          Needs read access to repos, issues, and pull requests — classic tokens need the{' '}
          <code>repo</code> scope; fine-grained tokens need Metadata, Issues, Pull requests, and
          Contents read permissions. Stored encrypted; never shown again in full.
        </p>
      </div>

      {status?.configured && (
        <div>
          <Button variant="outline" onClick={handleValidate} disabled={validating}>
            {validating && <Loader2 className="size-4 animate-spin" />}
            Validate token
          </Button>
        </div>
      )}

      {actionError && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
