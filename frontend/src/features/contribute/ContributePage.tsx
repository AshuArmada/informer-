import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, CircleDot, Compass, GitPullRequest, LoaderCircle, Search, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type ContributionAdvice, type ContributionAnalysis, type ContributionRepo } from '@/lib/api'
import { cn } from '@/lib/utils'

const fieldClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand'
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Unknown'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please retry.'

function Tag({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return <span className={cn('inline-flex rounded-md px-2 py-1 text-xs', active ? 'bg-brand-muted text-brand' : 'bg-muted text-muted-foreground')}>{children}</span>
}

export function ContributePage() {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('')
  const [beginner, setBeginner] = useState(true)
  const [repos, setRepos] = useState<ContributionRepo[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ContributionAnalysis | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function inspect(fullName: string) {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(false)
    setLoadingRepo(fullName)
    setError(null)
    setAnalysis(null)
    try {
      const result = await api.analyzeContribution(fullName, request.signal)
      if (!request.signal.aborted) setAnalysis(result)
    } catch (e) {
      if (!request.signal.aborted) setError(errorMessage(e))
    } finally {
      if (!request.signal.aborted) setLoadingRepo(null)
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    const term = query.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '')
    if (/^[\w-]+\/[\w.-]+$/.test(term)) {
      await inspect(term)
      return
    }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setLoadingRepo(null)
    setError(null)
    setAnalysis(null)
    try {
      const result = await api.searchContributions(query, language, beginner, request.signal)
      if (!request.signal.aborted) { setRepos(result.repos); setSearched(true) }
    } catch (e) {
      if (!request.signal.aborted) setError(errorMessage(e))
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  return <div className="space-y-8 px-4 py-8 sm:px-6 sm:py-12">
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-brand-muted via-background to-background p-6 sm:p-9">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand"><Compass className="size-4" /> Find your next contribution</div>
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Good projects.<br />A clear place to start.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Discover open source projects, understand how they work, and find an issue you can help with. Get AI guidance grounded in repository activity.</p>
      <form onSubmit={search} className="mt-7 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Topic or repository" className="h-10 bg-background pl-9" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} placeholder="Search a topic, or paste owner/repository" /></div>
          <select aria-label="Programming language" className={cn(fieldClass, 'sm:w-44')} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="">All languages</option>{['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C++', 'C#', 'Ruby', 'Swift', 'Kotlin', 'PHP'].map(l => <option key={l}>{l}</option>)}
          </select>
          <Button type="submit" disabled={loading || !!loadingRepo} className="h-10 bg-brand px-5 text-brand-foreground hover:bg-brand/90">{loading ? <LoaderCircle className="animate-spin" /> : <Search />} Find projects</Button>
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={beginner} onChange={e => setBeginner(e.target.checked)} /> Projects with good first issues</label>
      </form>
    </section>

    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error} <a href="#settings" className="font-medium text-brand underline">Open Settings</a></div>}
    {(loading || loadingRepo) && <div role="status" className="flex items-center gap-3 rounded-xl border p-8 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-brand" />{loadingRepo ? `Reading activity, guidelines, and issues for ${loadingRepo}…` : 'Finding recently active public projects…'}</div>}

    {analysis && !loadingRepo ? <RepositoryDetail key={analysis.repo.full_name} analysis={analysis} onBack={() => setAnalysis(null)} /> : !loading && !loadingRepo && <>
      {searched ? <section className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Explore opportunities <span className="ml-2 text-sm font-normal text-muted-foreground">{repos.length} projects</span></h2><span className="text-xs text-muted-foreground">Pushed in the last 90 days</span></div>
        {repos.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No projects match these filters. Try a broader topic or turn off the good first issue filter.</div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repos.map(repo => <article key={repo.full_name} className="flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-brand/40">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground"><span>{repo.language || 'Multiple languages'}</span><span className="flex items-center gap-1"><Star className="size-3.5" />{repo.stars.toLocaleString()}</span></div>
            <h3 className="break-words font-semibold">{repo.full_name}</h3>
            <p className="mt-2 line-clamp-3 min-h-15 text-sm leading-5 text-muted-foreground">{repo.description || 'Explore this repository’s activity and contribution opportunities.'}</p>
            <div className="mb-5 mt-4 flex flex-wrap gap-1.5">{repo.topics.slice(0, 3).map(topic => <Tag key={topic}>{topic}</Tag>)}</div>
            <Button variant="outline" className="mt-auto h-10 justify-between" onClick={() => inspect(repo.full_name)}>Explore contribution fit <ArrowUpRight /></Button>
          </article>)}
        </div>}
      </section> : <section className="grid gap-5 sm:grid-cols-3">
        {[{ icon: Compass, title: 'Find your fit', text: 'Search by topic and language, with an optional good first issue filter.' }, { icon: GitPullRequest, title: 'Understand the project', text: 'See recent activity, sampled merge rates, and time to merge before you start.' }, { icon: BookOpen, title: 'Contribute with context', text: 'Read the rules, explore issue labels, and get a personalized starting plan.' }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-xl border p-6"><Icon className="mb-4 size-5 text-brand" /><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}
      </section>}
    </>}
  </div>
}

function RepositoryDetail({ analysis: a, onBack }: { analysis: ContributionAnalysis; onBack: () => void }) {
  const [label, setLabel] = useState('')
  const [issueQuery, setIssueQuery] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const issues = a.issues.filter(i => (!label || i.labels.includes(label)) && (!unassigned || i.assignees.length === 0) && `${i.title} ${i.number}`.toLowerCase().includes(issueQuery.toLowerCase()))
  const metrics = a.acceptance

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      await api.saveRepo({ repo_full_name: a.repo.full_name, description: a.repo.description, language: a.repo.language, html_url: a.repo.html_url, stars: a.repo.stars })
      setSaved(true)
    } catch (e) { setSaveError(errorMessage(e)) } finally { setSaving(false) }
  }

  return <section className="space-y-6">
    <Button variant="ghost" onClick={onBack}><ArrowLeft /> Back to discovery</Button>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2"><Tag active>{a.state}</Tag>{a.repo.language && <Tag>{a.repo.language}</Tag>}<Tag>{a.repo.license || 'License not detected'}</Tag></div><h2 className="break-words text-2xl font-semibold tracking-tight">{a.repo.full_name}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{a.repo.description}</p><p className="mt-2 text-xs text-muted-foreground">Checked {new Date(a.fetched_at).toLocaleString()} · Last push {date(a.repo.pushed_at)}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={saved || saving} onClick={save}>{saved ? 'Saved' : saving ? 'Saving…' : 'Save project'}</Button><Button variant="outline" asChild><a href={a.repo.html_url} target="_blank" rel="noreferrer">GitHub <ArrowUpRight /></a></Button></div>
    </div>
    {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
    {a.warnings.length > 0 && <div role="status" className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{a.warnings.map(w => <p key={w}>{w}</p>)}</div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[{ title: 'Sampled merge rate', value: metrics?.merge_rate != null ? `${metrics.merge_rate}%` : 'Unavailable', note: metrics ? `${metrics.merged_in_window} merged / ${metrics.closed_in_window} closed in 90 days` : 'No PR data available' },
        { title: 'Median time to merge', value: metrics?.median_merge_days != null ? `${metrics.median_merge_days} days` : 'Unavailable', note: 'From PR creation to merge, in sample' },
        { title: 'Weeks with merges', value: metrics ? String(metrics.weeks_with_merges) : 'Unavailable', note: 'Calendar weeks in the 90-day sample' },
        { title: 'Community documents', value: a.community_health != null ? `${a.community_health}%` : 'Unavailable', note: 'GitHub documentation coverage' }].map(m => <div key={m.title} className="rounded-xl border p-5"><p className="text-xs text-muted-foreground">{m.title}</p><p className="my-2 text-2xl font-semibold tracking-tight">{m.value}</p><p className="text-xs leading-5 text-muted-foreground">{m.note}</p></div>)}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{metrics ? `Based on ${metrics.sample_size} most recently updated closed pull requests; only closures in the last 90 days count. ${metrics.sample_capped ? 'The 100-PR cap was reached, so this is a partial view. ' : ''}Includes maintainers and bots. This is historical activity, not your probability of acceptance. Latest sampled merge: ${date(metrics.latest_sampled_merge)}.` : 'Acceptance activity could not be retrieved.'}</p>

    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-xl border p-5">
        <h3 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-brand" /> Before you contribute</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{a.contributing_detected === true ? 'A contribution guide was detected. Read it for setup, tests, and the project’s review process.' : a.contributing_detected === false ? 'GitHub did not detect a contribution guide. Check the README and project discussions for requirements before starting.' : 'Contribution rules could not be checked. Review the repository directly.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">{a.documents.map(d => <Button key={d.name} variant="outline" size="sm" asChild><a href={d.url} target="_blank" rel="noreferrer">{d.name} <ArrowUpRight className="size-3" /></a></Button>)}</div>
        {a.contributing_excerpt && <details className="mt-4 rounded-lg bg-muted/50 p-3"><summary className="cursor-pointer text-sm font-medium">Read contribution guide excerpt</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-muted-foreground">{a.contributing_excerpt}</pre><p className="mt-2 text-xs text-muted-foreground">Up to 16,000 characters. Open the source for the full guide.</p></details>}
      </section>
      <Advisor fullName={a.repo.full_name} />
    </div>

    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><CircleDot className="size-4 text-brand" /> Current issues <span className="text-sm font-normal text-muted-foreground">{issues.length} shown</span></h3><a className="text-xs font-medium text-brand underline" href={`${a.repo.html_url}/issues`} target="_blank" rel="noreferrer">All issues on GitHub</a></div>
      <p className="text-xs leading-5 text-muted-foreground">Issues from the latest {a.issues_capped ? '100' : 'available'} updated open issues/PRs, with PRs removed. Labels and counts describe this sample. {a.issues_capped && 'More issues are available on GitHub.'}</p>
      <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Filter issue titles or numbers" className="h-10 sm:flex-1" value={issueQuery} onChange={e => setIssueQuery(e.target.value)} placeholder="Filter issues by title or number…" /><select aria-label="Issue label" className={cn(fieldClass, 'sm:w-64')} value={label} onChange={e => setLabel(e.target.value)}><option value="">All issue labels</option>{a.labels.map(l => <option key={l.name} value={l.name}>{l.name} ({l.count})</option>)}</select></div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={unassigned} onChange={e => setUnassigned(e.target.checked)} /> Unassigned issues only</label>
      <div className="flex flex-wrap gap-2">{a.labels.slice(0, 12).map(l => <button key={l.name} aria-pressed={label === l.name} onClick={() => setLabel(label === l.name ? '' : l.name)} className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"><Tag active={label === l.name}>{l.name} · {l.count}</Tag></button>)}</div>
      {!a.issues_available ? <p className="py-6 text-center text-sm text-muted-foreground">Issues could not be loaded. Use the GitHub link to inspect current issues.</p> : issues.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No issues in this sample match your filters. Try another label or view all issues on GitHub.</p> : <div className="divide-y">{issues.map(i => <article key={i.number} className="py-4"><a className="text-sm font-medium hover:text-brand hover:underline" href={i.html_url} target="_blank" rel="noreferrer"><span className="mr-2 text-muted-foreground">#{i.number}</span>{i.title}<ArrowUpRight className="ml-1 inline size-3.5" /></a><div className="mb-2 mt-3 flex flex-wrap gap-1.5">{i.labels.length ? i.labels.map(l => <Tag key={l} active={['good first issue', 'help wanted'].includes(l.toLowerCase())}>{l}</Tag>) : <Tag>No labels</Tag>}</div><p className="text-xs text-muted-foreground">{i.assignees.length ? `Assigned to ${i.assignees.join(', ')}` : 'Unassigned'} · {i.comments} comments · Updated {date(i.updated_at)}</p></article>)}</div>}
    </section>
  </section>
}

function Advisor({ fullName }: { fullName: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [skills, setSkills] = useState('')
  const [experience, setExperience] = useState('beginner')
  const [advice, setAdvice] = useState<ContributionAdvice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    api.getContributionConfig().then(c => { if (active) setConfigured(c.ai_configured) }).catch(() => { if (active) setError('Could not check AI availability. You can still try generating guidance.') })
    return () => { active = false; controller.current?.abort() }
  }, [])

  async function generate(event: FormEvent) {
    event.preventDefault()
    const request = new AbortController()
    controller.current = request
    setLoading(true); setError(null); setAdvice(null)
    try {
      const result = await api.getContributionAdvice(fullName, skills, experience, request.signal)
      if (!request.signal.aborted) setAdvice(result)
    } catch (e) { if (!request.signal.aborted) setError(errorMessage(e)) }
    finally { if (!request.signal.aborted) setLoading(false) }
  }

  return <section className="rounded-xl border border-brand/25 bg-brand-muted/30 p-5">
    <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-brand" /> Your contribution advisor</h3>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Get a starting plan based on your skills, repository rules, and current issues.</p>
    {configured === false ? <p className="mt-4 rounded-lg border bg-background p-3 text-sm leading-6">AI guidance needs setup: add <code>OPENAI_API_KEY</code> to <code>backend/.env</code> and restart the backend. Repository insights and issue filters are ready to use.</p> : <form onSubmit={generate} className="mt-4 space-y-3">
      <label className="block text-xs font-medium">Your skills and interests<Input className="mt-1.5 h-10 bg-background" value={skills} maxLength={1000} onChange={e => { setSkills(e.target.value); setAdvice(null) }} placeholder="e.g. Python, testing, accessibility" disabled={loading} /></label>
      <label className="block text-xs font-medium">Contribution experience<select className={cn(fieldClass, 'mt-1.5')} value={experience} onChange={e => { setExperience(e.target.value); setAdvice(null) }} disabled={loading}><option value="beginner">New to open source</option><option value="intermediate">Some contribution experience</option><option value="experienced">Experienced contributor</option></select></label>
      <p className="text-xs leading-5 text-muted-foreground">Generating a plan sends these preferences and public repository evidence to OpenAI.</p>
      <Button type="submit" disabled={loading} className="h-10 bg-brand text-brand-foreground hover:bg-brand/90">{loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{loading ? 'Reading the evidence…' : 'Suggest where to start'}</Button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {advice && <div className="mt-5 space-y-3 border-t border-brand/20 pt-4" aria-live="polite">{advice.text.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="whitespace-pre-wrap text-sm leading-6">{p}</p>)}<p className="text-xs text-muted-foreground">AI-generated · {advice.model} · Evidence checked {new Date(advice.fetched_at).toLocaleString()}. Verify requirements in the linked project documents.</p></div>}
  </section>
}
