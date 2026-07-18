import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { XCircle, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { languageColor } from '@/lib/languageColors'
import { api, type TrendingRepo, type TrendingResponse } from '@/lib/api'
import { useTrendingStream, type StreamStatus } from '@/hooks/useTrendingStream'
import { navigateTo } from '@/hooks/useHashRoute'
import { useToast } from '@/components/ui/toast'
import { RepoCard } from '@/features/trending/RepoCard'

const FEED_COUNT_KEY = 'informer-feed-count'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

/** Re-render every 30s so the "updated X ago" label keeps counting between SSE events. */
function useTicker(intervalMs: number) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
}

function LiveIndicator({ status, updatedAt }: { status: StreamStatus; updatedAt: string | null }) {
  useTicker(30_000)
  const isLive = status === 'open'
  const label = isLive ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="relative flex size-2">
          {isLive && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              isLive ? 'bg-emerald-500' : 'bg-muted-foreground/50',
            )}
          />
        </span>
        {label}
      </span>
      <span className="text-muted-foreground/70">Updated {timeAgo(updatedAt)}</span>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-brand/40 bg-brand-muted text-brand'
          : 'border-transparent bg-muted/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function LanguageFilter({
  languages,
  selected,
  onSelect,
}: {
  languages: [string, number][]
  selected: string | null
  onSelect: (lang: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip active={selected === null} onClick={() => onSelect(null)}>
        All
      </Chip>
      {languages.map(([lang, count]) => (
        <Chip key={lang} active={selected === lang} onClick={() => onSelect(lang)}>
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: languageColor(lang) }}
          />
          {lang}
          <span className="tabular-nums opacity-60">{count}</span>
        </Chip>
      ))}
    </div>
  )
}

/** Re-insert a repo at (roughly) its original slot, skipping if it's somehow already present. */
function reinsert(repos: TrendingRepo[], repo: TrendingRepo, index: number): TrendingRepo[] {
  if (repos.some((r) => r.repo_full_name === repo.repo_full_name)) return repos
  const next = repos.slice()
  next.splice(Math.min(index, next.length), 0, repo)
  return next
}

function initialSkeletonCount(): number {
  const stored = Number(localStorage.getItem(FEED_COUNT_KEY))
  if (Number.isFinite(stored) && stored >= 3 && stored <= 30) return Math.round(stored)
  return 9
}

export function TrendingPage() {
  const [data, setData] = useState<TrendingResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedLang, setSelectedLang] = useState<string | null>(null)
  const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map())
  const [skeletonCount] = useState(initialSkeletonCount)
  const prevRanksRef = useRef<Map<string, number>>(new Map())
  const { toast } = useToast()

  // Apply an authoritative feed update (initial fetch or SSE), computing rank movement
  // against the previous server ordering so local edits (save/undo) don't fake a delta.
  const applyServerData = useCallback((payload: TrendingResponse) => {
    const deltas = new Map<string, number>()
    const nextRanks = new Map<string, number>()
    payload.repos.forEach((repo, i) => {
      const rank = i + 1
      nextRanks.set(repo.repo_full_name, rank)
      const prev = prevRanksRef.current.get(repo.repo_full_name)
      if (prev != null && prev !== rank) deltas.set(repo.repo_full_name, prev - rank)
    })
    prevRanksRef.current = nextRanks
    setRankDeltas(deltas)
    setData(payload)
    if (payload.repos.length > 0) {
      localStorage.setItem(FEED_COUNT_KEY, String(payload.repos.length))
    }
  }, [])

  const { status } = useTrendingStream(applyServerData)

  useEffect(() => {
    api
      .getTrending()
      .then(applyServerData)
      .catch((err: Error) => setLoadError(err.message))
  }, [applyServerData])

  // Drop the language filter if the selected language disappears from the feed.
  useEffect(() => {
    if (selectedLang && !data?.repos.some((r) => r.language === selectedLang)) {
      setSelectedLang(null)
    }
  }, [data, selectedLang])

  const undoSave = useCallback(
    async (repo: TrendingRepo, index: number) => {
      try {
        await api.unsaveRepo(repo.repo_full_name)
        setData((prev) => (prev ? { ...prev, repos: reinsert(prev.repos, repo, index) } : prev))
      } catch (err) {
        toast({
          variant: 'destructive',
          title: "Couldn't undo",
          description: (err as Error).message,
        })
      }
    },
    [toast],
  )

  const handleSave = useCallback(
    async (repo: TrendingRepo, index: number) => {
      // Optimistically remove — saved repos are excluded from trending.
      setData((prev) =>
        prev
          ? { ...prev, repos: prev.repos.filter((r) => r.repo_full_name !== repo.repo_full_name) }
          : prev,
      )
      try {
        await api.saveRepo({
          repo_full_name: repo.repo_full_name,
          description: repo.description,
          language: repo.language,
          html_url: repo.html_url,
          stars: repo.stars,
        })
        toast({
          title: 'Saved',
          description: repo.repo_full_name,
          action: { label: 'Undo', onClick: () => undoSave(repo, index) },
        })
      } catch (err) {
        // Roll the card back into place and report the failure.
        setData((prev) => (prev ? { ...prev, repos: reinsert(prev.repos, repo, index) } : prev))
        toast({
          variant: 'destructive',
          title: "Couldn't save repo",
          description: (err as Error).message,
        })
      }
    },
    [toast, undoSave],
  )

  const languages = useMemo<[string, number][]>(() => {
    const counts = new Map<string, number>()
    data?.repos.forEach((r) => {
      if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [data])

  // Rank is the true feed position; filtering never renumbers it.
  const rankedRepos = (data?.repos ?? []).map((repo, i) => ({ repo, rank: i + 1, index: i }))
  const visibleRepos = selectedLang
    ? rankedRepos.filter((r) => r.repo.language === selectedLang)
    : rankedRepos

  const missingToken = !!data?.error && /no github token/i.test(data.error)

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Trending"
        description="GitHub repositories ranked by star velocity."
        actions={<LiveIndicator status={status} updatedAt={data?.updated_at ?? null} />}
      />

      {loadError && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>Couldn't reach the backend</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {missingToken ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <KeyRound className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Connect GitHub to see trending repos</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Informer needs a personal access token to query the GitHub API.
            </p>
          </div>
          <Button onClick={() => navigateTo('settings')}>Go to Settings</Button>
        </div>
      ) : (
        data?.error && (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertTitle>Trending feed unavailable</AlertTitle>
            <AlertDescription>{data.error}</AlertDescription>
          </Alert>
        )
      )}

      {!data && !loadError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {languages.length > 1 && (
        <LanguageFilter languages={languages} selected={selectedLang} onSelect={setSelectedLang} />
      )}

      {data && data.repos.length === 0 && !data.error && (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No trending repos yet — waiting for the first poll cycle.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleRepos.map(({ repo, rank, index }) => (
          <RepoCard
            key={repo.repo_full_name}
            repo={repo}
            rank={rank}
            rankDelta={rankDeltas.get(repo.repo_full_name) ?? null}
            onSave={() => handleSave(repo, index)}
          />
        ))}
      </div>
    </div>
  )
}
