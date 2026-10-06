import { ArrowUpRight, CircleDot, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ContributionRepo } from '@/lib/api'
import { languageColor } from '@/lib/languageColors'
import { SaveProjectButton } from './SaveProjectButton'

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Unknown'

export function DiscoveryCard({ repo, beginner, onExplore, onTopic }: { repo: ContributionRepo; beginner: boolean; onExplore: () => void; onTopic?: (topic: string) => void }) {
  const recentlyActive = repo.pushed_at && Date.now() - new Date(repo.pushed_at).getTime() <= 30 * 86400000
  return <article className="relative flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-brand/40">
    <SaveProjectButton repo={repo} corner />
    <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 pr-9 text-xs">
      <span className="rounded-full bg-brand-muted px-2 py-1 text-brand">{recentlyActive ? 'Active in last 30 days' : `Last push ${date(repo.pushed_at)}`}</span>
      <span className="flex items-center gap-1 text-muted-foreground"><Star className="size-3.5" /> {repo.stars.toLocaleString()}</span>
    </div>
    <div><h3 className="break-words font-semibold">{repo.full_name}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{repo.description || 'Explore this project’s contribution opportunities.'}</p></div>
    <div className="flex flex-wrap gap-1.5">{beginner && <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">Good first issues available</span>}{repo.matching_issues !== undefined && <span className="rounded-md bg-brand-muted px-2 py-1 text-xs text-brand">{repo.matching_issues.toLocaleString()} matching open issues</span>}{repo.topics.slice(0, 4).map(t => onTopic ? <button key={t} type="button" onClick={() => onTopic(t)} title={`Find repositories tagged ${t}`} className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-brand-muted hover:text-brand focus-visible:ring-2 focus-visible:ring-brand">#{t}</button> : <span key={t} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{t}</span>)}</div>
    <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-3 border-t pt-4 text-xs">
      <div><dt className="text-muted-foreground">Language</dt><dd className="mt-1 flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: languageColor(repo.language || '') }} />{repo.language || 'Not specified'}</dd></div>
      <div><dt className="text-muted-foreground">Open issues + PRs</dt><dd className="mt-1 flex items-center gap-1"><CircleDot className="size-3" />{repo.open_issues_and_prs.toLocaleString()}</dd></div>
      <div><dt className="text-muted-foreground">Last push</dt><dd className="mt-1">{date(repo.pushed_at)}</dd></div>
      <div><dt className="text-muted-foreground">Created</dt><dd className="mt-1">{date(repo.created_at)}</dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">License</dt><dd className="mt-1">{repo.license && repo.license !== 'NOASSERTION' ? repo.license : 'Review license on GitHub'}</dd></div>
    </dl>
    <Button variant="outline" className="h-10 justify-between" onClick={onExplore}>Explore contribution fit <ArrowUpRight /></Button>
    <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-center text-xs text-muted-foreground underline hover:text-brand">View project on GitHub</a>
  </article>
}
