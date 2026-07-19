import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Check, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type GitHubRepo } from '@/lib/api'

export function RepoPicker({ onTrackedChange }: { onTrackedChange: () => void }) {
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    api
      .getRepos()
      .then(setRepos)
      .catch((e: Error) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    if (!repos) return []
    const q = query.trim().toLowerCase()
    if (!q) return repos
    return repos.filter((r) => r.full_name.toLowerCase().includes(q))
  }, [repos, query])

  const trackedCount = repos?.filter((r) => r.is_tracked).length ?? 0

  const toggle = async (repo: GitHubRepo) => {
    setPending(repo.full_name)
    try {
      if (repo.is_tracked) {
        await api.untrackRepo(repo.owner, repo.name)
      } else {
        await api.trackRepo(repo.owner, repo.name)
      }
      setRepos((prev) =>
        prev?.map((r) =>
          r.full_name === repo.full_name ? { ...r, is_tracked: !r.is_tracked } : r,
        ) ?? null,
      )
      onTrackedChange()
    } catch {
      // Leave state as-is; the row just won't toggle.
    } finally {
      setPending(null)
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search your repositories"
            placeholder="Search your repositories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{trackedCount} tracked</span>
      </div>

      <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">
        {!repos &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3">
              <Skeleton className="h-5 w-2/3" />
            </div>
          ))}

        {repos && filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">No repositories match.</p>
        )}

        {filtered.map((repo) => (
          <div key={repo.full_name} className="flex items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium">{repo.full_name}</span>
              {repo.private && (
                <Badge variant="outline" className="gap-1 text-xs font-normal">
                  <Lock className="size-3" /> private
                </Badge>
              )}
            </div>
            <button
              onClick={() => toggle(repo)}
              disabled={pending === repo.full_name}
              aria-pressed={repo.is_tracked}
              aria-label={`${repo.is_tracked ? 'Untrack' : 'Track'} ${repo.full_name}`}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                repo.is_tracked
                  ? 'border-brand/30 bg-brand-muted text-brand'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {pending === repo.full_name ? (
                <Loader2 className="size-3 animate-spin" />
              ) : repo.is_tracked ? (
                <Check className="size-3" />
              ) : (
                <Plus className="size-3" />
              )}
              {repo.is_tracked ? 'Tracked' : 'Track'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
