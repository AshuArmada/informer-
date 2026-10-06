import { useState } from 'react'
import { Layers3 } from 'lucide-react'
import type { ContributionRepo } from '@/lib/api'
import { DiscoveryCard } from './DiscoveryCard'

export function RepositoryGroups({ repos, beginner, onExplore, onTopic }: { repos: ContributionRepo[]; beginner: boolean; onExplore: (name: string) => void; onTopic: (topic: string) => void }) {
  const [groupBy, setGroupBy] = useState('none')
  const groups = new Map<string, ContributionRepo[]>()
  for (const repo of repos) {
    const key = groupBy === 'language' ? repo.language || 'Language not specified'
      : groupBy === 'license' ? repo.license || 'License not detected'
      : groupBy === 'topic' ? repo.topics[0] || 'No topic tags' : 'All projects'
    groups.set(key, [...(groups.get(key) || []), repo])
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
      <span className="text-xs text-muted-foreground">{repos.length} loaded projects · Group this collection to find your fit</span>
      <label className="flex items-center gap-2 text-xs font-medium"><Layers3 className="size-4 text-brand" /> Group by<select aria-label="Group repositories" className="h-9 rounded-lg border bg-background px-2 focus-visible:ring-2 focus-visible:ring-brand" value={groupBy} onChange={e => setGroupBy(e.target.value)}><option value="none">No grouping</option><option value="language">Language</option><option value="topic">First topic tag</option><option value="license">License</option></select></label>
    </div>
    <div className={groupBy === 'none' ? '' : 'grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3'}>{[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => <section key={name} className="space-y-3">
      {groupBy !== 'none' && <h3 className="flex items-center gap-2 text-sm font-semibold">{name}<span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs text-brand">{items.length}</span></h3>}
      <div className={groupBy === 'none' ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>{items.map(repo => <DiscoveryCard key={repo.full_name} repo={repo} beginner={beginner} onExplore={() => onExplore(repo.full_name)} onTopic={onTopic} />)}</div>
    </section>)}</div>
  </div>
}
