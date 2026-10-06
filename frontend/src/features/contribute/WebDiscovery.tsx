import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Globe, LoaderCircle, RefreshCw, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type WebDiscoveryResults } from '@/lib/api'
import { SaveProjectButton } from './SaveProjectButton'

const selectClass = 'h-10 rounded-lg border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-brand'

export function WebDiscovery({ onExplore }: { onExplore: (name: string) => void }) {
  const [result, setResult] = useState<WebDiscoveryResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [language, setLanguage] = useState('')
  const [sort, setSort] = useState('source')
  const [limit, setLimit] = useState(12)
  const controller = useRef<AbortController | null>(null)

  async function load() {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true); setError(null)
    try {
      const data = await api.getWebDiscoveries(request.signal)
      if (!request.signal.aborted) { setResult(data); setLimit(12) }
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load web discoveries.')
    } finally { if (!request.signal.aborted) setLoading(false) }
  }

  useEffect(() => {
    void load()
    return () => controller.current?.abort()
  }, [])

  const repos = (result?.repos ?? []).filter(repo =>
    (!source || repo.sources.some(s => s.id === source)) &&
    (!language || repo.language === language) &&
    `${repo.full_name} ${repo.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  if (sort === 'stars') repos.sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1))
  const languages = [...new Set((result?.repos ?? []).map(repo => repo.language).filter((l): l is string => !!l))].sort()

  return <section className="space-y-5" aria-label="Web discoveries">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Globe className="size-5 text-brand" /> Web discoveries</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Popular and newcomer-friendly projects found on public web pages. Open a project to check its current contribution rules, activity, and issues.</p>
      </div>
      <Button variant="outline" disabled={loading} onClick={load}><RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh sources</Button>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Browsing these listings needs no token. Project analysis uses your GitHub token in Settings. Stars and descriptions are reported by the source; listing a project does not confirm that it currently accepts contributions.</p>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{error} <Button variant="outline" onClick={load}>Retry</Button></div>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Reading discovery sources...</p>}
    {result && <>
      <div className="grid gap-3 sm:grid-cols-2">
        {result.sources.map(s => <div key={s.id} className="rounded-xl border bg-muted/20 p-4 text-xs leading-5">
          <a className="font-semibold text-brand underline" href={s.url} target="_blank" rel="noreferrer">{s.name} <ArrowUpRight className="inline size-3" /></a>
          <p className="mt-1 text-muted-foreground">{s.repo_count} projects{s.sample_capped ? ' (source sample limit)' : ''} · {s.fetched_at ? `Fetched ${new Date(s.fetched_at).toLocaleString()}` : 'No successful fetch yet'}{s.stale ? ' · Older cached results' : s.cached ? ' · Cached' : ''}</p>
          {s.error && <p role="status" className="mt-2 text-amber-700 dark:text-amber-400">{s.error}{s.stale ? ' Showing the last successful fetch.' : ''}</p>}
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">Sources refresh at most every {Math.round(result.cache_seconds / 60)} minutes. Unavailable sources can retry after one minute.</p>
      <div className="flex flex-wrap gap-3">
        <Input className="h-10 min-w-48 flex-1" aria-label="Filter web projects" placeholder="Filter by project or description" value={query} onChange={e => { setQuery(e.target.value); setLimit(12) }} />
        <select className={selectClass} aria-label="Web source" value={source} onChange={e => { setSource(e.target.value); setLimit(12) }}><option value="">All sources</option>{result.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className={selectClass} aria-label="Web project language" value={language} onChange={e => { setLanguage(e.target.value); setLimit(12) }}><option value="">All languages</option>{languages.map(l => <option key={l}>{l}</option>)}</select>
        <select className={selectClass} aria-label="Sort web projects" value={sort} onChange={e => { setSort(e.target.value); setLimit(12) }}><option value="source">Source order</option><option value="stars">Most starred</option></select>
      </div>
      <p className="text-xs text-muted-foreground">{repos.length} matching projects in the fetched sample</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {repos.slice(0, limit).map(repo => <article key={repo.full_name.toLowerCase()} className="relative flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
          <SaveProjectButton repo={repo} corner />
          <div className="flex min-h-5 flex-wrap gap-2 pr-9">{repo.sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="rounded-md bg-brand-muted px-2 py-1 text-xs text-brand hover:underline">{s.signal}{s.stale ? ' (cached)' : ''}</a>)}</div>
          <h3 className="break-words font-semibold">{repo.full_name}</h3>
          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{repo.description || 'No description provided by the source.'}</p>
          <div className="mt-auto flex justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><span>{repo.language || 'Language unknown'}</span><span className="flex items-center gap-1"><Star className="size-3.5" /> {repo.stars === null ? 'Stars unknown' : `~${repo.stars.toLocaleString()} stars`}</span></div>
          <Button variant="outline" className="h-10 justify-between" onClick={() => onExplore(repo.full_name)}>Explore contribution fit <ArrowUpRight /></Button>
          <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-center text-xs text-muted-foreground underline">View project on GitHub</a>
        </article>)}
      </div>
      {repos.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{result.repos.length ? 'No projects match these filters. Try another source or language.' : 'No projects are available from these sources. Check the source status above and retry later.'}</p>}
      {repos.length > limit && <div className="flex justify-center"><Button variant="outline" onClick={() => setLimit(n => n + 12)}>Show more projects</Button></div>}
    </>}
  </section>
}
