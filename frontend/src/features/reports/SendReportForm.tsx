import { useEffect, useState } from 'react'
import { Send, Loader2, TriangleAlert, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { api } from '@/lib/api'

export function SendReportForm() {
  const [email, setEmail] = useState('')
  const [smtpConfigured, setSmtpConfigured] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getReportConfig().then((cfg) => {
      setSmtpConfigured(cfg.smtp_configured)
      if (cfg.default_email) setEmail(cfg.default_email)
    })
  }, [])

  const send = async () => {
    if (!email.trim()) return
    setSending(true)
    setResult(null)
    setError(null)
    try {
      const res = await api.sendReport(email.trim())
      setResult(`Sent to ${res.email} (${res.repo_count} repo${res.repo_count === 1 ? '' : 's'}).`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!smtpConfigured && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>SMTP not configured</AlertTitle>
          <AlertDescription>
            Set <code>SMTP_*</code> values in <code>backend/.env</code> to enable sending.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="report-email">Send to</Label>
        <div className="flex gap-2">
          <Input
            id="report-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={send} disabled={sending || !smtpConfigured || !email.trim()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send now
          </Button>
        </div>
      </div>

      {result && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCheck className="size-4" /> {result}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
