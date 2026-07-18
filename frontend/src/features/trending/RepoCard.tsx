import { ArrowUp, ArrowDown, Minus, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { languageColor } from '@/lib/languageColors'
import type { TrendingRepo } from '@/lib/api'

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground">
        new
      </span>
    )
  }
  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <ArrowUp className="size-3" strokeWidth={2.5} />
        {delta.toLocaleString()}
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
        <ArrowDown className="size-3" strokeWidth={2.5} />
        {Math.abs(delta).toLocaleString()}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="size-3" />0
    </span>
  )
}

export function RepoCard({ repo, rank }: { repo: TrendingRepo; rank: number }) {
  const [owner, name] = repo.repo_full_name.split('/')

  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-all',
        'hover:border-brand/40 hover:shadow-sm',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tabular-nums text-muted-foreground/60">
          #{rank}
        </span>
        <DeltaPill delta={repo.star_delta} />
      </div>

      <div className="min-w-0 truncate text-[15px] font-medium">
        <span className="text-muted-foreground">{owner}/</span>
        <span className="text-foreground group-hover:text-brand">{name}</span>
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
    </a>
  )
}
