import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, CircleDot, Compass, GitPullRequest, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiError, type AIProvider, type DiscoveryOptions, type ContributionConfig, type ContributionAdvice, type ContributionAnalysis, type ContributionRepo } from '@/lib/api'
import { cn } from '@/lib/utils'
import { contributionLink, repositoryName } from './navigation'
import { RepositoryFilters } from './RepositoryFilters'
import { defaultFilters, type RepositoryFiltersValue } from './filters'
import { RepositoryGroups } from './RepositoryGroups'
import { WebDiscovery } from './WebDiscovery'
import { SaveProjectButton } from './SaveProjectButton'
import { SavedProjectsContext, useSavedProjects } from './useSavedProjects'

function initialSearch() {
  const fallback = { query: '', language: '', beginner: true, filters: { ...defaultFilters }, collection: 'active' as 'active' | 'new', sort: 'updated' as 'updated' | 'stars' }
  try {
    const data = JSON.parse(sessionStorage.getItem('contribution-search') || '{}')
    const filters = { ...defaultFilters }
    for (const key of ['topic', 'license', 'issue_label'] as const) if (typeof data.filters?.[key] === 'string') filters[key] = data.filters[key]
    if (Number.isInteger(data.filters?.min_stars) && data.filters.min_stars >= 0 && data.filters.min_stars <= 10000000) filters.min_stars = data.filters.min_stars
    if ([7, 30, 90, 365].includes(data.filters?.activity_days)) filters.activity_days = data.filters.activity_days
    filters.unassigned = data.filters?.unassigned === true
    return { ...fallback, query: typeof data.query === 'string' ? data.query : '', language: typeof data.language === 'string' ? data.language : '', beginner: data.beginner !== false, filters,
      collection: data.collection === 'new' ? 'new' as const : 'active' as const, sort: data.sort === 'stars' ? 'stars' as const : 'updated' as const }
  } catch { return fallback }
}

const fieldClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand'
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Unknown'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please retry.'

function Tag({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return <span className={cn('inline-flex rounded-md px-2 py-1 text-xs', active ? 'bg-brand-muted text-brand' : 'bg-muted text-muted-foreground')}>{children}</span>
}

export function ContributePage() {
  const projects = useSavedProjects()
  return <SavedProjectsContext.Provider value={projects}><ContributeContent /></SavedProjectsContext.Provider>
}

function ContributeContent() {
  const [discoveryMode, setDiscoveryMode] = useState<'github' | 'web'>('github')
  const discoveryModeRef = useRef<'github' | 'web'>('github')
  const [draft] = useState(initialSearch)
  const [query, setQuery] = useState(draft.query)
  const [language, setLanguage] = useState(draft.language)
  const [beginner, setBeginner] = useState(draft.beginner)
  const [filters, setFilters] = useState<RepositoryFiltersValue>(draft.filters)
  const [scanned, setScanned] = useState(0)
  const [searchWarnings, setSearchWarnings] = useState<string[]>([])
  const [collection, setCollection] = useState<'active' | 'new'>(draft.collection)
  const [sort, setSort] = useState<'updated' | 'stars'>(draft.sort)
  const [applied, setApplied] = useState<DiscoveryOptions | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [incomplete, setIncomplete] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasResults = useRef(false)
  const [repos, setRepos] = useState<ContributionRepo[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ContributionAnalysis | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [resultDescription, setResultDescription] = useState('')
  const retry = useRef<(() => void) | null>(null)
  const [retryAt, setRetryAt] = useState(0)
  const retryAtRef = useRef(0)
  const [now, setNow] = useState(Date.now)
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000))

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function startCooldown(seconds: number) {
    if (seconds <= 0) return
    const current = Date.now()
    setNow(current)
    retryAtRef.current = Math.max(retryAtRef.current, current + seconds * 1000)
    setRetryAt(retryAtRef.current)
  }

  useEffect(() => {
    const readRoute = () => {
      const name = new URLSearchParams(window.location.hash.split('?')[1] || '').get('repo')
      if (name) {
        try {
          const fullName = repositoryName(name)
          if (!fullName) throw new Error('Enter owner/repository.')
          void inspect(fullName)
        } catch (e) { setError(errorMessage(e)) }
      } else {
        controller.current?.abort()
        setLoading(false); setLoadingMore(false); setLoadingRepo(null); setAnalysis(null); setError(null)
        if (discoveryModeRef.current === 'github' && !hasResults.current && ['', 'contribute'].includes(window.location.hash.replace(/^#\/?/, '').split('?')[0])) {
          void discover({ q: draft.query.includes('/') ? '' : draft.query, language: draft.language, beginner: draft.beginner, collection: draft.collection, sort: draft.sort, ...draft.filters })
        }
      }
    }
    readRoute()
    window.addEventListener('hashchange', readRoute)
    return () => { window.removeEventListener('hashchange', readRoute); controller.current?.abort() }
  }, [draft])

  useEffect(() => {
    try { sessionStorage.setItem('contribution-search', JSON.stringify({ query, language, beginner, collection, sort, filters })) } catch { /* Storage may be disabled. */ }
  }, [query, language, beginner, collection, sort, filters])

  function openRepo(name: string) {
    if (window.location.hash === contributionLink(name)) void inspect(name)
    else window.location.hash = contributionLink(name)
  }

  function cancel() {
    controller.current?.abort()
    setLoading(false); setLoadingMore(false); setLoadingRepo(null)
  }

  async function inspect(fullName: string) {
    retry.current = () => { void inspect(fullName) }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(false)
    setLoadingMore(false)
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

  async function search(event?: FormEvent) {
    event?.preventDefault()
    setDiscoveryMode('github')
    discoveryModeRef.current = 'github'
    retry.current = () => { void search() }
    try {
      const name = repositoryName(query)
      if (name) { openRepo(name); return }
    } catch (e) { setError(errorMessage(e)); return }
    window.history.replaceState(null, '', '#contribute')
    await discover({ q: query, language, beginner, collection, sort, ...filters })
  }

  function quickSearch(issueLabel: string, topic = '') {
    window.history.replaceState(null, '', '#contribute')
    const next = { ...defaultFilters, issue_label: issueLabel, topic }
    setFilters(next); setBeginner(false); setQuery(''); setLanguage(''); setCollection('active'); setSort('updated')
    void discover({ q: '', language: '', beginner: false, collection: 'active', sort: 'updated', ...next })
  }

  async function discover(options: DiscoveryOptions, nextPage = 1) {
    if (Date.now() < retryAtRef.current) return
    retry.current = () => { void discover(options, nextPage) }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(nextPage === 1)
    setLoadingMore(nextPage > 1)
    setLoadingRepo(null)
    setError(null)
    setAnalysis(null)
    if (nextPage === 1) { setSearched(false); setRepos([]); hasResults.current = false }
    try {
      const result = await api.searchContributions(options, nextPage, request.signal)
      if (!request.signal.aborted) {
        startCooldown(result.retry_after ?? 0)
        setRepos(previous => nextPage === 1 ? result.repos : [...previous, ...result.repos.filter(r => !previous.some(p => p.full_name === r.full_name))])
        setSearched(true); hasResults.current = true
        setApplied(options); setPage(result.page); setHasMore(result.has_more)
        setTotal(result.total_count); setIncomplete(result.incomplete_results)
        setScanned(previous => nextPage === 1 ? result.scanned_count : previous + result.scanned_count)
        setSearchWarnings(previous => nextPage === 1 ? result.warnings : [...previous, ...result.warnings])
        setResultDescription([options.q.trim() || 'All text', options.language || 'All languages', options.topic && `#${options.topic}`, options.issue_label && `Label: ${options.issue_label}`, options.unassigned && 'Unassigned issues', options.license && options.license.toUpperCase(), options.min_stars && `${options.min_stars}+ stars`, options.collection === 'new' && 'Created in last 90 days', options.beginner && 'Good first issues'].filter(Boolean).join(' / '))
      }
    } catch (e) {
      if (!request.signal.aborted) {
        setError(errorMessage(e))
        if (e instanceof ApiError) startCooldown(e.retryAfter)
      }
    }
    finally { if (!request.signal.aborted) { setLoading(false); setLoadingMore(false) } }
  }

  return <div className="space-y-8 px-4 py-8 sm:px-6 sm:py-12">
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-brand-muted via-background to-background p-6 sm:p-9">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand"><Compass className="size-4" /> Find your next contribution</div>
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Your next contribution<br />starts here.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Discover open source projects, understand how they work, and find an issue you can help with. Get AI guidance grounded in repository activity.</p>
      <div className="mt-6 flex gap-2" role="group" aria-label="Discovery mode">
        <Button variant={discoveryMode === 'github' ? 'default' : 'outline'} aria-pressed={discoveryMode === 'github'} onClick={() => { discoveryModeRef.current = 'github'; setDiscoveryMode('github') }}>GitHub search</Button>
        <Button variant={discoveryMode === 'web' ? 'default' : 'outline'} aria-pressed={discoveryMode === 'web'} onClick={() => { cancel(); setError(null); discoveryModeRef.current = 'web'; setDiscoveryMode('web'); window.location.hash = 'contribute' }}>Web discoveries</Button>
      </div>
      {discoveryMode === 'github' && <form onSubmit={search} className="mt-7 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="mr-1 text-muted-foreground">Start with</span>{[{ name: 'First contributions', label: 'good first issue' }, { name: 'Help wanted', label: 'help wanted' }, { name: 'Fix a bug', label: 'bug' }, { name: 'Write documentation', label: 'documentation' }].map(preset => <button key={preset.label} type="button" disabled={loading || cooldown > 0} className="rounded-full border bg-background px-3 py-1.5 text-muted-foreground transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" onClick={() => quickSearch(preset.label)}>{preset.name}</button>)}</div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Topic or repository" className="h-10 bg-background pl-9" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} placeholder="Search a topic, or paste owner/repository" /></div>
          <select aria-label="Programming language" className={cn(fieldClass, 'sm:w-44')} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="">All languages</option>{['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C++', 'C#', 'Ruby', 'Swift', 'Kotlin', 'PHP'].map(l => <option key={l}>{l}</option>)}
          </select>
          <Button type="submit" disabled={loading || !!loadingRepo || cooldown > 0} className="h-10 bg-brand px-5 text-brand-foreground hover:bg-brand/90">{loading ? <LoaderCircle className="animate-spin" /> : <Search />} Find projects</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-muted-foreground">Project collection<select aria-label="Project collection" className={cn(fieldClass, 'mt-1 sm:w-52')} value={collection} onChange={e => setCollection(e.target.value as 'active' | 'new')}><option value="active">Active projects</option><option value="new">New projects (last 90 days)</option></select></label>
          <label className="text-xs text-muted-foreground">Sort projects<select aria-label="Sort projects" className={cn(fieldClass, 'mt-1 sm:w-44')} value={sort} onChange={e => setSort(e.target.value as 'updated' | 'stars')}><option value="updated">Recently updated</option><option value="stars">Most starred</option></select></label>
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={beginner} onChange={e => setBeginner(e.target.checked)} /> Projects with good first issues</label>
        <RepositoryFilters value={filters} onChange={setFilters} />
        <p className="text-xs text-muted-foreground">Repository links open directly. Filters apply to discovery searches.</p>
      </form>}
    </section>

    {cooldown > 0 && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">GitHub search is cooling down. Retry in {cooldown} seconds. Recent results are cached to reduce requests.</p>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error} <Button variant="outline" disabled={cooldown > 0} onClick={() => { if (retry.current) retry.current(); else void search() }}>Retry request</Button> {/token|permission|settings/i.test(error) && <a href="#settings" className="font-medium text-brand underline">Open Settings</a>}</div>}
    {(loading || loadingMore || loadingRepo) && <Button variant="outline" onClick={cancel}>Cancel request</Button>}
    {(loading || loadingRepo) && <div role="status" className="flex items-center gap-3 rounded-xl border p-8 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-brand" />{loadingRepo ? `Reading activity, guidelines, and issues for ${loadingRepo}…` : 'Finding recently active public projects…'}</div>}

    {analysis && !loadingRepo ? <RepositoryDetail key={analysis.repo.full_name} analysis={analysis} onBack={() => { window.location.hash = 'contribute' }} onRefresh={() => inspect(analysis.repo.full_name)} /> : !loading && !loadingRepo && <>
      {discoveryMode === 'web' ? <WebDiscovery onExplore={openRepo} /> : searched ? <section className="space-y-4">
        <div className="flex justify-end">{applied && <Button variant="outline" disabled={loadingMore || cooldown > 0} onClick={() => discover(applied)}>Refresh projects</Button>}</div>
        <p className="text-xs text-muted-foreground">Results for {resultDescription}. Change filters and select Find projects to search again.</p>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Explore opportunities <span className="ml-2 text-sm font-normal text-muted-foreground">{repos.length} projects</span></h2><span className="text-xs text-muted-foreground">Pushed in the last {applied?.activity_days || 90} days</span></div>
        <p role="status" className="text-xs leading-5 text-muted-foreground">{applied?.issue_label || applied?.unassigned ? `${repos.length} matching projects found after checking ${scanned} candidates out of ${total.toLocaleString()} repository matches. ${hasMore ? 'More candidates are available. Load more to continue searching.' : 'Search complete within the browsing limit.'}` : `${total.toLocaleString()} matching repositories. Showing ${repos.length} loaded projects.`}</p>
        {searchWarnings.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p>Some search results could not be verified or loaded. Refresh to retry issue checks after any cooldown.</p><details className="mt-2"><summary className="cursor-pointer text-xs">View details ({searchWarnings.length})</summary>{searchWarnings.map((warning, i) => <p className="mt-1 text-xs" key={i}>{warning}</p>)}</details></div>}
        {repos.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground"><p>No projects match in this batch. {hasMore ? 'Load the next batch or broaden your filters.' : 'Try a broader topic or turn off the good first issue filter.'}</p><Button variant="outline" className="mt-4" onClick={() => quickSearch('')}>Clear filters and explore</Button></div> : <RepositoryGroups repos={repos} beginner={applied?.beginner ?? false} onExplore={openRepo} onTopic={topic => quickSearch('', topic)} />}
        {incomplete && <p role="status" className="text-xs text-muted-foreground">GitHub returned partial search results. Retry the search or narrow your filters.</p>}
        {hasMore && applied && <div className="flex justify-center"><Button variant="outline" className="h-10" disabled={loadingMore || cooldown > 0} onClick={() => discover(applied, page + 1)}>{loadingMore ? <LoaderCircle className="animate-spin" /> : null}{loadingMore ? 'Loading projects...' : 'Load more projects'}</Button></div>}
        {!hasMore && total > 300 && <p className="text-center text-xs text-muted-foreground">Browsing is limited to the first 300 matches. Narrow your topic or language to explore more.</p>}
      </section> : <section className="grid gap-5 sm:grid-cols-3">
        {[{ icon: Compass, title: 'Find your fit', text: 'Search by topic and language, with an optional good first issue filter.' }, { icon: GitPullRequest, title: 'Understand the project', text: 'See recent activity, sampled merge rates, and time to merge before you start.' }, { icon: BookOpen, title: 'Contribute with context', text: 'Read the rules, explore issue labels, and get a personalized starting plan.' }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-xl border p-6"><Icon className="mb-4 size-5 text-brand" /><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}
      </section>}
    </>}
  </div>
}

function RepositoryDetail({ analysis: a, onBack, onRefresh }: { analysis: ContributionAnalysis; onBack: () => void; onRefresh: () => void }) {
  const [label, setLabel] = useState('')
  const [issueQuery, setIssueQuery] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const issues = a.issues.filter(i => (!label || i.labels.includes(label)) && (!unassigned || i.assignees.length === 0) && `${i.title} ${i.number}`.toLowerCase().includes(issueQuery.trim().replace(/^#/, '').toLowerCase()))
  const metrics = a.acceptance

  return <section className="space-y-6">
    <Button variant="ghost" onClick={onBack}><ArrowLeft /> Back to discovery</Button>
    <Button variant="outline" onClick={onRefresh}>Refresh repository</Button>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2"><Tag active>{a.state}</Tag>{a.repo.language && <Tag>{a.repo.language}</Tag>}<Tag>{a.repo.license || 'License not detected'}</Tag></div><h2 className="break-words text-2xl font-semibold tracking-tight">{a.repo.full_name}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{a.repo.description}</p><p className="mt-2 text-xs text-muted-foreground">Checked {new Date(a.fetched_at).toLocaleString()} · Last push {date(a.repo.pushed_at)}</p></div>
      <div className="flex flex-wrap items-start gap-2"><SaveProjectButton repo={a.repo} /><Button variant="outline" asChild><a href={a.repo.html_url} target="_blank" rel="noreferrer">GitHub <ArrowUpRight /></a></Button></div>
    </div>
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
      <p className="text-xs leading-5 text-muted-foreground">Showing {a.issues.length} of {a.issue_total ?? 'unknown'} open issues, ordered by recent updates. Labels and filters apply to the loaded sample. {a.issues_capped && 'More or incomplete results are available on GitHub.'}</p>
      <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Filter issue titles or numbers" className="h-10 sm:flex-1" value={issueQuery} onChange={e => setIssueQuery(e.target.value)} placeholder="Filter issues by title or number…" /><select aria-label="Issue label" className={cn(fieldClass, 'sm:w-64')} value={label} onChange={e => setLabel(e.target.value)}><option value="">All issue labels</option>{a.labels.map(l => <option key={l.name} value={l.name}>{l.name} ({l.count})</option>)}</select></div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={unassigned} onChange={e => setUnassigned(e.target.checked)} /> Unassigned issues only</label>
      <div className="flex flex-wrap gap-2">{(label || issueQuery || unassigned) && <Button variant="outline" size="sm" onClick={() => { setLabel(''); setIssueQuery(''); setUnassigned(false) }}>Clear issue filters</Button>}{a.labels.slice(0, 12).map(l => <button key={l.name} aria-pressed={label === l.name} onClick={() => setLabel(label === l.name ? '' : l.name)} className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"><Tag active={label === l.name}>{l.name} · {l.count}</Tag></button>)}</div>
      {!a.issues_available ? <p className="py-6 text-center text-sm text-muted-foreground">Issues could not be loaded. Use the GitHub link to inspect current issues.</p> : issues.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No issues in this sample match your filters. Try another label or view all issues on GitHub.</p> : <div className="divide-y">{issues.map(i => <article key={i.number} className="py-4"><a className="text-sm font-medium hover:text-brand hover:underline" href={i.html_url} target="_blank" rel="noreferrer"><span className="mr-2 text-muted-foreground">#{i.number}</span>{i.title}<ArrowUpRight className="ml-1 inline size-3.5" /></a><div className="mb-2 mt-3 flex flex-wrap gap-1.5">{i.labels.length ? i.labels.map(l => <Tag key={l} active={['good first issue', 'help wanted'].includes(l.toLowerCase())}>{l}</Tag>) : <Tag>No labels</Tag>}</div><p className="text-xs text-muted-foreground">{i.assignees.length ? `Assigned to ${i.assignees.join(', ')}` : 'Unassigned'} · {i.comments} comments · Updated {date(i.updated_at)}</p></article>)}</div>}
    </section>
  </section>
}

function Advisor({ fullName }: { fullName: string }) {
  const [config, setConfig] = useState<ContributionConfig | null>(null)
  const [provider, setProvider] = useState<AIProvider>('openai')
  const selected = config?.providers.find(p => p.id === provider)
  const [skills, setSkills] = useState('')
  const [experience, setExperience] = useState('beginner')
  const [advice, setAdvice] = useState<ContributionAdvice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [configLoading, setConfigLoading] = useState(true)
  useEffect(() => {
    let active = true
    const request = new AbortController()
    setConfigLoading(true); setError(null)
    api.getContributionConfig(request.signal).then(c => { if (active) { setConfig(c); setProvider(c.default_provider) } }).catch(() => { if (active) setError('Could not check AI availability. Retry below.') }).finally(() => { if (active) setConfigLoading(false) })
    return () => { active = false; request.abort(); controller.current?.abort() }
  }, [configAttempt])

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (loading) return
    const request = new AbortController()
    controller.current = request
    setLoading(true); setError(null); setAdvice(null)
    try {
      const result = await api.getContributionAdvice(fullName, skills, experience, provider, request.signal)
      if (!request.signal.aborted) setAdvice(result)
    } catch (e) { if (!request.signal.aborted) setError(errorMessage(e)) }
    finally { if (!request.signal.aborted) setLoading(false) }
  }

  return <section className="rounded-xl border border-brand/25 bg-brand-muted/30 p-5">
    <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-brand" /> Your contribution advisor</h3>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Get a starting plan based on your skills, repository rules, and current issues.</p>
    {configLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading AI providers…</p>}
    {!configLoading && !config && <Button variant="outline" className="mt-3" onClick={() => setConfigAttempt(n => n + 1)}>Retry AI setup</Button>}
    {config && <label className="mt-4 block text-xs font-medium">AI provider<select aria-label="AI provider" className={cn(fieldClass, 'mt-1.5')} value={provider} disabled={loading} onChange={e => { setProvider(e.target.value as AIProvider); setAdvice(null); setError(null) }}>{config.providers.map(p => <option key={p.id} value={p.id}>{p.label} · {p.model}{p.configured ? '' : ' (needs setup)'}</option>)}</select></label>}
    {selected?.configured === false ? <p className="mt-4 rounded-lg border bg-background p-3 text-sm leading-6">{selected.label} needs setup. <a href="#settings" className="font-medium text-brand underline">Add an API key in Settings</a>, or select another provider.</p> : config && <form onSubmit={generate} className="mt-4 space-y-3">
      <label className="block text-xs font-medium">Your skills and interests<Input className="mt-1.5 h-10 bg-background" value={skills} maxLength={1000} onChange={e => { setSkills(e.target.value); setAdvice(null) }} placeholder="e.g. Python, testing, accessibility" disabled={loading} /></label>
      <label className="block text-xs font-medium">Contribution experience<select className={cn(fieldClass, 'mt-1.5')} value={experience} onChange={e => { setExperience(e.target.value); setAdvice(null) }} disabled={loading}><option value="beginner">New to open source</option><option value="intermediate">Some contribution experience</option><option value="experienced">Experienced contributor</option></select></label>
      <p className="text-xs leading-5 text-muted-foreground">{provider === 'ollama' ? 'Uses your configured Ollama server (local by default). Start Ollama and pull the configured model first. No automatic cloud fallback.' : `Generating a plan sends these preferences and public repository evidence to ${selected?.label}.`}</p>
      <Button type="submit" disabled={loading} className="h-10 bg-brand text-brand-foreground hover:bg-brand/90">{loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{loading ? 'Reading the evidence…' : 'Suggest where to start'}</Button>
      {loading && <Button type="button" variant="outline" className="ml-2" onClick={() => { controller.current?.abort(); setLoading(false); setError('Stopped waiting for advice. The provider may finish processing the request. You can retry or change providers.') }}>Stop waiting</Button>}
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {advice && <div className="mt-5 space-y-3 border-t border-brand/20 pt-4" aria-live="polite">{advice.text.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="whitespace-pre-wrap text-sm leading-6">{p}</p>)}<p className="text-xs text-muted-foreground">AI-generated · {advice.provider} / {advice.model} · Evidence checked {new Date(advice.fetched_at).toLocaleString()}. Verify requirements in the linked project documents.</p></div>}
  </section>
}
