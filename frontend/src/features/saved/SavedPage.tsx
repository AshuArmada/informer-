import { useEffect, useState } from 'react'
import { Star, BookmarkX, Bookmark } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { languageColor } from '@/lib/languageColors'
import { api, type SavedRepo } from '@/lib/api'

function SavedCard({ repo, onRemove }: { repo: SavedRepo; onRemove: (name: string) => void }) {
  const [owner, name] = repo.repo_full_name.split('/')
  const [removing, setRemoving] = useState(false)

  const remove = async () => {
    setRemoving(true)
    try {
      await api.unsaveRepo(repo.repo_full_name)
      onRemove(repo.repo_full_name)
    } catch {
      setRemoving(false)
    }
  }

  return (
    <div className="group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-[color,box-shadow,border-color] duration-200 hover:border-brand/40 hover:shadow-sm focus-within:ring-2 focus-within:ring-brand/50">
      <div className="flex items-start justify-between">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-[15px] font-medium after:absolute after:inset-0 focus-visible:outline-none"
        >
          <span className="text-muted-foreground">{owner}/</span>
          <span className="text-foreground group-hover:text-brand">{name}</span>
        </a>
        <button
          onClick={remove}
          disabled={removing}
          aria-label={`Remove ${repo.repo_full_name}`}
          title="Remove from saved"
          className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        >
          <BookmarkX className="size-4" />
        </button>
      </div>

      {repo.description && (
        <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{repo.description}</p>
      )}

      <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: languageColor(repo.language) }}
            />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="size-3.5" />
          {repo.stars.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

export function SavedPage() {
  const [repos, setRepos] = useState<SavedRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getSaved()
      .then(setRepos)
      .catch((e: Error) => setError(e.message))
  }, [])

  const handleRemove = (fullName: string) => {
    setRepos((prev) => prev?.filter((r) => r.repo_full_name !== fullName) ?? null)
  }

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Saved" description="Repositories you've bookmarked from the trending feed." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!repos && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {repos && repos.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Bookmark className="size-6 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing saved yet. Hit the bookmark icon on a repo in the Trending feed to keep it here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {repos?.map((repo) => (
          <SavedCard key={repo.repo_full_name} repo={repo} onRemove={handleRemove} />
        ))}
      </div>
    </div>
  )
}
