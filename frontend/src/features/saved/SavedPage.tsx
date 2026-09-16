import { useEffect, useState } from 'react'
import { Star, BookmarkX, Bookmark } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { languageColor } from '@/lib/languageColors'
import { api, type SavedRepo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { contributionLink } from '@/features/contribute/navigation'

function SavedCard({ repo, onRemove }: { repo: SavedRepo; onRemove: (name: string) => void }) {
  const [owner, name] = repo.repo_full_name.split('/')
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setRemoving(true)
    setError(null)
    try {
      await api.unsaveRepo(repo.repo_full_name)
      onRemove(repo.repo_full_name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this project. Try again.')
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

      {error && <p role="alert" className="relative z-10 text-sm text-destructive">{error}</p>}
      <Button variant="outline" className="relative z-10 mt-auto" asChild><a href={contributionLink(repo.repo_full_name)}>Explore contribution fit</a></Button>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setError(null)
    api
      .getSaved()
      .then(setRepos)
      .catch((e: Error) => setError(e.message))
  }, [attempt])

  const handleRemove = (fullName: string) => {
    setRepos((prev) => prev?.filter((r) => r.repo_full_name !== fullName) ?? null)
  }

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Saved" description="Your bookmarked projects from discovery and trending." />

      {error && <div role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Retry saved projects</Button></div>}

      {!repos && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {repos && repos.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Bookmark className="size-6 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing saved yet. Save a project from Contribute or bookmark one in Trending.
          </p>
          <Button asChild><a href="#contribute">Discover projects</a></Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {repos?.map((repo) => (
          <SavedCard key={repo.repo_full_name} repo={repo} onRemove={handleRemove} />
        ))}
      </div>
    </div>
  )
}
