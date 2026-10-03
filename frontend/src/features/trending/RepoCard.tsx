import { useState } from 'react'
import { ArrowUp, ArrowDown, Minus, Star, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { languageColor } from '@/lib/languageColors'
import { type TrendingRepo } from '@/lib/api'

/** Star gain/loss since the last feed update. `null` = no earlier snapshot to compare against. */
function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span
        title="First seen this cycle — no earlier snapshot to compare against"
        className="rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        new
      </span>
    )
  }

  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown
  const label =
    delta === 0
      ? 'No new stars since the last update'
      : `${Math.abs(delta).toLocaleString()} stars ${delta > 0 ? 'gained' : 'lost'} since the last update`

  return (
    <span
      title={label}
      className={cn(
        'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        delta === 0 && 'bg-muted font-medium text-muted-foreground',
        delta > 0 && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        delta < 0 && 'bg-red-500/10 text-red-600 dark:text-red-400',
      )}
    >
      <Icon className="size-3" strokeWidth={delta === 0 ? 2 : 2.5} aria-hidden />
      <span aria-hidden>{Math.abs(delta).toLocaleString()}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Movement in trending rank since the last feed update. Positive = climbed. */
function RankChange({ delta }: { delta: number | null }) {
  if (!delta) return null
  const up = delta > 0
  const label = up
    ? `Up ${delta} place${delta === 1 ? '' : 's'} since the last update`
    : `Down ${Math.abs(delta)} place${delta === -1 ? '' : 's'} since the last update`
  return (
    <span
      title={label}
      className={cn(
        'flex items-center gap-0.5 text-[10px] font-bold tabular-nums transition-colors',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      {up ? (
        <ArrowUp className="size-2.5" strokeWidth={3} aria-hidden />
      ) : (
        <ArrowDown className="size-2.5" strokeWidth={3} aria-hidden />
      )}
      <span aria-hidden>{Math.abs(delta)}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function RepoCard({
  repo,
  rank,
  rankDelta,
  onSave,
}: {
  repo: TrendingRepo
  rank: number
  rankDelta: number | null
  onSave: () => void
}) {
  const [owner, name] = repo.repo_full_name.split('/')
  const [saving, setSaving] = useState(false)

  const save = () => {
    if (saving) return
    setSaving(true)
    onSave() // parent removes the card optimistically and shows an undo toast
  }

  return (
    <div className="group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-[color,box-shadow,border-color] duration-200 hover:border-brand/40 hover:shadow-sm focus-within:ring-2 focus-within:ring-brand/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">#{rank}</span>
          <RankChange delta={rankDelta} />
        </div>
        <div className="flex items-center gap-2">
          <DeltaPill delta={repo.star_delta} />
          <button
            onClick={save}
            disabled={saving}
            aria-label={`Save ${repo.repo_full_name}`}
            title="Save to your dashboard"
            className="relative z-10 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-brand disabled:cursor-default before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          >
            <Bookmark className={cn('size-4', saving && 'animate-pulse')} />
          </button>
        </div>
      </div>

      {/* Stretched link: makes the whole card open the repo, while the save button (z-10) stays clickable. */}
      <a
        href={repo.html_url}
        target="_blank"
        rel="noreferrer"
        title={repo.repo_full_name}
        className="min-w-0 truncate text-[15px] font-medium after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="text-muted-foreground">{owner}/</span>
        <span className="text-foreground group-hover:text-brand">{name}</span>
      </a>

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
