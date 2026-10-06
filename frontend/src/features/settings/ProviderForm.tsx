import { useEffect, useState, type FormEvent } from 'react'
import { Check, FlaskConical, LoaderCircle, LockKeyhole, Server, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type AIProvider, type ProviderSettings } from '@/lib/api'

type Draft = Omit<ProviderSettings, 'providers'>
const selectClass = 'mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-brand'
const labels: Record<AIProvider, string> = { openai: 'OpenAI', gemini: 'Google Gemini', ollama: 'Local Ollama' }

export function ProviderForm() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [keys, setKeys] = useState({ openai: '', gemini: '' })
  const [remove, setRemove] = useState({ openai: false, gemini: false })
  const [busy, setBusy] = useState<string | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  function apply(value: ProviderSettings) {
    setSettings(value)
    const { providers: _providers, ...fields } = value
    setDraft(fields); setKeys({ openai: '', gemini: '' }); setRemove({ openai: false, gemini: false })
  }
  async function load() {
    setBusy('load'); setError(null)
    try { apply(await api.getProviderSettings()) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  useEffect(() => { void load() }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy('save'); setError(null); setMessage(null)
    try {
      apply(await api.updateProviderSettings({ ...draft,
        ...(remove.openai ? { openai_api_key: '' } : keys.openai ? { openai_api_key: keys.openai.trim() } : {}),
        ...(remove.gemini ? { gemini_api_key: '' } : keys.gemini ? { gemini_api_key: keys.gemini.trim() } : {}),
      }))
      setMessage('Settings saved. New requests use these settings immediately.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  async function test(provider: AIProvider) {
    setBusy(provider); setError(null); setMessage(null)
    try { setMessage(`${labels[provider]}: ${(await api.testProvider(provider)).message}`) }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  async function reset() {
    setBusy('reset'); setError(null); setMessage(null)
    try { apply(await api.resetProviderSettings()); setConfirmReset(false); setMessage('Installation defaults restored. Any keys in backend/.env are active again.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  const dirty = !!draft && !!settings && (Object.entries(draft).some(([key, value]) => value !== settings[key as keyof ProviderSettings]) || !!keys.openai || !!keys.gemini || remove.openai || remove.gemini)

  return <section className="space-y-5" aria-labelledby="providers-heading">
    <div><h2 id="providers-heading" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-brand" /> AI connections</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Choose where your contribution advisor runs. Configure each provider here and switch between them whenever you need.</p></div>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}{!draft && <Button className="ml-3" variant="outline" disabled={!!busy} onClick={load}>Retry</Button>}</div>}
    {message && <p role="status" className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-muted p-4 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-brand" />{message}</p>}
    {busy === 'load' && <p role="status" className="text-sm text-muted-foreground">Loading provider settings…</p>}
    {draft && <form onSubmit={save} className="space-y-5">
      <fieldset disabled={!!busy} className="space-y-5 disabled:opacity-70">
        <legend className="sr-only">AI provider configuration</legend>
        <div className="grid gap-4 rounded-xl border bg-muted/30 p-5 sm:grid-cols-2"><label className="text-xs font-medium">Default advisor<select className={selectClass} value={draft.ai_provider} onChange={e => setDraft({ ...draft, ai_provider: e.target.value as AIProvider })}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="text-xs font-medium">Request timeout (seconds)<Input className="mt-1.5 h-10 bg-background" required type="number" min={10} max={600} step={1} value={draft.ai_timeout_seconds} onChange={e => setDraft({ ...draft, ai_timeout_seconds: Number(e.target.value) })} /></label></div>
        <div className="grid items-stretch gap-4 lg:grid-cols-3">{(['openai', 'gemini', 'ollama'] as AIProvider[]).map(provider => {
          const status = settings?.providers.find(p => p.id === provider)
          const modelKey = `${provider}_model` as const
          return <div key={provider} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{labels[provider]}</h3><span className={`rounded-full px-2 py-1 text-[11px] ${status?.configured ? 'bg-brand-muted text-brand' : 'bg-muted text-muted-foreground'}`}>{status?.configured ? 'Configured' : 'Needs setup'}</span></div>
            <p className="text-xs leading-5 text-muted-foreground">{provider === 'ollama' ? 'Runs on this computer. Start Ollama and install your chosen model.' : 'Receives your skills and public repository evidence when you request advice.'}</p>
            <label className="text-xs font-medium">Model<Input className="mt-1.5 h-10" required maxLength={100} pattern={String.raw`[a-zA-Z0-9_.:\/\-]+`} value={draft[modelKey]} onChange={e => setDraft({ ...draft, [modelKey]: e.target.value })} /></label>
            {provider === 'ollama' ? <label className="text-xs font-medium">Local server<Input className="mt-1.5 h-10" required type="url" value={draft.ollama_base_url} maxLength={200} onChange={e => setDraft({ ...draft, ollama_base_url: e.target.value })} /><span className="mt-2 block font-normal leading-5 text-muted-foreground">Loopback IP and port 11434 only.</span></label> : <>
              <label className="text-xs font-medium">{status?.configured ? 'Replace API key' : 'API key'}<Input className="mt-1.5 h-10" type="password" autoComplete="new-password" spellCheck={false} maxLength={512} disabled={remove[provider]} value={keys[provider]} onChange={e => setKeys({ ...keys, [provider]: e.target.value })} placeholder={status?.configured ? 'Leave blank to keep saved key' : 'Paste your API key'} /></label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={remove[provider]} onChange={e => setRemove({ ...remove, [provider]: e.target.checked })} /> Remove key and disable provider</label>
            </>}
            <Button type="button" className="mt-auto" variant="outline" disabled={!status?.configured || dirty} onClick={() => test(provider)}>{busy === provider ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Test saved connection</Button>
          </div>
        })}</div>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!dirty} className="bg-brand text-brand-foreground hover:bg-brand/90">{busy === 'save' ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />} Save connections</Button><span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes. Save before testing connections.' : 'Keys are encrypted on the backend and never returned to this page.'}</span></div>
      </fieldset>
    </form>}
    <div className="rounded-xl border p-4"><Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirmReset(!confirmReset)}><Server /> Restore installation defaults</Button>{confirmReset && <div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">This deletes all provider settings saved here. Keys and models configured in backend/.env will become active again.</p><Button variant="destructive" disabled={!!busy} onClick={reset}>Delete overrides and restore defaults</Button></div>}</div>
  </section>
}
