import { useEffect, useState } from 'react'
import { XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { api, type TrendingResponse } from '@/lib/api'
import { useTrendingStream, type StreamStatus } from '@/hooks/useTrendingStream'
import { RepoCard } from '@/features/trending/RepoCard'

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

function LiveIndicator({ status, updatedAt }: { status: StreamStatus; updatedAt: string | null }) {
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

export function TrendingPage() {
  const [data, setData] = useState<TrendingResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { status } = useTrendingStream(setData)

  useEffect(() => {
    api
      .getTrending()
      .then(setData)
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  const handleSaved = (fullName: string) => {
    // Saved repos are excluded from trending; drop it from the list immediately.
    setData((prev) =>
      prev ? { ...prev, repos: prev.repos.filter((r) => r.repo_full_name !== fullName) } : prev,
    )
  }

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

      {data?.error && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>Trending feed unavailable</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      )}

      {!data && !loadError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && data.repos.length === 0 && !data.error && (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No trending repos yet — waiting for the first poll cycle.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.repos.map((repo, i) => (
          <RepoCard key={repo.repo_full_name} repo={repo} rank={i + 1} onSaved={handleSaved} />
        ))}
      </div>
    </div>
  )
}
